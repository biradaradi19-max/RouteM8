-- ============================================================================
-- ROUTE M8 — TRUSTED CONTEXT SECURITY HARDENING
-- Migration: 20261014000002_trusted_context_hardening.sql
--
-- Security Fixes Implemented:
-- 1. Remove Broad Admin Bypasses:
--    Delivery lifecycle transitions (matched, in_transit, completed) and transporter
--    assignments strictly enforce verified RPC state transitions. PIN completion
--    mandatorily requires valid 4-digit PIN verification even for administrators.
-- 2. Exact Action and Target Matching:
--    verify_trusted_context requires exact non-null (action, target_id) matching.
--    The 'all' wildcard is completely removed to prevent token substitution attacks.
-- 3. Atomic Server Secret Initialization:
--    Server-secret initialization uses atomic INSERT ... ON CONFLICT (key_name) DO NOTHING
--    followed by SELECT, guaranteeing an existing secret is NEVER overwritten during
--    fallback initialization or concurrent transactions.
-- 4. Strict Privilege Isolation:
--    Trusted-context helpers (set_trusted_context, verify_trusted_context, clear_trusted_context)
--    and server_context_keys are inaccessible to anon and authenticated roles. Only authorized
--    SECURITY DEFINER RPCs (executing as definer/service_role) can invoke them.
-- 5. Safe search_path & Explicit Object Qualification:
--    All functions specify SET search_path = public, extensions, pg_temp; and explicitly
--    qualify cryptographic extension calls as extensions.digest, extensions.hmac, etc.
-- ============================================================================

-- Ensure extensions schema and pgcrypto are available
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- ============================================================================
-- 1. SECURE SERVER CONTEXT KEY STORE (NO CLIENT ACCESS)
-- ============================================================================

create table if not exists public.server_context_keys (
  key_name text primary key,
  secret_value bytea not null default extensions.gen_random_bytes(32),
  created_at timestamptz not null default now()
);

-- Enable RLS and strictly revoke all access from public, anon, and authenticated
alter table public.server_context_keys enable row level security;
revoke all on public.server_context_keys from public, anon, authenticated;
grant all on public.server_context_keys to service_role;

-- Atomic initialization: insert default keys if absent; NEVER overwrite on conflict
insert into public.server_context_keys (key_name, secret_value)
values 
  ('internal_trigger_guard', extensions.gen_random_bytes(32)),
  ('handover_pin_pepper', extensions.gen_random_bytes(32))
on conflict (key_name) do nothing;

-- Internal helper to compute keyed HMAC peppered hash for handover PIN
create or replace function public.hash_handover_pin(p_pin text, p_request_id uuid)
returns text as $$
declare
  v_pepper bytea;
begin
  select secret_value into v_pepper
  from public.server_context_keys
  where key_name = 'handover_pin_pepper';

  if v_pepper is null then
    insert into public.server_context_keys (key_name, secret_value)
    values ('handover_pin_pepper', extensions.gen_random_bytes(32))
    on conflict (key_name) do nothing;

    select secret_value into v_pepper
    from public.server_context_keys
    where key_name = 'handover_pin_pepper';
  end if;

  return encode(
    extensions.hmac(
      p_pin || ':' || p_request_id::text,
      v_pepper,
      'sha256'
    ),
    'hex'
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.hash_handover_pin(text, uuid) from public, anon, authenticated;
grant execute on function public.hash_handover_pin(text, uuid) to service_role;

-- ============================================================================
-- 2. INTERNAL CRYPTOGRAPHIC TRUSTED CONTEXT HELPERS
-- ============================================================================

-- Establish a cryptographically signed, transaction-bound context with exact target
create or replace function public.set_trusted_context(p_action text, p_target_id uuid)
returns void as $$
declare
  v_secret bytea;
  v_sig text;
begin
  if p_action is null or trim(p_action) = '' then
    raise exception 'Action cannot be null or empty in set_trusted_context.';
  end if;

  if p_target_id is null then
    raise exception 'Target ID cannot be null in set_trusted_context. Wildcards are forbidden.';
  end if;

  select secret_value into v_secret
  from public.server_context_keys
  where key_name = 'internal_trigger_guard';

  -- Fallback initialization: atomic, never overwrites an existing secret
  if v_secret is null then
    insert into public.server_context_keys (key_name, secret_value)
    values ('internal_trigger_guard', extensions.gen_random_bytes(32))
    on conflict (key_name) do nothing;

    select secret_value into v_secret
    from public.server_context_keys
    where key_name = 'internal_trigger_guard';
  end if;

  -- Compute HMAC bound strictly to exact action, exact target row ID, and current txid
  v_sig := encode(
    extensions.hmac(
      p_action || ':' || p_target_id::text || ':' || txid_current()::text,
      v_secret,
      'sha256'
    ),
    'hex'
  );

  perform set_config('routem8.trusted_signature', v_sig, true);
  perform set_config('routem8.trusted_action', p_action, true);
  perform set_config('routem8.trusted_target', p_target_id::text, true);
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- Revoke execute from public/anon/authenticated; permit only service_role
revoke execute on function public.set_trusted_context(text, uuid) from public, anon, authenticated;
grant execute on function public.set_trusted_context(text, uuid) to service_role;

-- Internal helper to clear trusted context after execution
create or replace function public.clear_trusted_context()
returns void as $$
begin
  perform set_config('routem8.trusted_signature', '', true);
  perform set_config('routem8.trusted_action', '', true);
  perform set_config('routem8.trusted_target', '', true);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.clear_trusted_context() from public, anon, authenticated;
grant execute on function public.clear_trusted_context() to service_role;

-- Internal verification helper: requires exact action, exact target, valid HMAC, and call stack match
create or replace function public.verify_trusted_context(p_action text, p_target_id uuid)
returns boolean as $$
declare
  v_secret bytea;
  v_expected_sig text;
  v_actual_sig text;
  v_stack text;
begin
  -- 1. Fast path: service role only (admins must also execute via authorized RPCs)
  if current_user = 'service_role' or auth.jwt()->>'role' = 'service_role' then
    return true;
  end if;

  -- Disallow nulls or empty parameters (wildcards forbidden)
  if p_action is null or p_target_id is null then
    return false;
  end if;

  -- 2. Validate transaction-local signature existence
  v_actual_sig := current_setting('routem8.trusted_signature', true);
  if v_actual_sig is null or v_actual_sig = '' then
    return false;
  end if;

  -- Exact action match required (no wildcards)
  if current_setting('routem8.trusted_action', true) <> p_action then
    return false;
  end if;

  -- Exact target match required (no wildcards)
  if current_setting('routem8.trusted_target', true) <> p_target_id::text then
    return false;
  end if;

  -- 3. Verify HMAC signature against server secret and current transaction ID
  select secret_value into v_secret
  from public.server_context_keys
  where key_name = 'internal_trigger_guard';

  if v_secret is null then
    return false;
  end if;

  v_expected_sig := encode(
    extensions.hmac(
      p_action || ':' || p_target_id::text || ':' || txid_current()::text,
      v_secret,
      'sha256'
    ),
    'hex'
  );

  if v_actual_sig <> v_expected_sig then
    return false;
  end if;

  -- 4. Defense-in-depth: Call stack verification via pg_context
  get diagnostics v_stack = pg_context;
  if v_stack !~ 'PL/pgSQL function (public\.)?(complete_delivery_handover|accept_delivery_request|start_delivery_transit|cancel_delivery_request|create_delivery_request_secure|handle_verification_approval|review_verification_request|handle_user_email_confirmed)\(' then
    return false;
  end if;

  return true;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.verify_trusted_context(text, uuid) from public, anon, authenticated;
grant execute on function public.verify_trusted_context(text, uuid) to service_role;

-- ============================================================================
-- 3. HARDENED TRIGGER GUARDS (NO BROAD ADMIN BYPASS)
-- ============================================================================

-- 3.1 Hardened Delivery Requests Guard
create or replace function public.check_delivery_request_updates()
returns trigger as $$
begin
  -- Service role maintenance updates
  if current_user = 'service_role' or auth.jwt()->>'role' = 'service_role' then
    new.updated_at := now();
    return new;
  end if;

  -- Cryptographically verified server action from authorized SECURITY DEFINER RPC
  if public.verify_trusted_context(
       case
         when new.status = 'matched' then 'accept_delivery'
         when new.status = 'in_transit' then 'start_transit'
         when new.status = 'completed' then 'complete_delivery'
         when new.status = 'cancelled' then 'cancel_delivery'
         else 'delivery_update'
       end,
       old.id
     ) then
    new.updated_at := now();
    return new;
  end if;

  -- Block client modification of requester_id (even for admins)
  if (new.requester_id is distinct from old.requester_id) then
    raise exception 'Cannot modify requester_id.';
  end if;

  -- Block direct client modification of transporter_id (must use accept_delivery_request)
  if (new.transporter_id is distinct from old.transporter_id) then
    raise exception 'Direct transporter assignment is forbidden. Use accept_delivery_request().';
  end if;

  -- Block compensation changes after matching
  if (new.compensation is distinct from old.compensation) and old.status <> 'open' then
    raise exception 'Cannot modify compensation after request has been accepted.';
  end if;

  -- Restrict direct status manipulation
  if (new.status is distinct from old.status) then
    if new.status = 'completed' then
      -- Mandatory: Even admins cannot bypass PIN verification; must use complete_delivery_handover()
      raise exception 'Direct completion is forbidden. Use complete_delivery_handover() with valid PIN.';
    end if;
    if new.status = 'matched' then
      raise exception 'Direct matching is forbidden. Use accept_delivery_request().';
    end if;
    if new.status = 'in_transit' then
      raise exception 'Direct transit update is forbidden. Use start_delivery_transit().';
    end if;
    if new.status = 'cancelled' then
      -- Explicit authorized admin action: admins or requester can cancel if request is open or matched
      if old.status not in ('open', 'matched') then
        raise exception 'Cannot cancel delivery request from status %.', old.status;
      end if;
      if auth.uid() <> old.requester_id and not public.is_admin() then
        raise exception 'Unauthorized: Only requester or administrator can cancel this delivery.';
      end if;
    else
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- 3.2 Hardened Delivery Requests Insert Guard & Policy
create or replace function public.check_delivery_request_inserts()
returns trigger as $$
begin
  -- Service role maintenance inserts
  if current_user = 'service_role' or auth.jwt()->>'role' = 'service_role' then
    return new;
  end if;

  if new.requester_id <> auth.uid() then
    raise exception 'Unauthorized: You can only create delivery requests for yourself.';
  end if;

  if new.status <> 'open' then
    raise exception 'New delivery requests must start with status open.';
  end if;

  if new.transporter_id is not null then
    raise exception 'Transporter cannot be assigned on request creation. Use accept_delivery_request().';
  end if;

  if new.compensation < 0 then
    raise exception 'Compensation must be a non-negative value.';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_delivery_request_insert_guard on public.delivery_requests;
create trigger on_delivery_request_insert_guard
  before insert on public.delivery_requests
  for each row execute procedure public.check_delivery_request_inserts();

drop policy if exists "Requesters can create delivery requests" on public.delivery_requests;
create policy "Requesters can create delivery requests"
  on public.delivery_requests for insert
  to authenticated
  with check (
    auth.uid() = requester_id and
    status = 'open' and
    transporter_id is null and
    compensation >= 0
  );

-- 3.3 Hardened Profile Integrity Guard
create or replace function public.check_profile_updates()
returns trigger as $$
begin
  -- Service role maintenance updates
  if current_user = 'service_role' or auth.jwt()->>'role' = 'service_role' then
    new.updated_at := now();
    return new;
  end if;

  -- Server RPC updates with verified cryptographic context:
  -- 1) update_profile_stats (from complete_delivery_handover)
  -- 2) approve_verification (from handle_verification_approval)
  -- 3) email_verification (from handle_user_email_confirmed)
  if public.verify_trusted_context('update_profile_stats', old.id) or
     public.verify_trusted_context('approve_verification', old.id) or
     public.verify_trusted_context('email_verification', old.id) then
    new.updated_at := now();
    return new;
  end if;

  -- Ordinary updates & Admin direct updates:
  if (new.id is distinct from old.id) or (new.email is distinct from old.email) then
    raise exception 'Modifying immutable identity fields (id, email) is forbidden.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Direct role escalation or modification is forbidden.';
  end if;

  -- Admin can modify account_status (suspend/activate), non-admins cannot
  if new.account_status is distinct from old.account_status and not public.is_admin() then
    raise exception 'Modifying account status is restricted to administrators.';
  end if;

  -- Protected metrics CANNOT be modified directly even by admin (must go through review_verification_request or complete_delivery_handover)
  if (old.trust_score is distinct from new.trust_score) or
     (old.verification_status is distinct from new.verification_status) or
     (old.completed_deliveries is distinct from new.completed_deliveries) or
     (old.completed_commutes is distinct from new.completed_commutes) or
     (old.rating is distinct from new.rating) then
    raise exception 'Modifying protected metrics (trust score, verification status, ratings, delivery stats) is forbidden.';
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 4. HARDENED RPC IMPLEMENTATIONS (EXACT TARGET CRYPTOGRAPHIC CONTEXT)
-- ============================================================================

-- 4.1 Accept Delivery Match
create or replace function public.accept_delivery_request(p_request_id uuid)
returns jsonb as $$
declare
  v_request record;
  v_profile record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid();

  if not found or v_profile.account_status <> 'active' then
    raise exception 'Active profile required to accept delivery requests.';
  end if;

  select * into v_request
  from public.delivery_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Delivery request not found.';
  end if;

  if v_request.status <> 'open' then
    raise exception 'Delivery request is not available for matching (current status: %).', v_request.status;
  end if;

  if v_request.requester_id = auth.uid() then
    raise exception 'Cannot accept your own delivery request.';
  end if;

  -- Authorize state update via cryptographic trusted context with exact target ID
  perform public.set_trusted_context('accept_delivery', p_request_id);

  update public.delivery_requests
  set
    transporter_id = auth.uid(),
    status = 'matched',
    updated_at = now()
  where id = p_request_id;

  perform public.clear_trusted_context();

  return jsonb_build_object(
    'success', true,
    'status', 'matched',
    'transporter_id', auth.uid(),
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.accept_delivery_request(uuid) from public, anon;
grant execute on function public.accept_delivery_request(uuid) to authenticated;

-- 4.2 Start Delivery Transit
create or replace function public.start_delivery_transit(p_request_id uuid)
returns jsonb as $$
declare
  v_request record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.delivery_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Delivery request not found.';
  end if;

  if v_request.transporter_id <> auth.uid() then
    raise exception 'Unauthorized: Only the assigned transporter can start transit.';
  end if;

  if v_request.status <> 'matched' then
    raise exception 'Delivery must be in matched state before transit (current status: %).', v_request.status;
  end if;

  -- Authorize state update via cryptographic trusted context with exact target ID
  perform public.set_trusted_context('start_transit', p_request_id);

  update public.delivery_requests
  set
    status = 'in_transit',
    updated_at = now()
  where id = p_request_id;

  perform public.clear_trusted_context();

  return jsonb_build_object(
    'success', true,
    'status', 'in_transit',
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.start_delivery_transit(uuid) from public, anon;
grant execute on function public.start_delivery_transit(uuid) to authenticated;

-- 4.3 Create Delivery Request Secure RPC (Keyed HMAC Pepper PIN Storage)
create or replace function public.create_delivery_request_secure(
  p_title text,
  p_description text,
  p_category text,
  p_pickup_address text,
  p_pickup_lat double precision,
  p_pickup_lng double precision,
  p_dropoff_address text,
  p_dropoff_lat double precision,
  p_dropoff_lng double precision,
  p_item_size text,
  p_compensation numeric,
  p_urgency text,
  p_needed_by text,
  p_handover_pin text,
  p_weight_estimate_kg numeric default null,
  p_contact_instructions text default null
)
returns jsonb as $$
declare
  v_request_id uuid;
  v_pin text := trim(coalesce(p_handover_pin, ''));
  v_pickup_area text;
  v_dropoff_area text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'Handover PIN must be exactly 4 numeric digits.';
  end if;

  if p_compensation < 0 then
    raise exception 'Compensation must be a non-negative value.';
  end if;

  v_pickup_area := split_part(p_pickup_address, ',', 1);
  v_dropoff_area := split_part(p_dropoff_address, ',', 1);

  -- Insert public discovery record (WITHOUT plaintext PIN)
  insert into public.delivery_requests (
    requester_id,
    title,
    description,
    category,
    item_size,
    weight_estimate_kg,
    compensation,
    urgency,
    needed_by,
    status,
    pickup_area,
    dropoff_area
  ) values (
    auth.uid(),
    p_title,
    p_description,
    p_category,
    p_item_size,
    p_weight_estimate_kg,
    p_compensation,
    p_urgency,
    p_needed_by,
    'open',
    v_pickup_area,
    v_dropoff_area
  ) returning id into v_request_id;

  -- Insert private exact addresses & coordinates
  insert into public.delivery_details (
    request_id,
    pickup_address,
    pickup_lat,
    pickup_lng,
    dropoff_address,
    dropoff_lat,
    dropoff_lng,
    contact_instructions
  ) values (
    v_request_id,
    p_pickup_address,
    p_pickup_lat,
    p_pickup_lng,
    p_dropoff_address,
    p_dropoff_lat,
    p_dropoff_lng,
    p_contact_instructions
  );

  -- Insert private security credentials: STORE KEYED HMAC PEPPER HASH
  insert into public.delivery_security (
    request_id,
    pin_hash,
    attempts,
    last_attempt_at,
    locked_until
  ) values (
    v_request_id,
    public.hash_handover_pin(v_pin, v_request_id),
    0,
    null,
    null
  );

  return jsonb_build_object(
    'id', v_request_id,
    'requester_id', auth.uid(),
    'title', p_title,
    'status', 'open',
    'handover_pin', v_pin,
    'pickup_area', v_pickup_area,
    'dropoff_area', v_dropoff_area,
    'compensation', p_compensation
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.create_delivery_request_secure from public, anon;
grant execute on function public.create_delivery_request_secure to authenticated;

-- 4.4 Complete Delivery Handover (Keyed Pepper HMAC Verification & Legacy Backward Compatibility)
create or replace function public.complete_delivery_handover(p_request_id uuid, p_pin text)
returns jsonb as $$
declare
  v_request record;
  v_security record;
  v_clean_pin text := trim(p_pin);
  v_new_attempts integer;
  v_locked_until timestamptz;
  v_pin_is_valid boolean := false;
begin
  -- 1. Authentication Check
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'Authentication required.');
  end if;

  -- 2. Input Validation (Valid 4-digit numeric string required)
  if v_clean_pin is null or v_clean_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object('success', false, 'error', 'Valid 4-digit handover PIN is required.');
  end if;

  -- 3. Row-level concurrency locking on delivery request
  select * into v_request
  from public.delivery_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Delivery request not found.');
  end if;

  -- 4. Participant Authorization (Assigned transporter only)
  if v_request.transporter_id <> auth.uid() then
    return jsonb_build_object('success', false, 'error', 'Unauthorized: Only the assigned transporter can complete handover.');
  end if;

  -- 5. Lifecycle Precondition
  if v_request.status not in ('matched', 'in_transit') then
    return jsonb_build_object('success', false, 'error', format('Cannot complete delivery from status %s.', v_request.status));
  end if;

  -- 6. Row-level concurrency locking on security record
  select * into v_security
  from public.delivery_security
  where request_id = p_request_id
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'Security record not found for this delivery.');
  end if;

  -- 7. Lockout and Cooldown Evaluation
  if v_security.locked_until is not null then
    if v_security.locked_until > now() then
      return jsonb_build_object(
        'success', false,
        'error', 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.',
        'locked', true
      );
    else
      -- Lockout duration has expired: reset counter and clear lockout before processing this attempt
      update public.delivery_security
      set
        attempts = 0,
        locked_until = null
      where request_id = p_request_id;

      v_security.attempts := 0;
      v_security.locked_until := null;
    end if;
  else
    if v_security.attempts >= 5 then
      update public.delivery_security
      set locked_until = now() + interval '15 minutes'
      where request_id = p_request_id;

      return jsonb_build_object(
        'success', false,
        'error', 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.',
        'locked', true
      );
    end if;
  end if;

  -- 8. Keyed Cryptographic Hash Verification with Pepper & Legacy Backward Compatibility
  if v_security.pin_hash = public.hash_handover_pin(v_clean_pin, p_request_id) then
    v_pin_is_valid := true;
  -- Backward compatibility fallback for legacy in-flight deliveries created under 20261014000001
  elsif v_security.pin_hash = encode(extensions.digest(v_clean_pin, 'sha256'), 'hex') then
    v_pin_is_valid := true;
    -- Transparently upgrade legacy hash to peppered keyed HMAC
    update public.delivery_security
    set pin_hash = public.hash_handover_pin(v_clean_pin, p_request_id)
    where request_id = p_request_id;
  else
    v_pin_is_valid := false;
  end if;

  if not v_pin_is_valid then
    v_new_attempts := v_security.attempts + 1;
    v_locked_until := null;

    if v_new_attempts >= 5 then
      v_locked_until := now() + interval '15 minutes';
    end if;

    update public.delivery_security
    set
      attempts = v_new_attempts,
      last_attempt_at = now(),
      locked_until = v_locked_until
    where request_id = p_request_id;

    if v_new_attempts >= 5 then
      return jsonb_build_object(
        'success', false,
        'error', 'Maximum PIN verification attempts exceeded. Delivery is locked for 15 minutes.',
        'locked', true,
        'attempts_remaining', 0
      );
    else
      return jsonb_build_object(
        'success', false,
        'error', 'Invalid 4-digit handover PIN. Please verify with the recipient.',
        'attempts_remaining', 5 - v_new_attempts
      );
    end if;
  end if;

  -- 9. PIN is Valid: Complete Handover & Update Profile Stats with Exact Target Signatures
  perform public.set_trusted_context('complete_delivery', p_request_id);

  update public.delivery_requests
  set
    status = 'completed',
    updated_at = now()
  where id = p_request_id;

  -- Clear security attempts
  update public.delivery_security
  set
    attempts = 0,
    last_attempt_at = now(),
    locked_until = null
  where request_id = p_request_id;

  -- Update requester profile stats using exact requester UUID
  perform public.set_trusted_context('update_profile_stats', v_request.requester_id);
  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.requester_id;

  -- Update transporter profile stats using exact transporter UUID
  perform public.set_trusted_context('update_profile_stats', v_request.transporter_id);
  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    completed_commutes = completed_commutes + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.transporter_id;

  perform public.clear_trusted_context();

  return jsonb_build_object(
    'success', true,
    'status', 'completed',
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.complete_delivery_handover(uuid, text) from public, anon;
grant execute on function public.complete_delivery_handover(uuid, text) to authenticated;

-- 4.4 Cancel Delivery Request
create or replace function public.cancel_delivery_request(p_request_id uuid)
returns jsonb as $$
declare
  v_request record;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select * into v_request
  from public.delivery_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Delivery request not found.';
  end if;

  if v_request.requester_id <> auth.uid() and not public.is_admin() then
    raise exception 'Unauthorized: Only the requester or administrator can cancel this delivery.';
  end if;

  if v_request.status in ('in_transit', 'completed', 'cancelled') then
    raise exception 'Cannot cancel delivery request from status %.', v_request.status;
  end if;

  -- Authorize state update via cryptographic trusted context with exact request ID
  perform public.set_trusted_context('cancel_delivery', p_request_id);

  update public.delivery_requests
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_request_id;

  perform public.clear_trusted_context();

  return jsonb_build_object(
    'success', true,
    'status', 'cancelled',
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.cancel_delivery_request(uuid) from public, anon;
grant execute on function public.cancel_delivery_request(uuid) to authenticated;

-- 4.5 Server Trigger for Verification Request Approval
create or replace function public.handle_verification_approval()
returns trigger as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    if not public.is_admin() then
      raise exception 'Unauthorized: Only verified administrators can approve verification requests.';
    end if;

    -- Authorize profile metric elevation via cryptographic trusted context with exact user UUID
    perform public.set_trusted_context('approve_verification', new.user_id);

    update public.profiles
    set
      verification_status = case
        when new.verification_type = 'student' then 'student_verified'
        when new.verification_type = 'work' then 'work_verified'
        when new.verification_type = 'gov_id' then 'gov_id_verified'
        else 'email_verified'
      end,
      organization = coalesce(nullif(trim(new.organization_name), ''), organization),
      trust_score = least(100, trust_score + 10),
      updated_at = now()
    where id = new.user_id;

    perform public.clear_trusted_context();
    new.reviewed_at := now();
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    if not public.is_admin() then
      raise exception 'Unauthorized: Only verified administrators can reject verification requests.';
    end if;
    new.reviewed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- 4.6 Review Verification Request RPC
create or replace function public.review_verification_request(
  p_request_id uuid,
  p_action text,
  p_notes text default null
)
returns jsonb as $$
declare
  v_req record;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized: Only administrators can review verification requests.';
  end if;

  if p_action not in ('approved', 'rejected') then
    raise exception 'Invalid verification action. Must be approved or rejected.';
  end if;

  select * into v_req
  from public.verification_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Verification request not found.';
  end if;

  if v_req.status <> 'pending' then
    raise exception 'Verification request is already %.', v_req.status;
  end if;

  update public.verification_requests
  set
    status = p_action,
    reviewer_id = auth.uid(),
    reviewer_notes = p_notes,
    reviewed_at = now(),
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'status', p_action,
    'request_id', p_request_id,
    'reviewed_user_id', v_req.user_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.review_verification_request(uuid, text, text) from public, anon;
grant execute on function public.review_verification_request(uuid, text, text) to authenticated;
