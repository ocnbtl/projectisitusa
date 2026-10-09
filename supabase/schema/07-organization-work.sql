-- Incremental organization workflow source. Apply after 01-06.
begin;
alter table public.isitusa_staff drop constraint isitusa_staff_permissions_check;
alter table public.isitusa_staff add constraint isitusa_staff_permissions_check check(permissions <@ array['review','review_decide','audience','finance','analytics','team','content','events','outreach','approve','publish']::text[]);

-- A role describes access, not employment status. Only the owner grants staff powers.
create or replace function isitusa_private.save_staff(target uuid, grants text[], enabled boolean, name text)
returns void language plpgsql security definer set search_path='' as $$
declare target_email text; owner_access boolean;
begin
 if not isitusa_private.has_permission('team') then raise exception 'Access denied' using errcode='42501'; end if;
 if target=auth.uid() or exists(select 1 from public.isitusa_staff where user_id=target and is_owner) then raise exception 'Owner and your own access cannot be changed here'; end if;
 owner_access:=exists(select 1 from public.isitusa_staff where user_id=auth.uid() and is_owner and active);
 if not owner_access and (grants is null or not grants <@ array['review','content','events','outreach']::text[] or exists(select 1 from public.isitusa_staff where user_id=target and not permissions <@ array['review','content','events','outreach']::text[])) then raise exception 'Only the owner can manage staff approval, publication and private administration access' using errcode='42501'; end if;
 if grants is null or not grants <@ array['review','review_decide','audience','finance','analytics','team','content','events','outreach','approve','publish']::text[] or name is null or length(trim(name)) not between 1 and 100 or enabled is null then raise exception 'Invalid team settings'; end if;
 select email into target_email from auth.users where id=target;
 if target_email is null then raise exception 'Invite this user first'; end if;
 insert into public.isitusa_staff(user_id,email,display_name,permissions,active) values(target,target_email,trim(name),grants,enabled)
 on conflict(user_id) do update set permissions=excluded.permissions,active=excluded.active,display_name=excluded.display_name;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'staff.access',target::text,jsonb_build_object('permissions',grants,'active',enabled));
end $$;

create table public.isitusa_work (
 id uuid primary key default gen_random_uuid(),
 kind text not null check(kind in ('article','event','outreach','partner')),
 title text not null check(length(trim(title)) between 1 and 150),
 body text not null default '' check(length(body)<=10000),
 organization text not null default '' check(length(organization)<=150),
 source_url text not null default '' check(length(source_url)<=1000 and (source_url='' or source_url ~ '^https://')),
 due_on date, status text not null default 'draft' check(status in ('draft','in_review','changes_requested','approved','completed','archived')),
 created_by uuid not null references auth.users(id), assigned_to uuid references public.isitusa_staff(user_id),
 approved_by uuid references auth.users(id), review_note text not null default '' check(length(review_note)<=2000),
 version integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.isitusa_work enable row level security;
revoke all on public.isitusa_work from public,anon,authenticated;
grant select on public.isitusa_work to authenticated;
grant all on public.isitusa_work to service_role;
create index isitusa_work_queue on public.isitusa_work(kind,status,updated_at desc);
create index isitusa_work_assignee on public.isitusa_work(assigned_to);
create function isitusa_private.work_access(kind text, author uuid, assignee uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select isitusa_private.has_permission('approve') or
 ((author=auth.uid() or assignee=auth.uid()) and isitusa_private.has_permission(case kind when 'article' then 'content' when 'event' then 'events' else 'outreach' end));
$$;
revoke all on function isitusa_private.work_access(text,uuid,uuid) from public,anon;
grant execute on function isitusa_private.work_access(text,uuid,uuid) to authenticated;
create policy work_read on public.isitusa_work for select to authenticated using(isitusa_private.work_access(kind,created_by,assigned_to));

create function isitusa_private.save_work(record_id uuid, expected_version integer, fields jsonb, next_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_work; result public.isitusa_work; category text; permission text; assignee uuid; reviewer boolean;
begin
 category:=fields->>'kind'; permission:=case category when 'article' then 'content' when 'event' then 'events' else 'outreach' end;
 reviewer:=isitusa_private.has_permission('approve');
 if not reviewer and not isitusa_private.has_permission(permission) then raise exception 'Access denied' using errcode='42501'; end if;
 if category is null or category not in ('article','event','outreach','partner') or next_status is null or next_status not in ('draft','in_review','changes_requested','approved','completed','archived') or fields->>'title' is null or length(trim(fields->>'title')) not between 1 and 150 or coalesce(length(fields->>'body'),0)>10000 then raise exception 'Check the work details'; end if;
 if record_id is not null then
  select * into previous from public.isitusa_work where id=record_id for update;
  if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This record changed. Reload it before saving.' using errcode='40001'; end if;
  if not isitusa_private.work_access(previous.kind,previous.created_by,previous.assigned_to) then raise exception 'Access denied' using errcode='42501'; end if;
  if category<>previous.kind then raise exception 'The type of an existing record cannot change'; end if;
 end if;
 assignee:=nullif(fields->>'assigned_to','')::uuid;
 if assignee is not null and not exists(select 1 from public.isitusa_staff where user_id=assignee and active) then raise exception 'Choose an active team member'; end if;
 if not reviewer then
  if next_status not in ('draft','in_review') or coalesce(previous.status,'draft') not in ('draft','changes_requested') or assignee is distinct from previous.assigned_to then raise exception 'Staff approval is required for this action' using errcode='42501'; end if;
 end if;
 if next_status='approved' and (previous.id is null or previous.status<>'in_review') then raise exception 'Submit this work for review first'; end if;
 if next_status='completed' and previous.status is distinct from 'approved' then raise exception 'Approve this work before completing it'; end if;
 if next_status in ('approved','changes_requested') and length(trim(coalesce(fields->>'review_note','')))<3 then raise exception 'Add a review note'; end if;
 if record_id is null then
  if next_status not in ('draft','in_review') then raise exception 'New work starts as a draft'; end if;
  insert into public.isitusa_work(kind,title,body,organization,source_url,due_on,status,created_by,assigned_to)
  values(category,trim(fields->>'title'),coalesce(fields->>'body',''),coalesce(fields->>'organization',''),coalesce(fields->>'source_url',''),nullif(fields->>'due_on','')::date,next_status,auth.uid(),assignee) returning * into result;
 else
  update public.isitusa_work set title=trim(fields->>'title'),body=coalesce(fields->>'body',''),organization=coalesce(fields->>'organization',''),source_url=coalesce(fields->>'source_url',''),due_on=nullif(fields->>'due_on','')::date,status=next_status,assigned_to=assignee,
   approved_by=case when next_status='approved' then auth.uid() when next_status='completed' then previous.approved_by else null end,
   review_note=case when reviewer then coalesce(fields->>'review_note','') else previous.review_note end,version=version+1,updated_at=now()
   where id=record_id returning * into result;
 end if;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'work.'||next_status,result.id::text,jsonb_build_object('kind',category,'version',result.version,'from',previous.status));
 return to_jsonb(result);
end $$;
revoke all on function isitusa_private.save_work(uuid,integer,jsonb,text) from public,anon;
grant execute on function isitusa_private.save_work(uuid,integer,jsonb,text) to authenticated;
create function public.isitusa_save_work(record_id uuid, expected_version integer, fields jsonb, next_status text)
returns jsonb language sql security invoker set search_path='' as $$ select isitusa_private.save_work(record_id,expected_version,fields,next_status); $$;
revoke all on function public.isitusa_save_work(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.isitusa_save_work(uuid,integer,jsonb,text) to authenticated;

alter table public.isitusa_campaigns drop constraint isitusa_campaigns_status_check;
alter table public.isitusa_campaigns add constraint isitusa_campaigns_status_check check(status in ('draft','in_review','approved','cancelled','queued','sent'));
alter table public.isitusa_campaigns add column review_note text not null default '' check(length(review_note)<=2000);
drop policy campaign_read on public.isitusa_campaigns;
create policy campaign_read on public.isitusa_campaigns for select to authenticated using(isitusa_private.has_permission('audience') or isitusa_private.has_permission('publish') or (created_by=auth.uid() and isitusa_private.has_permission('content')));
create or replace function isitusa_private.campaign(stream text, subject text, body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not (isitusa_private.has_permission('audience') or isitusa_private.has_permission('content')) then raise exception 'Access denied' using errcode='42501'; end if;
 insert into public.isitusa_campaigns(stream,subject,body,created_by) values(stream,trim(subject),trim(body),auth.uid()) returning id into result;
 insert into public.isitusa_audit(actor_id,action,entity_id) values(auth.uid(),'campaign.draft',result::text);
 return result;
end $$;
create or replace function isitusa_private.edit_campaign(campaign uuid, expected_version integer, next_stream text, next_subject text, next_body text, next_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_campaigns;
begin
 if not (isitusa_private.has_permission('audience') or isitusa_private.has_permission('content')) then raise exception 'Access denied' using errcode='42501'; end if;
 if next_stream is null or next_stream not in ('facts','action') or next_status is null or next_status not in ('draft','cancelled') or next_subject is null or length(trim(next_subject)) not between 1 and 150 or next_body is null or length(trim(next_body)) not between 1 and 10000 then raise exception 'Check the subject, message and email choice'; end if;
 select * into previous from public.isitusa_campaigns where id=campaign for update;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This draft changed. Reload it before saving.' using errcode='40001'; end if;
 if not isitusa_private.has_permission('audience') and previous.created_by<>auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
 if previous.status not in ('draft','cancelled') then raise exception 'Return this message to draft before editing'; end if;
 update public.isitusa_campaigns set stream=next_stream,subject=trim(next_subject),body=trim(next_body),status=next_status,version=version+1,updated_at=now(),approved_by=null where id=campaign;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'campaign.edit',campaign::text,jsonb_build_object('from',previous.status,'to',next_status,'version',previous.version+1));
 return jsonb_build_object('id',campaign,'version',previous.version+1,'status',next_status);
end $$;
create function isitusa_private.review_campaign(campaign uuid, expected_version integer, decision text, note text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_campaigns;
begin
 select * into previous from public.isitusa_campaigns where id=campaign for update;
 if not (isitusa_private.has_permission('audience') or isitusa_private.has_permission('publish') or (isitusa_private.has_permission('content') and previous.created_by=auth.uid())) then raise exception 'Access denied' using errcode='42501'; end if;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This draft changed. Reload it before reviewing.' using errcode='40001'; end if;
 if decision='in_review' then
  if previous.status<>'draft' then raise exception 'Only a saved draft can be submitted'; end if;
 elsif decision in ('approved','draft') then
  if not isitusa_private.has_permission('publish') then raise exception 'Staff publication approval required' using errcode='42501'; end if;
  if previous.status not in ('in_review','approved') or (decision='approved' and previous.status<>'in_review') then raise exception 'Check this message status'; end if;
  if length(trim(coalesce(note,'')))<3 then raise exception 'Add a review note'; end if;
 else raise exception 'Choose a valid review action'; end if;
 update public.isitusa_campaigns set status=decision,approved_by=case when decision='approved' then auth.uid() else null end,review_note=coalesce(note,''),version=version+1,updated_at=now() where id=campaign;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'campaign.'||decision,campaign::text,jsonb_build_object('version',previous.version+1));
 return jsonb_build_object('version',previous.version+1,'status',decision);
end $$;
revoke all on function isitusa_private.review_campaign(uuid,integer,text,text) from public,anon;
grant execute on function isitusa_private.review_campaign(uuid,integer,text,text) to authenticated;
create function public.isitusa_review_campaign(campaign uuid, expected_version integer, decision text, note text) returns jsonb language sql security invoker set search_path='' as $$ select isitusa_private.review_campaign(campaign,expected_version,decision,note); $$;
revoke all on function public.isitusa_review_campaign(uuid,integer,text,text) from public,anon;
grant execute on function public.isitusa_review_campaign(uuid,integer,text,text) to authenticated;
commit;
