-- Local/test database only. The service quota counts send attempts, not queue creation.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
insert into public.isitusa_subscribers(id,email) values('eeeeeeee-1111-4111-8111-111111111111','quota-history@example.invalid');
insert into public.isitusa_outbox(id,subscriber_id,kind,recipient,payload,dedupe_key,state,created_at)
 values('ffffffff-1111-4111-8111-111111111111','eeeeeeee-1111-4111-8111-111111111111','preferences','quota-history@example.invalid','{}','quota-history','sent',now()-interval '25 hours');
insert into public.isitusa_email_attempts(outbox_id,attempt,attempted_at)
 select 'ffffffff-1111-4111-8111-111111111111',n,now()-interval '23 hours' from generate_series(1,50) n;
select public.isitusa_request_email('quota-new@example.invalid',null,'preferences',repeat('f',64),'https://example.invalid/link');
select pg_temp.assert_true((select count(*)=0 from public.isitusa_claim_email()),'old queue items with recent send attempts still consume quota');
delete from public.isitusa_email_attempts where outbox_id='ffffffff-1111-4111-8111-111111111111' and attempt=1;
select pg_temp.assert_true((select count(*)=1 from public.isitusa_claim_email()),'one remaining quota slot admits one claim');
select pg_temp.assert_true((select count(*)=50 from public.isitusa_email_attempts where attempted_at>now()-interval '24 hours'),'claim atomically consumes attempt budget');
update public.isitusa_outbox set lease_until=now()-interval '1 minute' where recipient='quota-new@example.invalid';
select pg_temp.assert_true((select count(*)=0 from public.isitusa_claim_email()),'retry cannot bypass quota');
delete from public.isitusa_email_attempts where outbox_id='ffffffff-1111-4111-8111-111111111111' and attempt=2;
select pg_temp.assert_true((select count(*)=1 from public.isitusa_claim_email()),'expired lease can retry with a budget slot');
select pg_temp.assert_true((select attempts=2 from public.isitusa_outbox where recipient='quota-new@example.invalid'),'retry preserves outbox identity and increments attempts');
rollback;
