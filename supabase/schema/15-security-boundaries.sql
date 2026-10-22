-- Incremental security repair; retains data and existing grants.
create or replace function isitusa_private.work_access(kind text, author uuid, assignee uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select coalesce(isitusa_private.has_permission('approve') or
 ((author=auth.uid() or assignee=auth.uid()) and isitusa_private.has_permission(case kind when 'article' then 'content' when 'event' then 'events' else 'outreach' end)),false);
$$;

create or replace function isitusa_private.save_work(record_id uuid, expected_version integer, fields jsonb, next_status text)
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
  if isitusa_private.work_access(previous.kind,previous.created_by,previous.assigned_to) is not true then raise exception 'Access denied' using errcode='42501'; end if;
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

alter policy audit_read on public.isitusa_audit using(isitusa_private.has_permission('team') and (action not in ('crypto.receipt','wallet.address') or isitusa_private.has_permission('finance')));
