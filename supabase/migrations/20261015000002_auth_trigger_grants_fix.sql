-- ============================================================================
-- ROUTE M8 — AUTH TRIGGER & TABLE PRIVILEGE REMEDIATION (LEAST PRIVILEGE)
-- Migration: 20261015000002_auth_trigger_grants_fix.sql
--
-- Security Fixes & Root Cause Remediation:
-- 1. Auth Admin Trigger Privilege Restoration:
--    GoTrue invokes user synchronization and email verification triggers on auth.users
--    under the dedicated role `supabase_auth_admin`.
--    Migration 20261014000003 revoked execute on handle_user_email_confirmed() from
--    public and granted it only to service_role, causing GoTrue updates to fail
--    with 42501 (insufficient_privilege) during email confirmation and signup.
--    This migration grants EXECUTE on auth.users trigger functions
--    (handle_user_email_confirmed, handle_new_user, handle_user_login_audit)
--    to supabase_auth_admin, postgres, and service_role.
--
-- 2. Principle of Least Privilege for Trusted-Context Helpers:
--    handle_user_email_confirmed() runs as SECURITY DEFINER (owned by postgres).
--    Therefore, internal trusted-context helpers (set_trusted_context, clear_trusted_context,
--    verify_trusted_context) and the server_context_keys table do NOT need to be exposed
--    to supabase_auth_admin or client roles; they remain restricted strictly to
--    postgres and service_role.
--
-- 3. Scoped Table Privileges Preserving RLS:
--    - public.profiles: anon has NO table access. authenticated has SELECT, INSERT, UPDATE
--      matching existing RLS policies (no client DELETE). postgres and service_role have full access.
--    - public.delivery_requests & published_journeys: anon has NO table access.
--      authenticated has SELECT, INSERT, UPDATE, DELETE strictly governed by RLS.
--    - public.transporter_locations: anon has NO table access.
--      authenticated has SELECT, INSERT, UPDATE strictly governed by active delivery RLS.
--
-- 4. Narrowly Scoped Username Availability RPC:
--    Provides check_username_available(text) to anon and authenticated without
--    exposing the profiles table to unauthenticated scraping.
--
-- 5. Safe System Role Recognition in Guards:
--    Updates check_profile_updates() and verify_trusted_context() to safely recognize
--    postgres alongside service_role during SECURITY DEFINER trigger execution.
-- ============================================================================

-- Ensure usage on schemas
grant usage on schema public to postgres, anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema extensions to postgres, anon, authenticated, service_role, supabase_auth_admin;

-- ============================================================================
-- 1. AUTH TRIGGER FUNCTIONS (INVOKED BY GOTRUE AS supabase_auth_admin)
-- ============================================================================

grant execute on function public.handle_user_email_confirmed() to postgres, supabase_auth_admin, service_role;
grant execute on function public.handle_new_user() to postgres, supabase_auth_admin, service_role;
grant execute on function public.handle_user_login_audit() to postgres, supabase_auth_admin, service_role;

-- Context helpers restricted strictly to postgres and service_role (definer/internal RPCs only)
grant execute on function public.set_trusted_context(text, uuid) to postgres, service_role;
grant execute on function public.clear_trusted_context() to postgres, service_role;
grant execute on function public.verify_trusted_context(text, uuid) to postgres, service_role;

-- Client audit event logging RPC
grant execute on function public.record_login_event(text, text) to authenticated, service_role;

-- ============================================================================
-- 2. SERVER CONTEXT KEYS PRIVILEGES (INTERNAL SYSTEM ROLES ONLY)
-- ============================================================================

grant select on table public.server_context_keys to postgres, service_role;

-- ============================================================================
-- 3. NARROWLY SCOPED USERNAME AVAILABILITY CHECK (NO ANON PROFILES ACCESS)
-- ============================================================================

create or replace function public.check_username_available(p_username text)
returns boolean as $$
begin
  if p_username is null or length(trim(p_username)) < 3 or length(trim(p_username)) > 30 or trim(p_username) !~ '^[a-zA-Z0-9_]+$' then
    return false;
  end if;
  return not exists (
    select 1 from public.profiles
    where lower(username) = lower(trim(p_username))
  );
end;
$$ language plpgsql security definer set search_path = public, pg_temp stable;

revoke execute on function public.check_username_available(text) from public;
grant execute on function public.check_username_available(text) to anon, authenticated, service_role;

-- ============================================================================
-- 4. CORE TABLE PRIVILEGES (LEAST PRIVILEGE, STRICT RLS ENFORCEMENT)
-- ============================================================================

-- Profiles: anon has NO access; authenticated only has select/insert/update per RLS; no client delete
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.profiles to supabase_auth_admin;
grant select, insert, update, delete on table public.profiles to postgres, service_role;

-- Delivery requests & journeys: strictly authenticated access matching RLS policies; zero anon access
grant select, insert, update, delete on table public.delivery_requests to authenticated, postgres, service_role;
grant select, insert, update, delete on table public.published_journeys to authenticated, postgres, service_role;

-- Transporter locations: authenticated active delivery participants only; zero anon access
grant select, insert, update on table public.transporter_locations to authenticated;
grant select, insert, update, delete on table public.transporter_locations to postgres, service_role;

-- ============================================================================
-- 5. HARDENED VERIFY_TRUSTED_CONTEXT WITH DEFINER RECOGNITION
-- ============================================================================

create or replace function public.verify_trusted_context(p_action text, p_target_id uuid)
returns boolean as $$
declare
  v_secret bytea;
  v_expected_sig text;
  v_actual_sig text;
  v_stack text;
begin
  -- 1. Fast path: service role or database superuser/definer
  if current_user in ('service_role', 'postgres') or auth.jwt()->>'role' = 'service_role' then
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

-- ============================================================================
-- 6. HARDENED CHECK_PROFILE_UPDATES TRIGGER GUARD
-- ============================================================================

create or replace function public.check_profile_updates()
returns trigger as $$
begin
  -- Service role & Definer maintenance updates
  if current_user in ('service_role', 'postgres') or auth.jwt()->>'role' = 'service_role' then
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

-- ============================================================================
-- 7. RECONFIRM EMAIL VERIFICATION TRIGGER
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

grant execute on function public.handle_user_email_confirmed() to postgres, supabase_auth_admin, service_role;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute procedure public.handle_user_email_confirmed();
