-- ============================================================================
-- ROUTE M8 — CORRECTIVE SECURITY HARDENING MIGRATION
-- Migration: 20261013000001_security_hardening.sql
--
-- Priorities Addressed:
-- 1. Protect delivery request data (split sensitive details & private PIN into dedicated tables with strict RLS)
-- 2. Secure request updates (enforce state machine & prevent unauthorized transporter/compensation/status updates)
-- 3. Fix profile integrity and verification (allow trusted server contexts & admin approval without trigger blocks)
-- 4. Harden administrator functions (safe search_path, explicit object qualification, protect admin_users)
-- 5. Protect sensitive information (handover PIN security, restrict verification evidence, limit location exposure)
-- ============================================================================

-- Enable pgcrypto for server-side cryptographic hashing
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- ============================================================================
-- 1. HARDEN ADMINISTRATOR FUNCTIONS & ADMIN USERS TABLE
-- ============================================================================

-- Ensure admin_users table exists with strict RLS
create table if not exists public.admin_users (
  user_id uuid references auth.users on delete cascade primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);

alter table public.admin_users enable row level security;

-- Harden is_admin() with explicit search_path to prevent hijacking
create or replace function public.is_admin()
returns boolean as $$
begin
  return (
    auth.jwt()->>'role' = 'service_role' or
    coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false) = true or
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp stable;

-- Revoke write permissions from public/authenticated on admin_users table
revoke insert, update, delete on public.admin_users from public, anon, authenticated;
grant select on public.admin_users to authenticated;
grant all on public.admin_users to service_role;

-- Re-create strict RLS policies on admin_users
drop policy if exists "Admins can view admin_users list" on public.admin_users;
drop policy if exists "Only admins or service role can select admin_users" on public.admin_users;
create policy "Only admins or service role can select admin_users"
  on public.admin_users for select
  to authenticated
  using (public.is_admin());

drop policy if exists "Only service role can insert admin_users" on public.admin_users;
create policy "Only service role can insert admin_users"
  on public.admin_users for insert
  to authenticated
  with check (auth.jwt()->>'role' = 'service_role' or (public.is_admin() and auth.uid() <> user_id));

drop policy if exists "Only service role or admins can delete admin_users" on public.admin_users;
create policy "Only service role or admins can delete admin_users"
  on public.admin_users for delete
  to authenticated
  using (auth.jwt()->>'role' = 'service_role' or public.is_admin());


-- ============================================================================
-- 2. SPLIT PRIVATE DELIVERY DETAILS & HANDOVER SECURITY INTO SEPARATE TABLES
-- ============================================================================

-- Add general corridor area columns to delivery_requests if missing
alter table public.delivery_requests add column if not exists pickup_area text;
alter table public.delivery_requests add column if not exists dropoff_area text;
alter table public.delivery_requests add column if not exists estimated_detour_minutes integer default 5;

-- 2.1 Private Delivery Details Table (Exact Street Addresses & Coordinates)
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

-- 2.2 Delivery Security Table (Protected Handover Verification PIN & Cryptographic Hash)
create table if not exists public.delivery_security (
  request_id uuid primary key references public.delivery_requests(id) on delete cascade,
  handover_pin text not null,
  pin_hash text not null,
  attempts integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.delivery_security enable row level security;

-- Backfill data from delivery_requests into delivery_details and delivery_security if columns exist
do $$
begin
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
      coalesce(pickup_lat, 37.42), 
      coalesce(pickup_lng, -122.16), 
      dropoff_address, 
      coalesce(dropoff_lat, 37.38), 
      coalesce(dropoff_lng, -122.08)
    from public.delivery_requests
    where pickup_address is not null
    on conflict (request_id) do nothing;
  end if;

  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'delivery_requests' and column_name = 'handover_pin'
  ) then
    insert into public.delivery_security (
      request_id, handover_pin, pin_hash
    )
    select 
      id, 
      handover_pin, 
      encode(extensions.digest(trim(handover_pin), 'sha256'), 'hex')
    from public.delivery_requests
    where handover_pin is not null
    on conflict (request_id) do nothing;
  end if;
end $$;

-- Populate pickup_area and dropoff_area from existing addresses if blank
update public.delivery_requests r
set 
  pickup_area = coalesce(r.pickup_area, (select split_part(d.pickup_address, ',', 1) from public.delivery_details d where d.request_id = r.id), 'Corridor Origin'),
  dropoff_area = coalesce(r.dropoff_area, (select split_part(d.dropoff_address, ',', 1) from public.delivery_details d where d.request_id = r.id), 'Corridor Destination')
where r.pickup_area is null or r.dropoff_area is null;


-- ============================================================================
-- 3. ROW-LEVEL SECURITY POLICIES FOR DELIVERY DATA PROTECTION
-- ============================================================================

-- 3.1 Public Delivery Requests Table RLS
drop policy if exists "Anyone authenticated can view active and open delivery requests" on public.delivery_requests;
drop policy if exists "Authenticated users can discover delivery requests" on public.delivery_requests;
create policy "Authenticated users can discover delivery requests"
  on public.delivery_requests for select
  to authenticated
  using (
    status = 'open' or
    auth.uid() = requester_id or
    auth.uid() = transporter_id or
    public.is_admin()
  );

drop policy if exists "Requesters can create delivery requests" on public.delivery_requests;
create policy "Requesters can create delivery requests"
  on public.delivery_requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

drop policy if exists "Requesters can update their own requests or accepted transporters can update status" on public.delivery_requests;
drop policy if exists "Requesters can update their own open requests" on public.delivery_requests;
create policy "Requesters can update their own open requests"
  on public.delivery_requests for update
  to authenticated
  using (auth.uid() = requester_id and status = 'open')
  with check (auth.uid() = requester_id and status in ('open', 'cancelled'));

drop policy if exists "Requesters can delete their own open requests" on public.delivery_requests;
create policy "Requesters can delete their own open requests"
  on public.delivery_requests for delete
  to authenticated
  using (auth.uid() = requester_id and status = 'open');

-- 3.2 Private Delivery Details Table RLS
-- Sensitive exact street addresses & coordinates are viewable ONLY by:
-- - The requester who created the request
-- - The assigned transporter ONCE matched (status in matched, in_transit, completed)
-- - Verified administrators
drop policy if exists "Only authorized participants can view delivery details" on public.delivery_details;
create policy "Only authorized participants can view delivery details"
  on public.delivery_details for select
  to authenticated
  using (
    exists (
      select 1 from public.delivery_requests r
      where r.id = delivery_details.request_id and (
        r.requester_id = auth.uid() or
        (r.transporter_id = auth.uid() and r.status in ('matched', 'in_transit', 'completed')) or
        public.is_admin()
      )
    )
  );

drop policy if exists "Requesters can insert delivery details" on public.delivery_details;
create policy "Requesters can insert delivery details"
  on public.delivery_details for insert
  to authenticated
  with check (
    exists (
      select 1 from public.delivery_requests r
      where r.id = delivery_details.request_id and r.requester_id = auth.uid()
    )
  );

drop policy if exists "Requesters can update delivery details while open" on public.delivery_details;
create policy "Requesters can update delivery details while open"
  on public.delivery_details for update
  to authenticated
  using (
    exists (
      select 1 from public.delivery_requests r
      where r.id = delivery_details.request_id and r.requester_id = auth.uid() and r.status = 'open'
    )
  );

-- 3.3 Delivery Security Table RLS
-- The plaintext handover PIN is viewable ONLY by the requester!
-- Transporters CANNOT select or read this table; they verify PIN strictly via complete_delivery_handover()
drop policy if exists "Only requester can view handover security pin" on public.delivery_security;
create policy "Only requester can view handover security pin"
  on public.delivery_security for select
  to authenticated
  using (
    exists (
      select 1 from public.delivery_requests r
      where r.id = delivery_security.request_id and (
        r.requester_id = auth.uid() or
        public.is_admin()
      )
    )
  );

drop policy if exists "Requesters can initialize delivery security" on public.delivery_security;
create policy "Requesters can initialize delivery security"
  on public.delivery_security for insert
  to authenticated
  with check (
    exists (
      select 1 from public.delivery_requests r
      where r.id = delivery_security.request_id and r.requester_id = auth.uid()
    )
  );


-- ============================================================================
-- 4. SERVER FUNCTIONS FOR REQUEST MATCHING, LIFECYCLE & PIN HANDOVER
-- ============================================================================

-- 4.1 Atomic Secure Request Creation RPC
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
  v_pin text := trim(p_handover_pin);
  v_pickup_area text;
  v_dropoff_area text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  if length(v_pin) <> 4 then
    raise exception 'Handover PIN must be exactly 4 digits.';
  end if;

  if p_compensation < 0 then
    raise exception 'Compensation must be a non-negative value.';
  end if;

  v_pickup_area := split_part(p_pickup_address, ',', 1);
  v_dropoff_area := split_part(p_dropoff_address, ',', 1);

  -- Set transaction-local trusted context flag
  perform set_config('routem8.trusted_context', 'on', true);

  -- Insert public discovery record
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

  -- Insert private security credentials
  insert into public.delivery_security (
    request_id,
    handover_pin,
    pin_hash
  ) values (
    v_request_id,
    v_pin,
    encode(extensions.digest(v_pin, 'sha256'), 'hex')
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

-- 4.2 Accept Delivery Match (Server-enforced matching & transporter assignment)
create or replace function public.accept_delivery_request(p_request_id uuid)
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

  if v_request.status <> 'open' or v_request.transporter_id is not null then
    raise exception 'Request is not available for matching (current status: %).', v_request.status;
  end if;

  if v_request.requester_id = auth.uid() then
    raise exception 'Requesters cannot accept their own delivery requests.';
  end if;

  perform set_config('routem8.trusted_context', 'on', true);

  update public.delivery_requests
  set
    transporter_id = auth.uid(),
    status = 'matched',
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'status', 'matched',
    'transporter_id', auth.uid(),
    'request_id', p_request_id
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4.3 Start Delivery Transit
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
    raise exception 'Cannot start transit from status %; request must be in matched state.', v_request.status;
  end if;

  perform set_config('routem8.trusted_context', 'on', true);

  update public.delivery_requests
  set
    status = 'in_transit',
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'status', 'in_transit', 'request_id', p_request_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4.4 Complete Delivery Handover (Cryptographic PIN Verification on Server)
create or replace function public.complete_delivery_handover(p_request_id uuid, p_pin text)
returns jsonb as $$
declare
  v_request record;
  v_security record;
  v_clean_pin text := trim(p_pin);
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
    raise exception 'Unauthorized: Only the assigned transporter can complete handover.';
  end if;

  if v_request.status not in ('matched', 'in_transit') then
    raise exception 'Cannot complete delivery from status %.', v_request.status;
  end if;

  select * into v_security
  from public.delivery_security
  where request_id = p_request_id
  for update;

  if not found then
    raise exception 'Security record not found for this delivery.';
  end if;

  if v_security.attempts >= 5 then
    raise exception 'Maximum PIN verification attempts exceeded. Please contact community support.';
  end if;

  -- Validate submitted PIN against stored hash and value
  if v_clean_pin <> v_security.handover_pin and
     encode(extensions.digest(v_clean_pin, 'sha256'), 'hex') <> v_security.pin_hash then
    update public.delivery_security
    set attempts = attempts + 1
    where request_id = p_request_id;
    raise exception 'Invalid 4-digit handover PIN. Please verify with the recipient.';
  end if;

  perform set_config('routem8.trusted_context', 'on', true);

  -- Mark delivery completed
  update public.delivery_requests
  set
    status = 'completed',
    updated_at = now()
  where id = p_request_id;

  -- Increment counters and calibrate trust score on profiles
  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.requester_id;

  update public.profiles
  set
    completed_deliveries = completed_deliveries + 1,
    completed_commutes = completed_commutes + 1,
    trust_score = least(100, trust_score + 1),
    updated_at = now()
  where id = v_request.transporter_id;

  return jsonb_build_object('success', true, 'status', 'completed', 'request_id', p_request_id);
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- 4.5 Cancel Delivery Request
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
    raise exception 'Unauthorized: Only the requester can cancel this request.';
  end if;

  if v_request.status in ('completed', 'cancelled') then
    raise exception 'Cannot cancel request already in status %.', v_request.status;
  end if;

  perform set_config('routem8.trusted_context', 'on', true);

  update public.delivery_requests
  set
    status = 'cancelled',
    updated_at = now()
  where id = p_request_id;

  return jsonb_build_object('success', true, 'status', 'cancelled', 'request_id', p_request_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 4.6 Trigger Guard to Prevent Direct Client Tampering of Protected Delivery Columns
create or replace function public.check_delivery_request_updates()
returns trigger as $$
begin
  -- Allow trusted server operations and service role
  if current_setting('routem8.trusted_context', true) = 'on' or
     current_user = 'service_role' or
     auth.jwt()->>'role' = 'service_role' or
     public.is_admin() then
    new.updated_at := now();
    return new;
  end if;

  -- Block client modification of requester_id
  if (new.requester_id is distinct from old.requester_id) then
    raise exception 'Cannot modify requester_id.';
  end if;

  -- Block direct client modification of transporter_id
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
      raise exception 'Direct completion is forbidden. Use complete_delivery_handover() with valid PIN.';
    end if;
    if new.status = 'matched' then
      raise exception 'Direct matching is forbidden. Use accept_delivery_request().';
    end if;
    if new.status = 'in_transit' then
      raise exception 'Direct transit update is forbidden. Use start_delivery_transit().';
    end if;
    if new.status <> 'cancelled' or old.status not in ('open', 'matched') then
      raise exception 'Invalid status transition from % to %.', old.status, new.status;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_delivery_request_update_guard on public.delivery_requests;
create trigger on_delivery_request_update_guard
  before update on public.delivery_requests
  for each row execute procedure public.check_delivery_request_updates();


-- ============================================================================
-- 5. FIX PROFILE INTEGRITY & TRUSTED VERIFICATION APPROVAL TRIGGER
-- ============================================================================

-- 5.1 Profile Integrity Guard with Trusted Context Bypass
create or replace function public.check_profile_updates()
returns trigger as $$
begin
  -- Allow trusted server actions, service role, and administrators
  if current_setting('routem8.trusted_context', true) = 'on' or
     current_user = 'service_role' or
     auth.jwt()->>'role' = 'service_role' or
     public.is_admin() then
    new.updated_at := now();
    return new;
  end if;

  -- Ordinary authenticated user updates:
  if (new.id is distinct from old.id) or (new.email is distinct from old.email) then
    raise exception 'Modifying immutable identity fields (id, email) is forbidden.';
  end if;

  if new.role is distinct from old.role then
    raise exception 'Direct role escalation or modification is forbidden.';
  end if;

  if new.account_status is distinct from old.account_status then
    raise exception 'Modifying account status is restricted to administrators.';
  end if;

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
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 5.2 Server Trigger for Verification Request Approval
create or replace function public.handle_verification_approval()
returns trigger as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    if not public.is_admin() then
      raise exception 'Unauthorized: Only verified administrators can approve verification requests.';
    end if;

    -- Enable trusted context so check_profile_updates allows updating verification status & trust score
    perform set_config('routem8.trusted_context', 'on', true);

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

    new.reviewed_at := now();
  elsif new.status = 'rejected' and old.status <> 'rejected' then
    if not public.is_admin() then
      raise exception 'Unauthorized: Only verified administrators can reject verification requests.';
    end if;
    new.reviewed_at := now();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- 5.3 Dedicated Admin Review Verification Request RPC
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

  update public.verification_requests
  set
    status = p_action,
    notes = coalesce(p_notes, notes),
    reviewed_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'success', true,
    'status', p_action,
    'request_id', p_request_id,
    'user_id', v_req.user_id
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp;


-- ============================================================================
-- 6. HARDEN PUBLISHED JOURNEYS & LOCATION PRIVACY
-- ============================================================================

-- Guard against changing transporter_id on published journeys
create or replace function public.check_published_journey_updates()
returns trigger as $$
begin
  if new.transporter_id is distinct from old.transporter_id then
    raise exception 'Cannot transfer published journey ownership.';
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

drop trigger if exists on_published_journey_update_guard on public.published_journeys;
create trigger on_published_journey_update_guard
  before update on public.published_journeys
  for each row execute procedure public.check_published_journey_updates();


-- ============================================================================
-- 7. RE-GRANT MINIMAL EXECUTE PRIVILEGES ON SECURITY DEFINER FUNCTIONS
-- ============================================================================

grant execute on function public.is_admin() to authenticated, anon;
grant execute on function public.create_delivery_request_secure(text, text, text, text, double precision, double precision, text, double precision, double precision, text, numeric, text, text, text, numeric, text) to authenticated;
grant execute on function public.accept_delivery_request(uuid) to authenticated;
grant execute on function public.start_delivery_transit(uuid) to authenticated;
grant execute on function public.complete_delivery_handover(uuid, text) to authenticated;
grant execute on function public.cancel_delivery_request(uuid) to authenticated;
grant execute on function public.review_verification_request(uuid, text, text) to authenticated;
