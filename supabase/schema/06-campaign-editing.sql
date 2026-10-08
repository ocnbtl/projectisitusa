-- Incremental source. Apply once to the dedicated Isitusa project after 01-05.
begin;
alter table public.isitusa_campaigns add column version integer not null default 0;
alter table public.isitusa_campaigns add column updated_at timestamptz not null default now();

create function isitusa_private.edit_campaign(campaign uuid, expected_version integer, next_stream text, next_subject text, next_body text, next_status text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_campaigns;
begin
 if not isitusa_private.has_permission('audience') then raise exception 'Access denied' using errcode='42501'; end if;
 if next_stream is null or next_stream not in ('facts','action') or next_status is null or next_status not in ('draft','cancelled')
 or next_subject is null or length(trim(next_subject)) not between 1 and 150
 or next_body is null or length(trim(next_body)) not between 1 and 10000 then raise exception 'Check the subject, message and email choice'; end if;
 select * into previous from public.isitusa_campaigns where id=campaign for update;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This draft changed. Reload it before saving.' using errcode='40001'; end if;
 if previous.status='approved' then raise exception 'An approved message cannot be edited here'; end if;
 update public.isitusa_campaigns set stream=next_stream,subject=trim(next_subject),body=trim(next_body),status=next_status,version=version+1,updated_at=now() where id=campaign;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'campaign.edit',campaign::text,jsonb_build_object('from',previous.status,'to',next_status,'version',previous.version+1));
 return jsonb_build_object('id',campaign,'version',previous.version+1,'status',next_status);
end $$;
revoke all on function isitusa_private.edit_campaign(uuid,integer,text,text,text,text) from public,anon;
grant execute on function isitusa_private.edit_campaign(uuid,integer,text,text,text,text) to authenticated;
create function public.isitusa_edit_campaign(campaign uuid, expected_version integer, next_stream text, next_subject text, next_body text, next_status text)
returns jsonb language sql security invoker set search_path='' as $$ select isitusa_private.edit_campaign(campaign,expected_version,next_stream,next_subject,next_body,next_status); $$;
revoke all on function public.isitusa_edit_campaign(uuid,integer,text,text,text,text) from public,anon;
grant execute on function public.isitusa_edit_campaign(uuid,integer,text,text,text,text) to authenticated;
commit;
