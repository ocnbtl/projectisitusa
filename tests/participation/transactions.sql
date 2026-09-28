-- Disposable test database only. NOT RUN during source implementation.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
select pg_temp.assert_true(public.isitusa_validate_preferences(null) is false,'null preferences are rejected');
select pg_temp.assert_true(public.isitusa_validate_preferences('{}') is false,'missing preference arrays are rejected');
insert into public.isitusa_checkout_requests(id,amount_minor,currency,session_id)
 values('dddddddd-1111-4111-8111-111111111111',1000,'usd','cs_test_fixture');
select public.isitusa_stripe_event('evt_fixture','checkout.session.completed','cs_test_fixture','dddddddd-1111-4111-8111-111111111111',1000,'usd','paid',null);
select public.isitusa_stripe_event('evt_fixture','checkout.session.completed','cs_test_fixture','dddddddd-1111-4111-8111-111111111111',1000,'usd','paid',null);
select pg_temp.assert_true((select count(*)=1 from public.isitusa_contributions where provider_reference='cs_test_fixture'),'replayed event does not double count');
do $$ begin
 begin
  perform public.isitusa_stripe_event('evt_wrong','checkout.session.completed','cs_test_fixture','dddddddd-1111-4111-8111-111111111111',900,'usd','paid',null);
  raise exception 'TEST FAILED: mismatched amount accepted';
 exception when raise_exception then
  if SQLERRM='TEST FAILED: mismatched amount accepted' then raise; end if;
 end;
end $$;
select pg_temp.assert_true((select count(*)=0 from public.isitusa_webhook_events where event_id='evt_wrong'),'rejected event can be retried after correction');
select public.isitusa_request_email('subscriber@example.invalid','{"streams":["facts"],"counties":[],"species":[]}','confirm',repeat('a',64),'https://example.invalid/private-link');
select pg_temp.assert_true((select confirmed_at is null from public.isitusa_subscribers where email='subscriber@example.invalid'),'signup request is not consent');
select public.isitusa_token_action(repeat('a',64),'confirm',null);
select pg_temp.assert_true((select confirmed_at is not null from public.isitusa_subscribers where email='subscriber@example.invalid'),'confirm creates consent');
insert into public.isitusa_tokens(token_hash,subscriber_id,purpose,base_version,expires_at)
 select repeat('b',64),id,'preferences',version,now()+interval '1 hour' from public.isitusa_subscribers where email='subscriber@example.invalid';
select public.isitusa_token_action(repeat('b',64),'unsubscribe',null);
select public.isitusa_token_action(repeat('b',64),'unsubscribe',null); -- Retry must be idempotent.
select pg_temp.assert_true((select suppressed_at is not null from public.isitusa_subscribers where email='subscriber@example.invalid'),'unsubscribe suppresses delivery');
do $$ begin
 begin
  perform public.isitusa_token_action(repeat('a',64),'confirm',null);
  raise exception 'TEST FAILED: consumed token restored consent';
 exception when raise_exception then
  if SQLERRM='TEST FAILED: consumed token restored consent' then raise; end if;
 end;
end $$;
select public.isitusa_suppress('email_bounce_fixture','email.bounced',array['subscriber@example.invalid'],'bounce');
select public.isitusa_request_email('subscriber@example.invalid','{"streams":["action"],"counties":[],"species":[]}','confirm',repeat('c',64),'https://example.invalid/private-link');
select pg_temp.assert_true((select count(*)=0 from public.isitusa_tokens where token_hash=repeat('c',64)),'bounce suppression cannot be cleared through a public signup');
rollback;
