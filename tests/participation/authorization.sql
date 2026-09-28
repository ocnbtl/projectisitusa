-- Run against a disposable local/test Supabase database after all schema sources.
-- NOT RUN in the source-only phase. Entire test is rolled back.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('aaaaaaaa-1111-4111-8111-111111111111','reviewer@example.invalid',now(),'{"is_owner":true}'),
 ('aaaaaaaa-2222-4222-8222-222222222222','owner@example.invalid',now(),'{}');
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
 ('bbbbbbbb-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111',now(),now(),'aal2'),
 ('bbbbbbbb-2222-4222-8222-222222222222','aaaaaaaa-2222-4222-8222-222222222222',now(),now(),'aal2');
insert into public.isitusa_staff(user_id,email,display_name,permissions,is_owner) values
 ('aaaaaaaa-1111-4111-8111-111111111111','reviewer@example.invalid','Reviewer',array['review'],false),
 ('aaaaaaaa-2222-4222-8222-222222222222','owner@example.invalid','Owner','{}',true);
insert into public.isitusa_subscribers(email) values('private@example.invalid');
insert into public.isitusa_sightings(id,species_label,county_id,observed_on,location_note,notes,permission_version)
 values('cccccccc-1111-4111-8111-111111111111','Test observation','06037','2026-01-01','Private location','Private notes','test');
select pg_temp.assert_true(not has_function_privilege('anon','public.isitusa_request_email(text,jsonb,text,text,text)','execute'),'anon cannot execute service signup');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.isitusa_stripe_event(text,text,text,uuid,integer,text,text,text)','execute'),'staff cannot forge a payment webhook');
set local request.jwt.claims='{"sub":"aaaaaaaa-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-1111-4111-8111-111111111111","user_metadata":{"is_owner":true}}';
set local role authenticated;
select pg_temp.assert_true(public.isitusa_can('review'),'reviewer can review');
select pg_temp.assert_true(not public.isitusa_can('finance'),'user_metadata cannot grant finance');
select pg_temp.assert_true((select count(*)=0 from public.isitusa_subscribers),'reviewer cannot read audience');
select pg_temp.assert_true((select count(*)=1 from public.isitusa_staff),'reviewer cannot enumerate team');
select public.isitusa_review('cccccccc-1111-4111-8111-111111111111',0,'in_review','Review started.');
do $$ begin
 begin
  perform public.isitusa_review('cccccccc-1111-4111-8111-111111111111',0,'accepted','Stale decision');
  raise exception 'TEST FAILED: stale review accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.isitusa_save_staff('aaaaaaaa-2222-4222-8222-222222222222',array['finance'],true,'Owner');
  raise exception 'TEST FAILED: reviewer changed team access';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true((select count(*)=1 from public.isitusa_reviews),'review event appended exactly once');
update public.isitusa_staff set active=false where user_id='aaaaaaaa-1111-4111-8111-111111111111';
set local role authenticated;
select pg_temp.assert_true(not public.isitusa_can('review'),'revocation invalidates existing access token permissions');
select pg_temp.assert_true((select count(*)=0 from public.isitusa_sightings),'revoked reviewer cannot read sightings');
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-2222-4222-8222-222222222222","role":"authenticated","aal":"aal1","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}';
set local role authenticated;
select pg_temp.assert_true(not public.isitusa_can('finance'),'owner without MFA cannot read finance');
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}';
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-2222-4222-8222-222222222222","role":"authenticated","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}';
set local role authenticated;
select pg_temp.assert_true(public.isitusa_can('finance') is false,'missing AAL is explicitly false, never NULL');
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}';
set local role authenticated;
select public.isitusa_wallet('ETH','0x0000000000000000000000000000000000000001','Disposable test fixture, not a real receiving wallet.');
select public.isitusa_wallet('ETH','0x0000000000000000000000000000000000000002','Disposable second fixture, not a real receiving wallet.');
select public.isitusa_wallet('ETH','0x0000000000000000000000000000000000000001','Reactivate disposable fixture to exercise conflict handling.');
select pg_temp.assert_true((select count(*)=1 from public.isitusa_wallets where asset='ETH' and active),'one active wallet after replacement and reactivation');
reset role;

delete from auth.sessions where id='bbbbbbbb-2222-4222-8222-222222222222';
set local role authenticated;
select pg_temp.assert_true(not public.isitusa_can('finance'),'deleted session cannot use stale JWT');
reset role;
rollback;
