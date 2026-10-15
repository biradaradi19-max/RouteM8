-- ============================================================================
-- Route M8 — Critical Security Fix 2: Handover PIN Protection
-- Migration: 20261014000001_handover_pin_security.sql
--
-- Objectives:
-- 1. Remove plaintext PIN storage from delivery_security and delivery_requests.
-- 2. Safely backfill pin_hash for existing records to preserve active handovers.
-- 3. Fix failed-attempt tracking by ensuring attempts persist even on mismatch
--    (eliminating rollback via unhandled exception).
-- 4. Enforce 5-attempt limit with 15-minute cooldown lockout.
-- 5. Harden server-side validation (4-digit regex, participant authorization,
--    FOR UPDATE concurrency locking, replay prevention).
-- 6. Secure function execution grants and revoke direct client access to hashes.
-- ============================================================================

-- Ensure cryptographic extension is available
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- ============================================================================
-- 1. SCHEMA MIGRATION: REMOVE PLAINTEXT PIN STORAGE & ADD LOCKOUT COLUMNS
-- ============================================================================

-- Ensure delivery_requests has general corridor area columns
alter table public.delivery_requests add column if not exists pickup_area text;
alter table public.delivery_requests add column if not exists dropoff_area text;
alter table public.delivery_requests add column if not exists estimated_detour_minutes integer default 5;

-- Ensure delivery_details table exists for private street addresses & coordinates
create table if not exists public.delivery_details (
  request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  contact_instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.delivery_details enable row level security;

-- Ensure delivery_security has all required security tracking columns
alter table public.delivery_security
  add column if not exists pin_hash text,
  add column if not exists attempts integer not null default 0,
  add column if not exists last_attempt_at timestamptz,
  add column if not exists locked_until timestamptz,
  add column if not exists created_at timestamptz not null default now();

-- Backfill and preserve address, coordinate, and pin_hash data from legacy schema
do $$
begin
  -- 1. Preserve and backfill address and coordinate data into delivery_details before modifying schema
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_requests' and column_name = 'pickup_address'
  ) then
    insert into public.delivery_details (
      request_id, pickup_address, pickup_lat, pickup_lng, dropoff_address, dropoff_lat, dropoff_lng
    )
    select
      id,
      pickup_address,
      coalesce(pickup_lat, 37.4275),
      coalesce(pickup_lng, -122.1668),
      dropoff_address,
      coalesce(dropoff_lat, 37.3861),
      coalesce(dropoff_lng, -122.0839)
    from public.delivery_requests
    where pickup_address is not null
    on conflict (request_id) do update set
      pickup_address = excluded.pickup_address,
      pickup_lat = excluded.pickup_lat,
      pickup_lng = excluded.pickup_lng,
      dropoff_address = excluded.dropoff_address,
      dropoff_lat = excluded.dropoff_lat,
      dropoff_lng = excluded.dropoff_lng
    where public.delivery_details.pickup_address is null;

    -- Drop legacy NOT NULL constraints from delivery_requests so create_delivery_request_secure()
    -- can insert discovery-only records without NOT NULL constraint violations
    alter table public.delivery_requests
      alter column pickup_address drop not null,
      alter column pickup_lat drop not null,
      alter column pickup_lng drop not null,
      alter column dropoff_address drop not null,
      alter column dropoff_lat drop not null,
      alter column dropoff_lng drop not null;
  end if;

  -- 2. Backfill pin_hash from delivery_security.handover_pin if the column still exists
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_security' and column_name = 'handover_pin'
  ) then
    update public.delivery_security
    set pin_hash = encode(extensions.digest(trim(handover_pin), 'sha256'), 'hex')
    where (pin_hash is null or pin_hash = '') and handover_pin is not null;
  end if;

  -- 3. Backfill from legacy delivery_requests.handover_pin if missing in delivery_security
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_requests' and column_name = 'handover_pin'
  ) then
    insert into public.delivery_security (request_id, pin_hash, attempts)
    select id, encode(extensions.digest(trim(handover_pin), 'sha256'), 'hex'), 0
    from public.delivery_requests
    where handover_pin is not null
    on conflict (request_id) do update
    set pin_hash = excluded.pin_hash
    where public.delivery_security.pin_hash is null or public.delivery_security.pin_hash = '';
  end if;
end $$;

-- Populate pickup_area and dropoff_area from delivery_details if currently blank
update public.delivery_requests r
set 
  pickup_area = coalesce(r.pickup_area, (select split_part(d.pickup_address, ',', 1) from public.delivery_details d where d.request_id = r.id), 'Corridor Origin'),
  dropoff_area = coalesce(r.dropoff_area, (select split_part(d.dropoff_address, ',', 1) from public.delivery_details d where d.request_id = r.id), 'Corridor Destination')
where r.pickup_area is null or r.dropoff_area is null;

-- Enforce NOT NULL on pin_hash now that data is backfilled
alter table public.delivery_security alter column pin_hash set not null;

-- Permanently drop plaintext handover_pin columns from all tables
alter table public.delivery_security drop column if exists handover_pin;
alter table public.delivery_requests drop column if exists handover_pin;

-- ============================================================================
-- 2. RESTRICT DIRECT ACCESS TO DELIVERY_SECURITY TABLE
-- ============================================================================

-- Drop old RLS policies that referenced plaintext handover_pin
drop policy if exists "Only requester can view handover security pin" on public.delivery_security;
drop policy if exists "Requesters can initialize delivery security" on public.delivery_security;

-- Keep RLS enabled
alter table public.delivery_security enable row level security;

-- Revoke direct permissions from standard client roles:
-- Clients must NEVER read cryptographic pin hashes or modify security counters directly.
-- All operations are performed exclusively via SECURITY DEFINER functions.
revoke all on public.delivery_security from public, anon, authenticated;


-- ============================================================================
-- 3. RECREATE CREATE_DELIVERY_REQUEST_SECURE (STORES ONLY CRYPTOGRAPHIC HASH)
-- ============================================================================

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

  -- Strictly validate 4-digit numeric format on server
  if v_pin !~ '^[0-9]{4}$' then
    raise exception 'Handover PIN must be exactly 4 numeric digits.';
  end if;

  if p_compensation < 0 then
    raise exception 'Compensation must be a non-negative value.';
  end if;

  v_pickup_area := split_part(p_pickup_address, ',', 1);
  v_dropoff_area := split_part(p_dropoff_address, ',', 1);

  -- Set transaction-local trusted context flag
  perform set_config('routem8.trusted_context', 'on', true);

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

  -- Insert private security credentials: ONLY STORE SHA-256 HASH
  insert into public.delivery_security (
    request_id,
    pin_hash,
    attempts,
    last_attempt_at,
    locked_until
  ) values (
    v_request_id,
    encode(extensions.digest(v_pin, 'sha256'), 'hex'),
    0,
    null,
    null
  );

  -- Return initial request metadata to the requester who initiated creation
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


-- ============================================================================
-- 4. HARDENED COMPLETE_DELIVERY_HANDOVER FUNCTION
-- ============================================================================

create or replace function public.complete_delivery_handover(
  p_request_id uuid,
  p_pin text
)
returns jsonb as $$
declare
  v_request record;
  v_security record;
  v_clean_pin text := trim(coalesce(p_pin, ''));
  v_submitted_hash text;
  v_new_attempts integer;
  v_locked_until timestamptz;
begin
  -- 1. Authentication Check
  if auth.uid() is null then
    return jsonb_build_object(
      'success', false,
      'error', 'Authentication required.'
    );
  end if;

  -- 2. Format Validation (Strictly 4 digits)
  if v_clean_pin !~ '^[0-9]{4}$' then
    return jsonb_build_object(
      'success', false,
      'error', 'Invalid PIN format. PIN must be exactly 4 numeric digits.'
    );
  end if;

  -- 3. Atomically lock delivery_requests row to prevent race conditions & replay
  select * into v_request
  from public.delivery_requests
  where id = p_request_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Delivery request not found.'
    );
  end if;

  -- 4. Replay Prevention: Check terminal and invalid states
  if v_request.status = 'completed' then
    return jsonb_build_object(
      'success', false,
      'error', 'Delivery is already completed.'
    );
  end if;

  if v_request.status = 'cancelled' then
    return jsonb_build_object(
      'success', false,
      'error', 'Cannot complete a cancelled delivery.'
    );
  end if;

  if v_request.status not in ('matched', 'in_transit') then
    return jsonb_build_object(
      'success', false,
      'error', format('Delivery must be in matched or in_transit state to complete (current: %s).', v_request.status)
    );
  end if;

  -- 5. Strict Participant Authorization:
  -- Only the assigned transporter can complete handover. Requesters cannot complete their own delivery.
  if v_request.transporter_id is null or v_request.transporter_id <> auth.uid() then
    return jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Only the assigned transporter can complete handover.'
    );
  end if;

  if v_request.requester_id = auth.uid() then
    return jsonb_build_object(
      'success', false,
      'error', 'Unauthorized: Requester cannot complete their own delivery handover.'
    );
  end if;

  -- 6. Atomically lock delivery_security row
  select * into v_security
  from public.delivery_security
  where request_id = p_request_id
  for update;

  if not found then
    return jsonb_build_object(
      'success', false,
      'error', 'Security record not found for this delivery.'
    );
  end if;

  -- 7. Lockout & Cooldown Enforcement
  -- If lockout cooldown has expired, reset failed attempts counter and clear lockout
  if v_security.locked_until is not null and v_security.locked_until <= now() then
    update public.delivery_security
    set
      attempts = 0,
      locked_until = null
    where request_id = p_request_id;

    v_security.attempts := 0;
    v_security.locked_until := null;
  elsif v_security.locked_until is null and v_security.attempts >= 5 and
        v_security.last_attempt_at is not null and v_security.last_attempt_at <= now() - interval '15 minutes' then
    -- Cooldown elapsed for attempt-based lockout without explicit locked_until timestamp
    update public.delivery_security
    set
      attempts = 0,
      locked_until = null
    where request_id = p_request_id;

    v_security.attempts := 0;
    v_security.locked_until := null;
  end if;

  -- If currently locked and lockout cooldown has not expired:
  if v_security.locked_until is not null and v_security.locked_until > now() then
    return jsonb_build_object(
      'success', false,
      'error', 'Delivery handover verification is locked due to too many failed attempts. Please wait for cooldown or contact community support.',
      'locked', true,
      'locked_until', v_security.locked_until
    );
  end if;

  -- If 5 or more failed attempts recorded without an active future locked_until, lock for 15 minutes
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

  -- 8. Cryptographic Hash Verification
  v_submitted_hash := encode(extensions.digest(v_clean_pin, 'sha256'), 'hex');

  if v_submitted_hash <> v_security.pin_hash then
    -- PIN mismatch: increment attempts and persist transaction without rolling back
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
        'attempts', v_new_attempts,
        'attempts_remaining', 0,
        'locked', true
      );
    else
      return jsonb_build_object(
        'success', false,
        'error', 'Invalid 4-digit handover PIN. Please verify with the recipient.',
        'attempts', v_new_attempts,
        'attempts_remaining', 5 - v_new_attempts,
        'locked', false
      );
    end if;
  end if;

  -- 9. PIN IS VALID: Complete Handover & Reset Attempt Counters
  perform set_config('routem8.trusted_context', 'on', true);

  -- Update delivery status to completed
  update public.delivery_requests
  set
    status = 'completed',
    updated_at = now()
  where id = p_request_id;

  -- Clear attempts counter on successful verification
  update public.delivery_security
  set
    attempts = 0,
    last_attempt_at = now(),
    locked_until = null
  where request_id = p_request_id;

  -- Update requester profile stats
  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.requester_id;

  -- Update transporter profile stats
  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    completed_commutes = completed_commutes + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.transporter_id;

  return jsonb_build_object(
    'success', true,
    'status', 'completed',
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- Revoke execute from public/anon, grant exclusively to authenticated
revoke execute on function public.complete_delivery_handover(uuid, text) from public, anon;
grant execute on function public.complete_delivery_handover(uuid, text) to authenticated;


-- ============================================================================
-- 5. HARDEN AUTH USER CREATION TRIGGER WITH FIXED SEARCH_PATH
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
  v_verification text;
begin
  -- Sanitize role strictly: only allow non-privileged participant roles
  if new.raw_user_meta_data->>'role' in ('requester', 'transporter') then
    v_role := new.raw_user_meta_data->>'role';
  else
    v_role := 'both';
  end if;

  -- Safe verification default: only email_verified if confirmed by Supabase auth
  if new.email_confirmed_at is not null then
    v_verification := 'email_verified';
  else
    v_verification := 'unverified';
  end if;

  insert into public.profiles (
    id, 
    email, 
    full_name, 
    avatar_url, 
    role, 
    verification_status,
    trust_score,
    completed_deliveries,
    completed_commutes,
    account_status,
    rating
  )
  values (
    new.id,
    new.email,
    coalesce(nullif(pg_catalog.trim(new.raw_user_meta_data->>'full_name'), ''), pg_catalog.split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', null),
    v_role,
    v_verification,
    50, -- Safe neutral starting trust score
    0,
    0,
    'active',
    5.00
  )
  on conflict (id) do update set
    email = excluded.email,
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

