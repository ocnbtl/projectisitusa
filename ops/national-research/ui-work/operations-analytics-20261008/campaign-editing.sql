-- Isolated, rollback-only regression. Never run against hosted user data.
begin;
create function pg_temp.campaign_assert(value boolean, message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'TEST FAILED: %',message; end if; end $$;
insert into auth.users(id,email) values ('dddddddd-1111-4111-8111-111111111111','editor@example.invalid');
insert into auth.sessions(id,user_id,aal) values ('eeeeeeee-1111-4111-8111-111111111111','dddddddd-1111-4111-8111-111111111111','aal2');
insert into public.isitusa_staff(user_id,email,display_name,permissions) values ('dddddddd-1111-4111-8111-111111111111','editor@example.invalid','Editor',array['audience']);
insert into public.isitusa_campaigns(id,stream,subject,body,created_by) values ('ffffffff-1111-4111-8111-111111111111','facts','A species story','First draft.','dddddddd-1111-4111-8111-111111111111');
select pg_temp.campaign_assert(not has_function_privilege('anon','public.isitusa_edit_campaign(uuid,integer,text,text,text,text)','execute'),'anonymous edits denied');
set local request.jwt.claims='{"sub":"dddddddd-1111-4111-8111-111111111111","role":"authenticated","aal":"aal2","session_id":"eeeeeeee-1111-4111-8111-111111111111"}';
set local role authenticated;
select public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',0,'facts','Revised story','Second draft.','draft');
do $$ begin
 begin perform public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',0,'facts','Stale story','Overwrite attempt.','draft'); raise exception 'TEST FAILED: stale draft overwritten'; exception when serialization_failure then null; end;
 begin perform public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',1,'facts','   ','Text','draft'); raise exception 'TEST FAILED: blank subject accepted'; exception when raise_exception then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
 begin perform public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',1,'facts','Story','Text','approved'); raise exception 'TEST FAILED: editor approved campaign'; exception when raise_exception then if sqlerrm like 'TEST FAILED:%' then raise; end if; end;
end $$;
select public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',1,'facts','Revised story','Second draft.','cancelled');
select public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',2,'facts','Restored story','Second draft.','draft');
reset role;
select pg_temp.campaign_assert((select version=3 and status='draft' and subject='Restored story' from public.isitusa_campaigns where id='ffffffff-1111-4111-8111-111111111111'),'archive/restore preserved draft');
select pg_temp.campaign_assert((select count(*)=3 from public.isitusa_audit where action='campaign.edit'),'one audit per successful edit');
select pg_temp.campaign_assert((select count(*)=0 from public.isitusa_outbox),'editing never queued mail');
update public.isitusa_staff set permissions=array['review'] where user_id='dddddddd-1111-4111-8111-111111111111';
set local role authenticated;
do $$ begin
 begin perform public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',3,'facts','Unauthorized','Text','draft'); raise exception 'TEST FAILED: revoked editor saved'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.isitusa_staff set permissions=array['audience'] where user_id='dddddddd-1111-4111-8111-111111111111';
set local request.jwt.claims='{"sub":"dddddddd-1111-4111-8111-111111111111","role":"authenticated","aal":"aal1","session_id":"eeeeeeee-1111-4111-8111-111111111111"}';
set local role authenticated;
do $$ begin
 begin perform public.isitusa_edit_campaign('ffffffff-1111-4111-8111-111111111111',3,'facts','No MFA','Text','draft'); raise exception 'TEST FAILED: aal1 saved'; exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
