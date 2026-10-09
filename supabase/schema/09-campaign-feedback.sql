-- Preserve staff feedback across revision and resubmission. Apply after 08.
begin;
create or replace function isitusa_private.review_campaign(campaign uuid, expected_version integer, decision text, note text)
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
 update public.isitusa_campaigns set status=decision,approved_by=case when decision='approved' then auth.uid() else null end,review_note=case when decision='in_review' then previous.review_note else coalesce(note,'') end,version=version+1,updated_at=now() where id=campaign;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'campaign.'||decision,campaign::text,jsonb_build_object('version',previous.version+1,'review_note',case when decision='in_review' then previous.review_note else coalesce(note,'') end));
 return jsonb_build_object('version',previous.version+1,'status',decision);
end $$;
commit;
