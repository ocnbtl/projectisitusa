-- Transactional integration checks. Synthetic users and records are always rolled back.
begin;
do $$
declare manager uuid:=gen_random_uuid(); volunteer uuid:=gen_random_uuid(); applicant uuid:=gen_random_uuid();
 manager_session uuid:=gen_random_uuid(); volunteer_session uuid:=gen_random_uuid(); application uuid:=gen_random_uuid();
 claim jsonb; rejected boolean;
begin
 insert into auth.users(id,email) values(manager,manager::text||'@example.invalid'),(volunteer,volunteer::text||'@example.invalid'),(applicant,applicant::text||'@example.invalid');
 insert into auth.sessions(id,user_id) values(manager_session,manager),(volunteer_session,volunteer);
 insert into public.isitusa_staff(user_id,email,display_name,permissions) values(manager,manager::text||'@example.invalid','Synthetic test manager',array['team']),(volunteer,volunteer::text||'@example.invalid','Synthetic test volunteer',array['content']);
 insert into public.isitusa_volunteer_applications(id,name,email,interests,skills,motivation,availability,consent_version) values(application,'Synthetic application',applicant::text||'@example.invalid',array['Technology'],'Fixture only','Fixture only','Occasional help','test');
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated','aal','aal1','session_id',manager_session)::text,true);
 set local role authenticated;
 if exists(select 1 from public.isitusa_volunteer_applications where id=application) then raise exception 'FAIL: AAL1 can read applications'; end if;
 rejected:=false;begin perform public.isitusa_review_volunteer(application,0,'approved','general','Test review');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'FAIL: AAL1 can review';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated','aal','aal2','session_id',manager_session)::text,true);
 if not exists(select 1 from public.isitusa_volunteer_applications where id=application) then raise exception 'FAIL: manager cannot read';end if;
 perform public.isitusa_review_volunteer(application,0,'approved','general','Test role approved');
 rejected:=false;begin perform public.isitusa_review_volunteer(application,0,'declined',null,'Stale review');exception when serialization_failure then rejected:=true;end;if not rejected then raise exception 'FAIL: stale review accepted';end if;
 claim:=public.isitusa_begin_volunteer_invite(application,1);
 rejected:=false;begin perform public.isitusa_begin_volunteer_invite(application,2);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL: simultaneous invite accepted';end if;
 rejected:=false;begin perform public.isitusa_finish_volunteer_invite(application,2,volunteer);exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL: wrong account accepted';end if;
 perform public.isitusa_finish_volunteer_invite(application,2,applicant);
 if not exists(select 1 from public.isitusa_staff where user_id=applicant and active and not is_owner and cardinality(permissions)=0) then raise exception 'FAIL: wrong general-role grant';end if;
 if not exists(select 1 from public.isitusa_volunteer_applications where id=application and status='invited' and invited_user_id=applicant) then raise exception 'FAIL: completion not atomic';end if;
 rejected:=false;begin perform public.isitusa_review_volunteer(application,3,'approved','content','Try overwriting');exception when raise_exception then rejected:=true;end;if not rejected then raise exception 'FAIL: invited role can be overwritten';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',volunteer,'role','authenticated','aal','aal2','session_id',volunteer_session)::text,true);
 if exists(select 1 from public.isitusa_volunteer_applications where id=application) then raise exception 'FAIL: ordinary volunteer can read applications';end if;
 rejected:=false;begin perform public.isitusa_review_volunteer(application,3,'declined',null,'Unauthorized');exception when insufficient_privilege then rejected:=true;end;if not rejected then raise exception 'FAIL: volunteer can review applications';end if;
 reset role;
 update public.isitusa_staff set active=false where user_id=manager;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',manager,'role','authenticated','aal','aal2','session_id',manager_session)::text,true);
 set local role authenticated;
 if exists(select 1 from public.isitusa_volunteer_applications where id=application) then raise exception 'FAIL: revoked manager can read applications';end if;
 reset role;
end $$;
rollback;
select 'Passed: MFA, team-only RLS, stale versions, invitation locking, account matching, atomic least-privilege grants, role immutability, volunteer isolation and revocation. All fixtures rolled back.' as verification;
