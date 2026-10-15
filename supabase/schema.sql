-- ============================================================================
-- ROUTE M8 — PRODUCTION SUPABASE POSTGRESQL SCHEMA WITH ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- 1. PROFILES TABLE (User Accounts, Trust Scores, Campus/Work Verification)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text not null unique,
  full_name text not null,
  avatar_url text,
  role text not null default 'both' check (role in ('both', 'requester', 'transporter')),
  verification_status text not null default 'unverified' 
    check (verification_status in ('unverified', 'email_verified', 'student_verified', 'work_verified', 'gov_id_verified')),
  account_status text not null default 'active' 
    check (account_status in ('active', 'suspended', 'pending_approval')),
  organization text,
  trust_score integer not null default 50 check (trust_score between 0 and 100),
  completed_deliveries integer not null default 0,
  completed_commutes integer not null default 0,
  phone text,
  bio text,
  commute_vehicle text,
  rating numeric(3, 2) not null default 5.00,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on profiles
alter table public.profiles enable row level security;

-- Profiles Policies
drop policy if exists "Public profiles are viewable by authenticated users" on public.profiles;
create policy "Public profiles are viewable by authenticated users"
  on public.profiles for select
  to authenticated
  using (account_status = 'active' or auth.uid() = id);

drop policy if exists "Users can insert their own profile" on public.profiles;
drop policy if exists "Users can insert their own profile with safe defaults" on public.profiles;
create policy "Users can insert their own profile with safe defaults"
  on public.profiles for insert
  to authenticated
  with check (
    auth.uid() = id and
    trust_score = 50 and
    verification_status in ('unverified', 'email_verified') and
    completed_deliveries = 0 and
    completed_commutes = 0 and
    rating = 5.00 and
    role in ('both', 'requester', 'transporter') and
    account_status = 'active'
  );

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 2. DELIVERY REQUESTS TABLE
create table if not exists public.delivery_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.profiles(id) on delete cascade not null,
  title text not null,
  description text not null,
  category text not null check (category in ('groceries', 'campus-supplies', 'essentials', 'pharmacy', 'electronics', 'other')),
  pickup_address text not null,
  pickup_lat double precision not null,
  pickup_lng double precision not null,
  dropoff_address text not null,
  dropoff_lat double precision not null,
  dropoff_lng double precision not null,
  item_size text not null check (item_size in ('small', 'medium', 'large')),
  weight_estimate_kg numeric(5, 2),
  compensation numeric(6, 2) not null check (compensation >= 0),
  urgency text not null default 'standard' check (urgency in ('standard', 'flexible', 'urgent')),
  needed_by text not null,
  status text not null default 'open' check (status in ('open', 'matched', 'in_transit', 'completed', 'cancelled')),
  transporter_id uuid references public.profiles(id) on delete set null,
  handover_pin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on delivery_requests
alter table public.delivery_requests enable row level security;

-- Delivery Requests Policies
drop policy if exists "Anyone authenticated can view active and open delivery requests" on public.delivery_requests;
create policy "Anyone authenticated can view active and open delivery requests"
  on public.delivery_requests for select
  to authenticated
  using (true);

drop policy if exists "Requesters can create delivery requests" on public.delivery_requests;
create policy "Requesters can create delivery requests"
  on public.delivery_requests for insert
  to authenticated
  with check (auth.uid() = requester_id);

drop policy if exists "Requesters can update their own requests or accepted transporters can update status" on public.delivery_requests;
create policy "Requesters can update their own requests or accepted transporters can update status"
  on public.delivery_requests for update
  to authenticated
  using (
    auth.uid() = requester_id or 
    (auth.uid() = transporter_id and status in ('matched', 'in_transit', 'completed'))
  );

drop policy if exists "Requesters can delete their own open requests" on public.delivery_requests;
create policy "Requesters can delete their own open requests"
  on public.delivery_requests for delete
  to authenticated
  using (auth.uid() = requester_id and status = 'open');

-- 3. PUBLISHED JOURNEYS TABLE (Commuter Routes)
create table if not exists public.published_journeys (
  id uuid primary key default gen_random_uuid(),
  transporter_id uuid references public.profiles(id) on delete cascade not null,
  vehicle text not null,
  origin_address text not null,
  origin_lat double precision not null,
  origin_lng double precision not null,
  dest_address text not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  departure_time text not null,
  max_detour_minutes integer not null default 10 check (max_detour_minutes between 2 and 45),
  capacity text not null check (capacity in ('small', 'medium', 'large')),
  recurring_days text[],
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Enable RLS on published_journeys
alter table public.published_journeys enable row level security;

-- Published Journeys Policies
drop policy if exists "Anyone authenticated can view active published journeys" on public.published_journeys;
create policy "Anyone authenticated can view active published journeys"
  on public.published_journeys for select
  to authenticated
  using (is_active = true or auth.uid() = transporter_id);

drop policy if exists "Transporters can publish their journeys" on public.published_journeys;
create policy "Transporters can publish their journeys"
  on public.published_journeys for insert
  to authenticated
  with check (auth.uid() = transporter_id);

drop policy if exists "Transporters can update their own journeys" on public.published_journeys;
create policy "Transporters can update their own journeys"
  on public.published_journeys for update
  to authenticated
  using (auth.uid() = transporter_id);

drop policy if exists "Transporters can delete their own journeys" on public.published_journeys;
create policy "Transporters can delete their own journeys"
  on public.published_journeys for delete
  to authenticated
  using (auth.uid() = transporter_id);

-- 4. ADMINISTRATIVE USERS TABLE & HELPER FUNCTION
create table if not exists public.admin_users (
  user_id uuid references auth.users on delete cascade primary key,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users
);

alter table public.admin_users enable row level security;

drop policy if exists "Admins can view admin_users list" on public.admin_users;
create policy "Admins can view admin_users list"
  on public.admin_users for select
  to authenticated
  using (
    auth.uid() = user_id or
    coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false) = true or
    auth.jwt()->>'role' = 'service_role'
  );

-- Helper function to check admin status securely on the database server
create or replace function public.is_admin()
returns boolean as $$
begin
  return (
    auth.jwt()->>'role' = 'service_role' or
    coalesce((auth.jwt()->'app_metadata'->>'is_admin')::boolean, false) = true or
    exists (select 1 from public.admin_users where user_id = auth.uid())
  );
end;
$$ language plpgsql security definer stable;

-- 5. VERIFICATION REQUESTS TABLE (Institutional & Identity Verification Workflow)
create table if not exists public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  verification_type text not null check (verification_type in ('student', 'work', 'gov_id')),
  organization_name text not null,
  evidence_domain_or_id text not null,
  status text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  notes text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz
);

alter table public.verification_requests enable row level security;

drop policy if exists "Users can view their own verification requests" on public.verification_requests;
create policy "Users can view their own verification requests"
  on public.verification_requests for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

drop policy if exists "Users can submit their own verification requests" on public.verification_requests;
drop policy if exists "Users can submit verification requests" on public.verification_requests;
create policy "Users can submit verification requests"
  on public.verification_requests for insert
  to authenticated
  with check (
    auth.uid() = user_id and
    status = 'pending_review'
  );

drop policy if exists "Only administrators can update verification requests" on public.verification_requests;
create policy "Only administrators can update verification requests"
  on public.verification_requests for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Only administrators can delete verification requests" on public.verification_requests;
create policy "Only administrators can delete verification requests"
  on public.verification_requests for delete
  to authenticated
  using (public.is_admin());

-- Server-side Trigger: Handle verification approval strictly by authorized administrators
create or replace function public.handle_verification_approval()
returns trigger as $$
begin
  if new.status = 'approved' and old.status <> 'approved' then
    if not public.is_admin() then
      raise exception 'Unauthorized: Only verified administrators can approve verification requests.';
    end if;

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
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_verification_approved on public.verification_requests;
create trigger on_verification_approved
  before update on public.verification_requests
  for each row execute procedure public.handle_verification_approval();

-- 6. PROFILE INTEGRITY GUARD (PREVENT CLIENT TAMPERING OF PROTECTED PROFILE FIELDS)
create or replace function public.check_profile_updates()
returns trigger as $$
begin
  -- Prevent client users from escalating trust score, verification status, or delivery metrics
  if current_user <> 'service_role' and auth.role() = 'authenticated' then
    -- Prevent altering immutable identity fields
    if (new.id is distinct from old.id) or (new.email is distinct from old.email) then
      raise exception 'Modifying immutable identity fields (id, email) is forbidden.';
    end if;

    -- Prevent self-assigning or altering role
    if new.role is distinct from old.role then
      raise exception 'Direct role escalation or modification is forbidden.';
    end if;

    -- Prevent altering account status
    if new.account_status is distinct from old.account_status then
      raise exception 'Modifying account status is restricted to administrators.';
    end if;

    -- Prevent altering trust score, verification badge, or activity counters
    if (old.trust_score is distinct from new.trust_score) or
       (old.verification_status is distinct from new.verification_status) or
       (old.completed_deliveries is distinct from new.completed_deliveries) or
       (old.completed_commutes is distinct from new.completed_commutes) or
       (old.rating is distinct from new.rating) then
      raise exception 'Modifying protected metrics (trust score, verification status, ratings, delivery stats) is forbidden.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_profile_update_integrity on public.profiles;
create trigger on_profile_update_integrity
  before update on public.profiles
  for each row execute procedure public.check_profile_updates();

-- 7. SECURE SERVER-SIDE PROFILE AUTOMATION TRIGGER ON NEW SUPABASE AUTH USER
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
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'avatar_url', null),
    v_role,
    v_verification,
    50, -- Safe neutral starting trust score (not 90)
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

-- Trigger definition on auth.users
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
