begin;
-- Targeted drafts are not deliveries. The sending pipeline remains inactive.
alter table public.isitusa_campaigns drop constraint isitusa_campaigns_stream_check;
alter table public.isitusa_campaigns add constraint isitusa_campaigns_stream_check check(stream in ('counties','species','facts','action'));
alter table public.isitusa_campaigns add column target_ids text[] not null default '{}';
alter table public.isitusa_campaigns add constraint isitusa_campaigns_target_check check(
 (stream in ('facts','action') and cardinality(target_ids)=0) or
 (stream in ('counties','species') and cardinality(target_ids) between 1 and 20));

create function isitusa_private.save_targeted_campaign(record_id uuid, expected_version integer, next_stream text, next_subject text, next_body text, next_status text, targets text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_campaigns; saved public.isitusa_campaigns; target_kind text;
begin
 if not (isitusa_private.has_permission('audience') or isitusa_private.has_permission('content')) then raise exception 'Access denied' using errcode='42501'; end if;
 if next_stream is null or next_stream not in ('counties','species','facts','action') or next_status is null or next_status not in ('draft','cancelled')
 or length(trim(coalesce(next_subject,''))) not between 1 and 150 or length(trim(coalesce(next_body,''))) not between 1 and 10000 then raise exception 'Check the subject, message and email choice'; end if;
 if targets is null or array_ndims(targets)>1 then raise exception 'Choose a valid audience'; end if;
 target_kind:=case next_stream when 'counties' then 'county' when 'species' then 'species' else null end;
 if target_kind is not null then
  if cardinality(targets) not between 1 and 20 or exists(select 1 from unnest(targets) t where t is null or not exists(select 1 from public.isitusa_catalog c where c.kind=target_kind and c.id=t))
  or (select count(distinct t) from unnest(targets) t)<>cardinality(targets) then raise exception 'Select one to twenty distinct counties or species from the catalog'; end if;
 elsif cardinality(targets)<>0 then raise exception 'This email choice does not use county or species targeting'; end if;
 if record_id is null then
  if next_status<>'draft' then raise exception 'Start with a draft'; end if;
  insert into public.isitusa_campaigns(stream,subject,body,created_by,target_ids) values(next_stream,trim(next_subject),trim(next_body),auth.uid(),targets) returning * into saved;
 else
  select * into previous from public.isitusa_campaigns where id=record_id for update;
  if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This draft changed. Reload it before saving.' using errcode='40001'; end if;
  if not isitusa_private.has_permission('audience') and previous.created_by<>auth.uid() then raise exception 'Access denied' using errcode='42501'; end if;
  if previous.status not in ('draft','cancelled') then raise exception 'Return this message to draft before editing'; end if;
  update public.isitusa_campaigns set stream=next_stream,subject=trim(next_subject),body=trim(next_body),target_ids=targets,status=next_status,version=version+1,updated_at=now(),approved_by=null where id=record_id returning * into saved;
 end if;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'campaign.save',saved.id::text,jsonb_build_object('stream',saved.stream,'targets',saved.target_ids,'version',saved.version));
 return jsonb_build_object('id',saved.id,'version',saved.version,'status',saved.status);
end $$;
revoke all on function isitusa_private.save_targeted_campaign(uuid,integer,text,text,text,text,text[]) from public,anon;
grant execute on function isitusa_private.save_targeted_campaign(uuid,integer,text,text,text,text,text[]) to authenticated;
create function public.isitusa_save_targeted_campaign(record_id uuid, expected_version integer, next_stream text, next_subject text, next_body text, next_status text, targets text[]) returns jsonb
language sql security invoker set search_path='' as $$ select isitusa_private.save_targeted_campaign(record_id,expected_version,next_stream,next_subject,next_body,next_status,targets); $$;
revoke all on function public.isitusa_save_targeted_campaign(uuid,integer,text,text,text,text,text[]) from public,anon;
grant execute on function public.isitusa_save_targeted_campaign(uuid,integer,text,text,text,text,text[]) to authenticated;

-- Every active team member can read the shared room after MFA. No contact list is exposed.
create function isitusa_private.is_team_member() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and auth.jwt()->>'aal'='aal2'
 and exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid())
 and exists(select 1 from public.isitusa_staff s where s.user_id=auth.uid() and s.active),false);
$$;
revoke all on function isitusa_private.is_team_member() from public,anon;
grant execute on function isitusa_private.is_team_member() to authenticated;
create table public.isitusa_team_messages(
 id uuid primary key, parent_id uuid references public.isitusa_team_messages(id),
 author_id uuid not null references auth.users(id), author_name text not null,
 body text not null check(length(trim(body)) between 1 and 4000), created_at timestamptz not null default now()
);
create index isitusa_team_messages_thread on public.isitusa_team_messages(parent_id,created_at,id);
alter table public.isitusa_team_messages enable row level security;
revoke all on public.isitusa_team_messages from public,anon,authenticated;
grant select on public.isitusa_team_messages to authenticated;
grant all on public.isitusa_team_messages to service_role;
create policy team_messages_read on public.isitusa_team_messages for select to authenticated using(isitusa_private.is_team_member());
create function isitusa_private.post_team_message(message_id uuid, thread_id uuid, message_body text) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_team_messages; display text;
begin
 if not isitusa_private.is_team_member() then raise exception 'Active team membership and authenticator verification required' using errcode='42501'; end if;
 if message_id is null or length(trim(coalesce(message_body,''))) not between 1 and 4000 then raise exception 'Write a message of 1 to 4,000 characters'; end if;
 -- Serialize retries for this author, with a modest flood limit.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text,482));
 select * into previous from public.isitusa_team_messages where id=message_id;
 if previous.id is not null then
  if previous.author_id=auth.uid() and previous.parent_id is not distinct from thread_id and previous.body=trim(message_body) then return previous.id; end if;
  raise exception 'Message ID already used';
 end if;
 if (select count(*) from public.isitusa_team_messages where author_id=auth.uid() and created_at>now()-interval '1 minute')>=12 then raise exception 'Please wait a minute before posting again'; end if;
 if thread_id is not null and not exists(select 1 from public.isitusa_team_messages where id=thread_id and parent_id is null) then raise exception 'Choose an existing conversation'; end if;
 select coalesce(nullif(trim(display_name),''),'Team member') into display from public.isitusa_staff where user_id=auth.uid();
 insert into public.isitusa_team_messages(id,parent_id,author_id,author_name,body) values(message_id,thread_id,auth.uid(),display,trim(message_body));
 return message_id;
end $$;
revoke all on function isitusa_private.post_team_message(uuid,uuid,text) from public,anon;
grant execute on function isitusa_private.post_team_message(uuid,uuid,text) to authenticated;
create function public.isitusa_post_team_message(message_id uuid, thread_id uuid, message_body text) returns uuid language sql security invoker set search_path='' as $$ select isitusa_private.post_team_message(message_id,thread_id,message_body); $$;
revoke all on function public.isitusa_post_team_message(uuid,uuid,text) from public,anon;
grant execute on function public.isitusa_post_team_message(uuid,uuid,text) to authenticated;
commit;
