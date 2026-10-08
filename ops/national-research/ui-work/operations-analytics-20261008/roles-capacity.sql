-- In-memory fixtures only. Never run this file against the hosted project.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
insert into auth.users(id,email,email_confirmed_at) values
 ('aaaaaaaa-1111-4111-8111-111111111111','volunteer@example.invalid',now()),
 ('aaaaaaaa-2222-4222-8222-222222222222','lead@example.invalid',now()),
 ('aaaaaaaa-3333-4333-8333-333333333333','manager@example.invalid',now());
insert into auth.sessions(id,user_id,created_at,updated_at,aal) values
 ('bbbbbbbb-1111-4111-8111-111111111111','aaaaaaaa-1111-4111-8111-111111111111',now(),now(),'aal2'),
 ('bbbbbbbb-2222-4222-8222-222222222222','aaaaaaaa-2222-4222-8222-222222222222',now(),now(),'aal2'),
 ('bbbbbbbb-3333-4333-8333-333333333333','aaaaaaaa-3333-4333-8333-333333333333',now(),now(),'aal2');
insert into public.isitusa_staff(user_id,email,display_name,permissions) values
 ('aaaaaaaa-1111-4111-8111-111111111111','volunteer@example.invalid','Volunteer',array['review']),
 ('aaaaaaaa-2222-4222-8222-222222222222','lead@example.invalid','Lead',array['review','review_decide']),
 ('aaaaaaaa-3333-4333-8333-333333333333','manager@example.invalid','Manager',array['review','team']);
insert into public.isitusa_sightings(id,species_label,county_id,observed_on,location_note,notes,permission_version)
 values('cccccccc-1111-4111-8111-111111111111','Test observation','06037','2026-01-01','Fixture location','Fixture notes','test');
set local request.jwt.claims='{"sub":"aaaaaaaa-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-1111-4111-8111-111111111111"}';
set local role authenticated;
do $$ begin
 begin
  perform public.isitusa_review('cccccccc-1111-4111-8111-111111111111',0,'accepted','Fixture identification');
  raise exception 'TEST FAILED: volunteer finalized a sighting';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-2222-4222-8222-222222222222","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-2222-4222-8222-222222222222"}';
set local role authenticated;
do $$ begin
 begin
  perform public.isitusa_review('cccccccc-1111-4111-8111-111111111111',0,'accepted','Unidentified fixture');
  raise exception 'TEST FAILED: unidentified observation accepted';
 exception when raise_exception then
  if sqlerrm<>'Match a catalog species before accepting this observation' then raise; end if;
 end;
 begin
  perform public.isitusa_review_identification('cccccccc-1111-4111-8111-111111111111',0,'accepted','Invalid species fixture','unknown-species');
  raise exception 'TEST FAILED: unknown species accepted';
 exception when raise_exception then
  if sqlerrm<>'Choose a species from the catalog' then raise; end if;
 end;
end $$;
reset role;
insert into public.isitusa_catalog(kind,id,label,release_id) values('species','fixture-species','Fixture species','test');
set local role authenticated;
select public.isitusa_review_identification('cccccccc-1111-4111-8111-111111111111',0,'accepted','Lead confirmed fixture','fixture-species');
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-1111-4111-8111-111111111111"}';
set local role authenticated;
do $$ begin
 begin
  perform public.isitusa_review('cccccccc-1111-4111-8111-111111111111',1,'in_review','Reopen fixture review');
  raise exception 'TEST FAILED: volunteer reopened final review';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
set local request.jwt.claims='{"sub":"aaaaaaaa-3333-4333-8333-333333333333","role":"authenticated","aal":"aal2","session_id":"bbbbbbbb-3333-4333-8333-333333333333"}';
set local role authenticated;
select public.isitusa_save_staff('aaaaaaaa-1111-4111-8111-111111111111',array['review'],true,'Fixture volunteer');
do $$ begin
 begin
  perform public.isitusa_save_staff('aaaaaaaa-1111-4111-8111-111111111111',array['review','finance'],true,'Fixture volunteer');
  raise exception 'TEST FAILED: manager granted finance';
 exception when insufficient_privilege then null; end;
 begin
  perform public.isitusa_save_staff('aaaaaaaa-2222-4222-8222-222222222222',array['review'],false,'Fixture lead');
  raise exception 'TEST FAILED: manager changed elevated staff';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
select pg_temp.assert_true((select count(*)=1 from public.isitusa_reviews),'only lead decision committed');
select pg_temp.assert_true((select matched_species_id='fixture-species' and species_label='Test observation' from public.isitusa_sightings),'matched species saved while original label preserved');
select pg_temp.assert_true((select matched_species_id='fixture-species' from public.isitusa_reviews),'review retains its identification snapshot');
select pg_temp.assert_true(not has_function_privilege('anon','public.isitusa_reserve_upload(uuid,bigint)','execute'),'anonymous cannot reserve uploads');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.isitusa_reserve_upload(uuid,bigint)','execute'),'staff cannot reserve uploads directly');
select pg_temp.assert_true(not public.isitusa_reserve_upload(gen_random_uuid(),-1),'negative upload rejected');
select pg_temp.assert_true(not public.isitusa_reserve_upload(gen_random_uuid(),15728641),'oversized upload rejected');
insert into storage.objects(bucket_id,name,metadata) values('isitusa-sightings','fixture-only',jsonb_build_object('size',690000000));
select pg_temp.assert_true(public.isitusa_reserve_upload(gen_random_uuid(),10000000),'exact capacity fits');
select pg_temp.assert_true(not public.isitusa_reserve_upload(gen_random_uuid(),1),'pending reservation consumes capacity');
rollback;
