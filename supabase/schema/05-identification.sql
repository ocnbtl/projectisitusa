begin;
-- The observer's original label is preserved. Staff identification is separate,
-- versioned evidence; accepting it does not publish a county determination.
alter table public.isitusa_sightings add column matched_species_id text;
alter table public.isitusa_reviews add column matched_species_id text;

create or replace function isitusa_private.review_sighting(sighting uuid, expected_version integer, next_status text, reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_sightings;
begin
 if not isitusa_private.has_permission('review') then raise exception 'Access denied' using errcode='42501'; end if;
 if next_status is null or next_status not in ('in_review','needs_info','accepted','rejected') or reason is null or length(trim(reason))<3 or length(reason)>2000 then raise exception 'Add a review reason'; end if;
 select * into previous from public.isitusa_sightings where id=sighting for update;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This sighting changed. Refresh before reviewing.' using errcode='40001'; end if;
 if (next_status in ('accepted','rejected') or previous.status in ('accepted','rejected')) and not isitusa_private.has_permission('review_decide') then raise exception 'A lead reviewer must make or reopen a final decision' using errcode='42501'; end if;
 if previous.status in ('accepted','rejected') and next_status<>'in_review' then raise exception 'Reopen this sighting before changing its decision'; end if;
 if next_status='accepted' and not exists(select 1 from public.isitusa_catalog where kind='species' and id=previous.matched_species_id) then raise exception 'Match a catalog species before accepting this observation'; end if;
 update public.isitusa_sightings set status=next_status,review_note=trim(reason),version=version+1 where id=sighting;
 insert into public.isitusa_reviews(sighting_id,actor_id,previous_status,next_status,reason,matched_species_id)
 values(sighting,auth.uid(),previous.status,next_status,trim(reason),previous.matched_species_id);
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'sighting.review',sighting::text,jsonb_build_object('from',previous.status,'to',next_status,'species',previous.matched_species_id));
 return jsonb_build_object('id',sighting,'version',previous.version+1,'status',next_status);
end $$;

create function isitusa_private.review_identification(sighting uuid, expected_version integer, next_status text, reason text, species text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_sightings; result jsonb;
begin
 if not isitusa_private.has_permission('review') then raise exception 'Access denied' using errcode='42501'; end if;
 select * into previous from public.isitusa_sightings where id=sighting for update;
 if previous.id is null or expected_version is null or previous.version<>expected_version then raise exception 'This sighting changed. Refresh before reviewing.' using errcode='40001'; end if;
 if species is not null and not exists(select 1 from public.isitusa_catalog where kind='species' and id=species) then raise exception 'Choose a species from the catalog'; end if;
 -- review_sighting performs the final decision permission check in this same
 -- transaction. A denial rolls back both the identification and audit change.
 update public.isitusa_sightings set matched_species_id=species where id=sighting;
 result:=isitusa_private.review_sighting(sighting,expected_version,next_status,reason);
 if previous.matched_species_id is distinct from species then
  insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'sighting.identification',sighting::text,jsonb_build_object('from',previous.matched_species_id,'to',species));
 end if;
 return result;
end $$;
revoke all on function isitusa_private.review_identification(uuid,integer,text,text,text) from public,anon;
grant execute on function isitusa_private.review_identification(uuid,integer,text,text,text) to authenticated;
create function public.isitusa_review_identification(sighting uuid, expected_version integer, next_status text, reason text, species text)
returns jsonb language sql security invoker set search_path='' as $$ select isitusa_private.review_identification(sighting,expected_version,next_status,reason,species); $$;
revoke all on function public.isitusa_review_identification(uuid,integer,text,text,text) from public,anon;
grant execute on function public.isitusa_review_identification(uuid,integer,text,text,text) to authenticated;
commit;
