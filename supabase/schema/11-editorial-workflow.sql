begin;
-- Editorial workflow only; these records never change county evidence or publish text.
create table public.isitusa_editorial_tasks(
 species_id text primary key, status text not null default 'in_progress' check(status in ('queued','in_progress','in_review','reviewed')),
 draft text not null default '' check(length(draft)<=6000), notes text not null default '' check(length(notes)<=6000),
 sources text[] not null default '{}' check(cardinality(sources)<=20),
 version integer not null default 0, updated_by uuid not null references auth.users(id), updated_at timestamptz not null default now()
);
alter table public.isitusa_editorial_tasks enable row level security;
revoke all on public.isitusa_editorial_tasks from public,anon,authenticated;
grant select on public.isitusa_editorial_tasks to authenticated;
grant all on public.isitusa_editorial_tasks to service_role;
create policy editorial_read on public.isitusa_editorial_tasks for select to authenticated using(isitusa_private.has_permission('content') or isitusa_private.has_permission('review') or isitusa_private.has_permission('approve'));
create function isitusa_private.save_editorial(species text, expected_version integer, next_status text, next_draft text, next_notes text, next_sources text[]) returns integer language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_editorial_tasks; result integer;
begin
 if not (isitusa_private.has_permission('content') or isitusa_private.has_permission('review') or isitusa_private.has_permission('approve')) then raise exception 'Access denied' using errcode='42501';end if;
 if not exists(select 1 from public.isitusa_catalog where kind='species' and id=species) then raise exception 'Choose a catalog species';end if;
 if next_status is null or next_status not in ('queued','in_progress','in_review','reviewed') or next_sources is null or cardinality(next_sources)>20 or array_ndims(next_sources)>1 or exists(select 1 from unnest(next_sources) u where u is null or u !~ '^https?://' or length(u)>1500) then raise exception 'Check the status and source links';end if;
 if next_status in ('in_review','reviewed') and (length(trim(coalesce(next_draft,'')))<30 or cardinality(next_sources)=0) then raise exception 'Add a useful description and its sources before review';end if;
 if next_status='reviewed' and not isitusa_private.has_permission('approve') then raise exception 'Staff review permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(species,921));
 select * into previous from public.isitusa_editorial_tasks where species_id=species for update;
 if (previous.species_id is null and expected_version is not null) or (previous.species_id is not null and (expected_version is null or previous.version<>expected_version)) then raise exception 'This research changed. Reload it before saving.' using errcode='40001';end if;
 insert into public.isitusa_editorial_tasks(species_id,status,draft,notes,sources,updated_by) values(species,next_status,trim(next_draft),trim(next_notes),next_sources,auth.uid())
 on conflict(species_id) do update set status=excluded.status,draft=excluded.draft,notes=excluded.notes,sources=excluded.sources,version=isitusa_editorial_tasks.version+1,updated_by=auth.uid(),updated_at=now() returning version into result;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'editorial.save',species,jsonb_build_object('status',next_status,'version',result));
 return result;
end $$;
revoke all on function isitusa_private.save_editorial(text,integer,text,text,text,text[]) from public,anon;
grant execute on function isitusa_private.save_editorial(text,integer,text,text,text,text[]) to authenticated;
create function public.isitusa_save_editorial(species text, expected_version integer, next_status text, next_draft text, next_notes text, next_sources text[]) returns integer language sql security invoker set search_path='' as $$ select isitusa_private.save_editorial(species,expected_version,next_status,next_draft,next_notes,next_sources); $$;
revoke all on function public.isitusa_save_editorial(text,integer,text,text,text,text[]) from public,anon;
grant execute on function public.isitusa_save_editorial(text,integer,text,text,text,text[]) to authenticated;
commit;
