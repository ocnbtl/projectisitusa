begin;
create table public.isitusa_profile_corrections (
 id uuid primary key default gen_random_uuid(),
 species_id text not null,
 categories text[] not null check(cardinality(categories) between 1 and 9 and categories <@ array['common_name','scientific_name','image','description','identification','action','occurrences','source','other']::text[]),
 details text not null check(length(trim(details)) between 20 and 3000),
 source_url text check(source_url is null or (length(source_url)<=1500 and source_url ~ '^https://')),
 consent_version text not null,
 status text not null default 'submitted' check(status in ('submitted','in_review','resolved','declined')),
 review_note text not null default '' check(length(review_note)<=3000),
 version integer not null default 0,
 reviewed_by uuid references auth.users(id), reviewed_at timestamptz,
 created_at timestamptz not null default now()
);
create index profile_corrections_queue on public.isitusa_profile_corrections(status,created_at desc);
alter table public.isitusa_profile_corrections enable row level security;
revoke all on public.isitusa_profile_corrections from public,anon,authenticated;
grant select on public.isitusa_profile_corrections to authenticated;
grant all on public.isitusa_profile_corrections to service_role;
create policy correction_read on public.isitusa_profile_corrections for select to authenticated
using(isitusa_private.has_permission('content') or isitusa_private.has_permission('review') or isitusa_private.has_permission('approve'));
create function isitusa_private.review_correction(correction uuid, expected_version integer, next_status text, note text)
returns integer language plpgsql security definer set search_path='' as $$
declare current public.isitusa_profile_corrections; result integer;
begin
 if auth.uid() is null or not (isitusa_private.has_permission('content') or isitusa_private.has_permission('review') or isitusa_private.has_permission('approve')) then raise exception 'Access denied' using errcode='42501'; end if;
 if next_status not in ('submitted','in_review','resolved','declined') or next_status is null or note is null or length(trim(note))>3000 then raise exception 'Check the review'; end if;
 if next_status in ('resolved','declined') and not isitusa_private.has_permission('approve') then raise exception 'Approval permission required' using errcode='42501';end if;
 if next_status in ('resolved','declined') and length(trim(note))<10 then raise exception 'Explain the decision';end if;
 select * into current from public.isitusa_profile_corrections where id=correction for update;
 if current.id is null then raise exception 'Suggestion not found';end if;
 if expected_version is null or current.version<>expected_version then raise exception 'This suggestion changed. Refresh before saving.' using errcode='40001';end if;
 update public.isitusa_profile_corrections set status=next_status,review_note=trim(note),version=version+1,reviewed_by=auth.uid(),reviewed_at=now() where id=correction returning version into result;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'correction.review',correction::text,jsonb_build_object('status',next_status,'version',result));
 return result;
end $$;
revoke all on function isitusa_private.review_correction(uuid,integer,text,text) from public,anon;
grant execute on function isitusa_private.review_correction(uuid,integer,text,text) to authenticated;
create function public.isitusa_review_correction(correction uuid,expected_version integer,next_status text,note text)
returns integer language sql security invoker set search_path='' as $$ select isitusa_private.review_correction(correction,expected_version,next_status,note); $$;
revoke all on function public.isitusa_review_correction(uuid,integer,text,text) from public,anon;
grant execute on function public.isitusa_review_correction(uuid,integer,text,text) to authenticated;
commit;
