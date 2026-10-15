-- ============================================================================
-- ROUTE M8 — AUTHENTICATION AND USER IDENTITY HARDENING
-- Migration: 20261014000003_auth_identity_hardening.sql
--
-- Features Implemented:
-- 1. Unique Case-Insensitive Usernames:
--    Adds username column to public.profiles with case-insensitive unique index
--    and strict format validation (3-30 chars, alphanumeric + underscores).
-- 2. Safe Backfill & Profile Automation:
--    Automated username fallback generation in handle_new_user() prevents any
--    registration failures or collisions.
-- 3. Email Verification Synchronization:
--    Automatically promotes profile verification_status from 'unverified' to
--    'email_verified' when Supabase Auth confirms an email address.
-- 4. Secure Server-Side Login Audit Trail:
--    Creates public.auth_audit_logs table with immutable RLS protection.
--    Records sign-in events automatically via auth.users.last_sign_in_at trigger
--    and provides a dedicated record_login_event() RPC.
-- 5. Tightened Profile & Audit RLS:
--    Users can only view their own login audit logs (or admins).
--    Profiles are restricted so users cannot read other users' private profiles
--    or tamper with immutable identity fields (id, email, username).
-- ============================================================================

-- Ensure extensions schema and pgcrypto are available
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to postgres, anon, authenticated, service_role;

-- ============================================================================
-- 1. UNIQUE CASE-INSENSITIVE USERNAMES
-- ============================================================================

-- Add username column to public.profiles
alter table public.profiles
  add column if not exists username text;

-- Safe backfill for existing profiles without a username
do $$
declare
  r record;
  v_base text;
  v_candidate text;
  v_suffix int;
begin
  for r in select id, email from public.profiles where username is null loop
    v_base := lower(regexp_replace(split_part(r.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'));
    if length(v_base) < 3 then
      v_base := 'user_' || v_base;
    end if;
    v_base := substring(v_base from 1 for 24);
    v_candidate := v_base;
    v_suffix := 1;
    while exists (select 1 from public.profiles where lower(username) = lower(v_candidate) and id <> r.id) loop
      v_candidate := v_base || '_' || v_suffix::text;
      v_suffix := v_suffix + 1;
    end loop;
    update public.profiles set username = v_candidate where id = r.id;
  end loop;
end;
$$;

-- Create case-insensitive unique index on lower(trim(username))
create unique index if not exists profiles_username_lower_idx
  on public.profiles (lower(trim(username)))
  where username is not null;

-- Enforce format validation constraint (3-30 chars, alphanumeric + underscores only)
alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (
    username is null or (
      length(trim(username)) >= 3 and 
      length(trim(username)) <= 30 and 
      username ~ '^[a-zA-Z0-9_]+$'
    )
  );

-- ============================================================================
-- 2. SECURE SERVER-SIDE PROFILE CREATION WITH UNIQUE USERNAME GENERATION
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger as $$
declare
  v_role text;
  v_verification text;
  v_raw_username text;
  v_base_username text;
  v_candidate_username text;
  v_suffix int := 1;
begin
  -- 1. Sanitize role strictly: only allow non-privileged participant roles
  if new.raw_user_meta_data->>'role' in ('requester', 'transporter') then
    v_role := new.raw_user_meta_data->>'role';
  else
    v_role := 'both';
  end if;

  -- 2. Safe verification default: only email_verified if confirmed by Supabase auth
  if new.email_confirmed_at is not null then
    v_verification := 'email_verified';
  else
    v_verification := 'unverified';
  end if;

  -- 3. Sanitize and validate requested username or generate unique fallback
  v_raw_username := trim(coalesce(new.raw_user_meta_data->>'username', ''));
  if v_raw_username ~ '^[a-zA-Z0-9_]{3,30}$' then
    v_base_username := lower(v_raw_username);
  else
    v_base_username := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-zA-Z0-9_]', '_', 'g'));
    if length(v_base_username) < 3 then
      v_base_username := 'user_' || v_base_username;
    end if;
    v_base_username := substring(v_base_username from 1 for 24);
  end if;

  v_candidate_username := v_base_username;
  while exists (select 1 from public.profiles where lower(username) = lower(v_candidate_username) and id <> new.id) loop
    v_candidate_username := v_base_username || '_' || v_suffix::text;
    v_suffix := v_suffix + 1;
  end loop;

  -- 4. Atomic profile provisioning linked to auth.users.id
  insert into public.profiles (
    id, 
    email, 
    username,
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
    v_candidate_username,
    coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), split_part(new.email, '@', 1)),
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
    username = coalesce(profiles.username, excluded.username),
    updated_at = now();

  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

-- ============================================================================
-- 3. AUTOMATIC EMAIL VERIFICATION SYNCHRONIZATION
-- ============================================================================

create or replace function public.handle_user_email_confirmed()
returns trigger as $$
begin
  if new.email_confirmed_at is not null and old.email_confirmed_at is null then
    -- Authorize verification status update via cryptographic trusted context with exact user UUID
    perform public.set_trusted_context('email_verification', new.id);

    update public.profiles
    set
      verification_status = case
        when verification_status = 'unverified' then 'email_verified'
        else verification_status
      end,
      updated_at = now()
    where id = new.id;

    perform public.clear_trusted_context();
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, extensions, pg_temp;

revoke execute on function public.handle_user_email_confirmed() from public, anon, authenticated;
grant execute on function public.handle_user_email_confirmed() to service_role;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_user_email_confirmed();

-- ============================================================================
-- 4. SECURE SERVER-SIDE LOGIN AUDIT TRAIL
-- ============================================================================

create table if not exists public.auth_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  event_type text not null default 'login_success' 
    check (event_type in ('login_success', 'logout', 'password_reset_request', 'password_reset_complete', 'token_refresh')),
  ip_address text,
  user_agent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Index for efficient user-audit retrieval
create index if not exists auth_audit_logs_user_id_idx
  on public.auth_audit_logs (user_id, created_at desc);

-- Enable RLS on audit logs
alter table public.auth_audit_logs enable row level security;

-- Strictly prevent direct client updating, deleting, or inserting audit logs (immutable server audit trail)
revoke insert, update, delete on public.auth_audit_logs from public, anon, authenticated;
grant select on public.auth_audit_logs to authenticated;
grant all on public.auth_audit_logs to service_role;

-- RLS: Users can only read their own audit logs; admins can read all
drop policy if exists "Users can view their own login audit logs" on public.auth_audit_logs;
create policy "Users can view their own login audit logs"
  on public.auth_audit_logs for select
  to authenticated
  using (auth.uid() = user_id or public.is_admin());

-- Direct client insert policy dropped to prevent client log injection
drop policy if exists "Users can insert their own audit logs" on public.auth_audit_logs;

-- Server-side login audit trigger on auth.users (covers both initial signup and subsequent logins)
create or replace function public.handle_user_login_audit()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    -- Capture initial registration sign-in if session was established on user creation
    if new.last_sign_in_at is not null then
      insert into public.auth_audit_logs (user_id, event_type, created_at, metadata)
      values (
        new.id,
        'login_success',
        new.last_sign_in_at,
        jsonb_build_object(
          'provider', coalesce(new.raw_app_meta_data->>'provider', 'email'),
          'source', 'supabase_auth',
          'initial_signup', true
        )
      );
    end if;
  elsif TG_OP = 'UPDATE' then
    if new.last_sign_in_at is distinct from old.last_sign_in_at and new.last_sign_in_at is not null then
      insert into public.auth_audit_logs (user_id, event_type, created_at, metadata)
      values (
        new.id,
        'login_success',
        new.last_sign_in_at,
        jsonb_build_object(
          'provider', coalesce(new.raw_app_meta_data->>'provider', 'email'),
          'source', 'supabase_auth'
        )
      );
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

-- Trigger on user creation (INSERT)
drop trigger if exists on_auth_user_created_login on auth.users;
create trigger on_auth_user_created_login
  after insert on auth.users
  for each row execute procedure public.handle_user_login_audit();

-- Trigger on subsequent logins (UPDATE OF last_sign_in_at)
drop trigger if exists on_auth_user_login on auth.users;
create trigger on_auth_user_login
  after update of last_sign_in_at on auth.users
  for each row execute procedure public.handle_user_login_audit();

-- RPC for client telemetry logging of client-initiated events (logout, token_refresh, etc.)
create or replace function public.record_login_event(
  p_event_type text,
  p_user_agent text default null
)
returns jsonb as $$
declare
  v_log_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required to record audit log.';
  end if;

  -- Strictly forbid clients from claiming login_success; login_success is emitted solely by the server auth daemon
  if p_event_type = 'login_success' then
    raise exception 'login_success events are recorded exclusively by the server auth daemon.';
  end if;

  if p_event_type not in ('logout', 'password_reset_request', 'password_reset_complete', 'token_refresh') then
    raise exception 'Invalid audit event type.';
  end if;

  -- Timestamp is strictly server-generated (now()); client cannot forge timestamp or trusted IP
  insert into public.auth_audit_logs (user_id, event_type, user_agent, metadata, created_at)
  values (
    auth.uid(),
    p_event_type,
    p_user_agent,
    jsonb_build_object('source', 'client_rpc'),
    now()
  )
  returning id into v_log_id;

  return jsonb_build_object('success', true, 'log_id', v_log_id);
end;
$$ language plpgsql security definer set search_path = public, pg_temp;

revoke execute on function public.record_login_event(text, text) from public, anon;
grant execute on function public.record_login_event(text, text) to authenticated;

-- ============================================================================
-- 5. TIGHTENED PROFILE RLS & IMMUTABLE IDENTITY FIELD PROTECTION
-- ============================================================================

-- Tighten profile visibility so users cannot browse arbitrary user profiles
drop policy if exists "Public profiles are viewable by authenticated users" on public.profiles;
drop policy if exists "Profiles are viewable by authenticated participants" on public.profiles;

create policy "Profiles are viewable by authenticated participants"
  on public.profiles for select
  to authenticated
  using (
    auth.uid() = id or
    public.is_admin() or
    exists (
      select 1 from public.delivery_requests
      where (requester_id = profiles.id or transporter_id = profiles.id)
        and status in ('open', 'matched', 'in_transit')
    ) or
    exists (
      select 1 from public.published_journeys
      where transporter_id = profiles.id and is_active = true
    )
  );

-- Update check_profile_updates trigger to guard immutable username
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

  if (new.username is distinct from old.username) and old.username is not null then
    raise exception 'Modifying immutable username is forbidden.';
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
