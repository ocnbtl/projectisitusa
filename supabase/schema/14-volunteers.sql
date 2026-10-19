-- Volunteer intake and human-reviewed onboarding. No public research tables change.
begin;
create table public.isitusa_volunteer_applications (
 id uuid primary key, name text not null check(length(trim(name)) between 1 and 100),
 email text not null check(length(email) between 3 and 254),
 interests text[] not null check(cardinality(interests) between 1 and 7 and interests <@ array['Species research','Writing and editing','Community events','Outreach','Design and accessibility','Technology','Something else']::text[]),
 skills text not null check(length(trim(skills)) between 1 and 2000), motivation text not null check(length(trim(motivation)) between 1 and 1500),
 availability text not null check(length(availability) between 1 and 80), schedule text not null default '' check(length(schedule)<=500),
 consent_version text not null,
 status text not null default 'submitted' check(status in ('submitted','in_review','approved','declined','inviting','invited')),
 role_id text check(role_id in ('sightings','content','events','outreach','general')),
 review_note text not null default '' check(length(review_note)<=2000), version integer not null default 0,
 reviewed_by uuid references auth.users(id), invite_actor uuid references auth.users(id), invite_started_at timestamptz,
 invited_user_id uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(status not in ('approved','inviting','invited') or role_id is not null)
);
create index isitusa_volunteers_queue on public.isitusa_volunteer_applications(status,created_at desc);
create unique index isitusa_volunteers_user on public.isitusa_volunteer_applications(invited_user_id) where invited_user_id is not null;
alter table public.isitusa_volunteer_applications enable row level security;
revoke all on public.isitusa_volunteer_applications from public,anon,authenticated;
grant select on public.isitusa_volunteer_applications to authenticated;
grant all on public.isitusa_volunteer_applications to service_role;
create policy volunteer_team_read on public.isitusa_volunteer_applications for select to authenticated using(isitusa_private.has_permission('team'));

create function isitusa_private.review_volunteer(application uuid, expected_version integer, next_status text, chosen_role text, note text) returns void language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_volunteer_applications;
begin
 if not isitusa_private.has_permission('team') then raise exception 'Team management access required' using errcode='42501'; end if;
 select * into previous from public.isitusa_volunteer_applications where id=application for update;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This application changed. Refresh it before saving.' using errcode='40001'; end if;
 if previous.status in ('inviting','invited') then raise exception 'An invitation has started. Manage existing access through Team access.'; end if;
 if next_status is null or next_status not in ('in_review','approved','declined') or note is null or length(trim(note)) not between 3 and 2000 then raise exception 'Choose a review decision and add a short note'; end if;
 if (chosen_role is not null and chosen_role not in ('sightings','content','events','outreach','general')) or (next_status='approved' and chosen_role is null) then raise exception 'Choose a volunteer role before approving'; end if;
 update public.isitusa_volunteer_applications set status=next_status,role_id=chosen_role,review_note=trim(note),reviewed_by=auth.uid(),version=version+1,updated_at=now() where id=application;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'volunteer.'||next_status,application::text,jsonb_build_object('role',chosen_role,'from',previous.status));
end $$;
create function public.isitusa_review_volunteer(application uuid, expected_version integer, next_status text, chosen_role text, note text) returns void language sql security invoker set search_path='' as $$select isitusa_private.review_volunteer(application,expected_version,next_status,chosen_role,note);$$;
revoke all on function isitusa_private.review_volunteer(uuid,integer,text,text,text), public.isitusa_review_volunteer(uuid,integer,text,text,text) from public,anon;
grant execute on function isitusa_private.review_volunteer(uuid,integer,text,text,text), public.isitusa_review_volunteer(uuid,integer,text,text,text) to authenticated;

create function isitusa_private.begin_volunteer_invite(application uuid, expected_version integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.isitusa_volunteer_applications;
begin
 if not isitusa_private.has_permission('team') then raise exception 'Team management access required' using errcode='42501'; end if;
 select * into item from public.isitusa_volunteer_applications where id=application for update;
 if item.id is null or expected_version is null or item.version<>expected_version then raise exception 'This application changed. Refresh it first.' using errcode='40001'; end if;
 if item.status<>'approved' and not (item.status='inviting' and item.invite_started_at<now()-interval '2 minutes') then raise exception 'Approve a role first, or wait for the current invitation to finish'; end if;
 if exists(select 1 from public.isitusa_staff where lower(email)=lower(item.email)) then raise exception 'This person already has a team record. Manage their access in Team access; this application will not overwrite it.'; end if;
 update public.isitusa_volunteer_applications set status='inviting',invite_actor=auth.uid(),invite_started_at=now(),version=version+1,updated_at=now() where id=application returning * into item;
 return jsonb_build_object('id',item.id,'name',item.name,'email',item.email,'version',item.version);
end $$;
create function public.isitusa_begin_volunteer_invite(application uuid,expected_version integer) returns jsonb language sql security invoker set search_path='' as $$select isitusa_private.begin_volunteer_invite(application,expected_version);$$;
revoke all on function isitusa_private.begin_volunteer_invite(uuid,integer),public.isitusa_begin_volunteer_invite(uuid,integer) from public,anon;
grant execute on function isitusa_private.begin_volunteer_invite(uuid,integer),public.isitusa_begin_volunteer_invite(uuid,integer) to authenticated;

-- Service-only lookup supports recovery after an invitation email succeeds but the response is lost.
-- It never grants access and is not available to browser clients.
create function public.isitusa_volunteer_auth_target(address text) returns uuid language sql security definer set search_path='' as $$select id from auth.users where lower(email)=lower(address) limit 1;$$;
revoke all on function public.isitusa_volunteer_auth_target(text) from public,anon,authenticated;
grant execute on function public.isitusa_volunteer_auth_target(text) to service_role;

create function isitusa_private.finish_volunteer_invite(application uuid,expected_version integer,target uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.isitusa_volunteer_applications; grants text[];
begin
 if not isitusa_private.has_permission('team') then raise exception 'Team management access required' using errcode='42501'; end if;
 select * into item from public.isitusa_volunteer_applications where id=application for update;
 if item.id is null or item.status<>'inviting' or item.invite_actor<>auth.uid() or expected_version is null or item.version<>expected_version then raise exception 'Invitation changed. Refresh before continuing.' using errcode='40001'; end if;
 if target is null or not exists(select 1 from auth.users where id=target and lower(email)=lower(item.email)) then raise exception 'Invitation account does not match the application'; end if;
 perform pg_advisory_xact_lock(hashtextextended(target::text,614));
 if exists(select 1 from public.isitusa_staff where user_id=target) then raise exception 'Existing team access cannot be overwritten by an application'; end if;
 grants:=case item.role_id when 'sightings' then array['review'] when 'content' then array['content'] when 'events' then array['events'] when 'outreach' then array['outreach'] when 'general' then array[]::text[] else null end;
 if grants is null then raise exception 'Invalid volunteer role'; end if;
 perform isitusa_private.save_staff(target,grants,true,item.name);
 update public.isitusa_volunteer_applications set status='invited',invited_user_id=target,version=version+1,updated_at=now() where id=application;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'volunteer.invited',application::text,jsonb_build_object('role',item.role_id,'user_id',target));
end $$;
create function public.isitusa_finish_volunteer_invite(application uuid,expected_version integer,target uuid) returns void language sql security invoker set search_path='' as $$select isitusa_private.finish_volunteer_invite(application,expected_version,target);$$;
revoke all on function isitusa_private.finish_volunteer_invite(uuid,integer,uuid),public.isitusa_finish_volunteer_invite(uuid,integer,uuid) from public,anon;
grant execute on function isitusa_private.finish_volunteer_invite(uuid,integer,uuid),public.isitusa_finish_volunteer_invite(uuid,integer,uuid) to authenticated;

create function isitusa_private.release_volunteer_invite(application uuid,expected_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
 if not isitusa_private.has_permission('team') then raise exception 'Access denied' using errcode='42501'; end if;
 update public.isitusa_volunteer_applications set status='approved',version=version+1,updated_at=now() where id=application and status='inviting' and invite_actor=auth.uid() and version=expected_version;
end $$;
create function public.isitusa_release_volunteer_invite(application uuid,expected_version integer) returns void language sql security invoker set search_path='' as $$select isitusa_private.release_volunteer_invite(application,expected_version);$$;
revoke all on function isitusa_private.release_volunteer_invite(uuid,integer),public.isitusa_release_volunteer_invite(uuid,integer) from public,anon;
grant execute on function isitusa_private.release_volunteer_invite(uuid,integer),public.isitusa_release_volunteer_invite(uuid,integer) to authenticated;
commit;
