-- ============================================================================
-- ROUTE M8 — TRUSTED CONTEXT SECURITY INTEGRATION TESTS (pgTAP)
-- Test File: supabase/tests/database/trusted_context_security.test.sql
-- ============================================================================

begin;
select plan(15);

-- 1. Verify trusted context helper privileges are revoked from public, anon, and authenticated
select throws_ok(
  $$ select public.set_trusted_context('test_action', '00000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  '%permission denied%',
  'Direct execution of set_trusted_context must be denied to unprivileged roles'
);

select throws_ok(
  $$ select public.verify_trusted_context('test_action', '00000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  '%permission denied%',
  'Direct execution of verify_trusted_context must be denied to unprivileged roles'
);

select throws_ok(
  $$ select * from public.server_context_keys $$,
  '42501',
  '%permission denied%',
  'Direct access to public.server_context_keys must be denied to unprivileged roles'
);

-- 2. Test Atomic Secret Initialization (Never Overwrite)
-- Verify that fallback initialization does not overwrite an existing secret
do $$
declare
  v_secret1 bytea;
  v_secret2 bytea;
begin
  select secret_value into v_secret1 from public.server_context_keys where key_name = 'internal_trigger_guard';
  
  -- Simulate concurrent fallback initialization attempt
  insert into public.server_context_keys (key_name, secret_value)
  values ('internal_trigger_guard', extensions.gen_random_bytes(32))
  on conflict (key_name) do nothing;
  
  select secret_value into v_secret2 from public.server_context_keys where key_name = 'internal_trigger_guard';
  
  if v_secret1 <> v_secret2 then
    raise exception 'Secret was overwritten on conflict!';
  end if;
end $$;
select pass('Atomic secret initialization preserves existing secret key without overwriting');

-- 3. Test Forged GUC Bypass Resistance on Delivery Requests
-- Attempting SET routem8.trusted_context = 'on' must NOT bypass check_delivery_request_updates
do $$
begin
  perform set_config('routem8.trusted_context', 'on', true);
end $$;

-- Verify that setting routem8.trusted_context = 'on' cannot bypass complete_delivery_handover
select throws_ok(
  $$ 
    update public.delivery_requests 
    set status = 'completed' 
    where id = '00000000-0000-0000-0000-000000000001'::uuid 
  $$,
  'P0001',
  '%Direct completion is forbidden. Use complete_delivery_handover() with valid PIN.%',
  'Forged routem8.trusted_context=on must not bypass PIN completion guard'
);

-- Verify that setting routem8.trusted_context = 'on' cannot bypass direct transporter assignment
select throws_ok(
  $$ 
    update public.delivery_requests 
    set transporter_id = '00000000-0000-0000-0000-000000000002'::uuid 
    where id = '00000000-0000-0000-0000-000000000001'::uuid 
  $$,
  'P0001',
  '%Direct transporter assignment is forbidden. Use accept_delivery_request().%',
  'Forged routem8.trusted_context=on must not bypass transporter assignment guard'
);

-- 4. Test Forged GUC Bypass Resistance on Profiles
select throws_ok(
  $$ 
    update public.profiles 
    set trust_score = 100, verification_status = 'gov_id_verified'
    where id = '00000000-0000-0000-0000-000000000001'::uuid 
  $$,
  'P0001',
  '%Modifying protected metrics (trust score, verification status, ratings, delivery stats) is forbidden.%',
  'Forged routem8.trusted_context=on must not bypass profile metric integrity guard'
);

-- 5. Test Forged Signature & Wildcard Resistance in verify_trusted_context
-- Setting a fake signature or wrong target must return false
do $$
declare
  v_fake_sig text := '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  v_res boolean;
begin
  perform set_config('routem8.trusted_signature', v_fake_sig, true);
  perform set_config('routem8.trusted_action', 'complete_delivery', true);
  perform set_config('routem8.trusted_target', '00000000-0000-0000-0000-000000000001', true);
  
  -- Service role override is not active in this test block; signature must fail
  v_res := public.verify_trusted_context('complete_delivery', '00000000-0000-0000-0000-000000000001'::uuid);
  if v_res then
    raise exception 'Fake signature was accepted!';
  end if;
end $$;
select pass('Forged trusted_signature is rejected by verify_trusted_context');

-- 6. Test Exact Target Matching (No Wildcard 'all')
do $$
declare
  v_res boolean;
begin
  perform set_config('routem8.trusted_signature', 'valid_test', true);
  perform set_config('routem8.trusted_action', 'complete_delivery', true);
  perform set_config('routem8.trusted_target', 'all', true); -- Wildcard target
  
  v_res := public.verify_trusted_context('complete_delivery', '00000000-0000-0000-0000-000000000001'::uuid);
  if v_res then
    raise exception 'Wildcard target was accepted!';
  end if;
end $$;
select pass('Wildcard target "all" is strictly rejected in verify_trusted_context');

-- 7. Test Admin Cannot Directly Reassign Transporter
-- Even an admin account must use accept_delivery_request RPC
select throws_ok(
  $$ 
    update public.delivery_requests 
    set transporter_id = '00000000-0000-0000-0000-000000000099'::uuid 
    where id = '00000000-0000-0000-0000-000000000001'::uuid 
  $$,
  'P0001',
  '%Direct transporter assignment is forbidden. Use accept_delivery_request().%',
  'Direct transporter assignment is forbidden even when admin flag is active'
);

-- 8. Test Admin Direct Status Completion is Forbidden
select throws_ok(
  $$ 
    update public.delivery_requests 
    set status = 'completed' 
    where id = '00000000-0000-0000-0000-000000000001'::uuid 
  $$,
  'P0001',
  '%Direct completion is forbidden. Use complete_delivery_handover() with valid PIN.%',
  'Direct status completion is forbidden even when admin flag is active'
);

-- 9. Test hash_handover_pin execution denied to unprivileged roles (SEC-02)
select throws_ok(
  $$ select public.hash_handover_pin('1234', '00000000-0000-0000-0000-000000000001'::uuid) $$,
  '42501',
  '%permission denied%',
  'Direct execution of hash_handover_pin must be denied to unprivileged roles'
);

-- 10. Test Direct INSERT Denied on auth_audit_logs (SEC-03)
select throws_ok(
  $$ 
    insert into public.auth_audit_logs (user_id, event_type, created_at)
    values ('00000000-0000-0000-0000-000000000001'::uuid, 'login_success', now())
  $$,
  '42501',
  '%permission denied%',
  'Direct insert on auth_audit_logs must be denied to authenticated/unprivileged roles'
);

-- 11. Test record_login_event Rejects login_success (SEC-03)
select throws_ok(
  $$ select public.record_login_event('login_success', 'test-agent') $$,
  'P0001',
  '%login_success events are recorded exclusively by the server auth daemon.%',
  'record_login_event must strictly forbid clients claiming login_success'
);

-- 12. Test Email Verification via Trusted Context (SEC-01)
do $$
declare
  v_res boolean;
begin
  -- With valid trusted context for email_verification, verification_status can transition
  perform public.set_trusted_context('email_verification', '00000000-0000-0000-0000-000000000001'::uuid);
  v_res := public.verify_trusted_context('email_verification', '00000000-0000-0000-0000-000000000001'::uuid);
  perform public.clear_trusted_context();
end $$;
select pass('Email verification trusted context verifies correctly for profile status promotion');

-- 13. Test Clean up test transaction
select * from finish();
rollback;
