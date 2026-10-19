-- Operational sighting publications remain separate from compiled research determinations.
begin;
alter table public.isitusa_sightings add column authority_sharing boolean not null default false;
create table public.isitusa_sighting_publications (
 sighting_id uuid primary key references public.isitusa_sightings(id), review_version integer not null,
 active boolean not null default true, summary text not null check(length(trim(summary)) between 20 and 1200),
 published_at timestamptz not null default now(), published_by uuid not null references auth.users(id)
);
create table public.isitusa_sighting_referrals (
 sighting_id uuid primary key references public.isitusa_sightings(id), review_version integer not null,
 authority text not null check(length(trim(authority)) between 3 and 160),
 destination text not null check(destination ~ '^https://[^[:space:]]+$' and length(destination)<=600),
 source_url text not null check(source_url ~ '^https://[^[:space:]]+$' and length(source_url)<=600),
 rationale text not null check(length(trim(rationale)) between 10 and 1000),
 status text not null check(status in ('prepared','submitted')),
 receipt text not null default '' check(length(receipt)<=1000),
 updated_at timestamptz not null default now(), actor_id uuid not null references auth.users(id),
 check(status<>'submitted' or length(trim(receipt))>=3)
);
alter table public.isitusa_sighting_publications enable row level security;
alter table public.isitusa_sighting_referrals enable row level security;
revoke all on public.isitusa_sighting_publications,public.isitusa_sighting_referrals from public,anon,authenticated;
grant select on public.isitusa_sighting_publications,public.isitusa_sighting_referrals to authenticated;
grant all on public.isitusa_sighting_publications,public.isitusa_sighting_referrals to service_role;
create policy sighting_publication_review on public.isitusa_sighting_publications for select to authenticated using(isitusa_private.has_permission('review'));
create policy sighting_referral_review on public.isitusa_sighting_referrals for select to authenticated using(isitusa_private.has_permission('review'));

-- Fixed public projection: never return the observer label, freeform notes, contact,
-- precise location, originals, review notes, staff identifiers or referral details.
create function public.isitusa_public_observations(record_id uuid default null, county text default null, species text default null, page_number integer default 0)
returns table(id uuid,species_id text,species_name text,county_id text,county_name text,observed_on date,summary text,published_at timestamptz)
language sql stable security definer set search_path='' as $$
 select s.id,s.matched_species_id,sp.label,s.county_id,c.label,s.observed_on,p.summary,p.published_at
 from public.isitusa_sighting_publications p join public.isitusa_sightings s on s.id=p.sighting_id
 join public.isitusa_catalog sp on sp.kind='species' and sp.id=s.matched_species_id
 join public.isitusa_catalog c on c.kind='county' and c.id=s.county_id
 where p.active and s.status='accepted' and s.version=p.review_version
 and (record_id is null or s.id=record_id) and (county is null or s.county_id=county)
 and (species is null or s.matched_species_id=species)
 order by p.published_at desc,s.id limit 51 offset least(greatest(coalesce(page_number,0),0),100)*50;
$$;
revoke all on function public.isitusa_public_observations(uuid,text,text,integer) from public;
grant execute on function public.isitusa_public_observations(uuid,text,text,integer) to anon,authenticated,service_role;

create function isitusa_private.publish_observation(sighting uuid,expected_version integer,public_summary text,visible boolean)
returns void language plpgsql security definer set search_path='' as $$
declare item public.isitusa_sightings;
begin
 if not isitusa_private.has_permission('review_decide') then raise exception 'Lead review access required' using errcode='42501'; end if;
 select * into item from public.isitusa_sightings where id=sighting for update;
 if item.id is null or expected_version is null or item.version<>expected_version then raise exception 'The observation changed. Refresh before publishing.' using errcode='40001'; end if;
 if visible is null or public_summary is null or length(trim(public_summary)) not between 20 and 1200 then raise exception 'Write a public summary without personal or precise location details'; end if;
 if visible and (item.status<>'accepted' or item.matched_species_id is null) then raise exception 'Accept an identified observation before publishing'; end if;
 insert into public.isitusa_sighting_publications(sighting_id,review_version,active,summary,published_by)
 values(sighting,item.version,visible,trim(public_summary),auth.uid())
 on conflict(sighting_id) do update set review_version=excluded.review_version,active=excluded.active,summary=excluded.summary,published_by=excluded.published_by,published_at=now();
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'sighting.publication',sighting::text,jsonb_build_object('visible',visible,'version',item.version,'summary',trim(public_summary)));
end $$;
create function public.isitusa_publish_observation(sighting uuid,expected_version integer,public_summary text,visible boolean)
returns void language sql security invoker set search_path='' as $$select isitusa_private.publish_observation(sighting,expected_version,public_summary,visible);$$;

create function isitusa_private.save_sighting_referral(sighting uuid,expected_version integer,authority_name text,destination_url text,verification_url text,reason text,submitted boolean,confirmation text)
returns void language plpgsql security definer set search_path='' as $$
declare item public.isitusa_sightings;
begin
 if not isitusa_private.has_permission('review_decide') then raise exception 'Lead review access required' using errcode='42501'; end if;
 select * into item from public.isitusa_sightings where id=sighting for update;
 if item.id is null or expected_version is null or item.version<>expected_version then raise exception 'The observation changed. Refresh before referring.' using errcode='40001'; end if;
 if item.status<>'accepted' or not item.authority_sharing then raise exception 'Accept the observation and obtain sharing permission before preparing a referral'; end if;
 if submitted is null then raise exception 'Choose a referral state'; end if;
 insert into public.isitusa_sighting_referrals(sighting_id,review_version,authority,destination,source_url,rationale,status,receipt,actor_id)
 values(sighting,item.version,trim(authority_name),destination_url,verification_url,trim(reason),case when submitted then 'submitted' else 'prepared' end,trim(confirmation),auth.uid())
 on conflict(sighting_id) do update set review_version=excluded.review_version,authority=excluded.authority,destination=excluded.destination,source_url=excluded.source_url,rationale=excluded.rationale,status=excluded.status,receipt=excluded.receipt,updated_at=now(),actor_id=excluded.actor_id;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'sighting.referral',sighting::text,jsonb_build_object('authority',authority_name,'destination',destination_url,'source',verification_url,'reason',reason,'submitted',submitted,'receipt',confirmation,'version',item.version));
end $$;
create function public.isitusa_save_sighting_referral(sighting uuid,expected_version integer,authority_name text,destination_url text,verification_url text,reason text,submitted boolean,confirmation text)
returns void language sql security invoker set search_path='' as $$ select isitusa_private.save_sighting_referral(sighting,expected_version,authority_name,destination_url,verification_url,reason,submitted,confirmation); $$;
revoke all on function isitusa_private.publish_observation(uuid,integer,text,boolean),public.isitusa_publish_observation(uuid,integer,text,boolean),isitusa_private.save_sighting_referral(uuid,integer,text,text,text,text,boolean,text),public.isitusa_save_sighting_referral(uuid,integer,text,text,text,text,boolean,text) from public,anon;
grant execute on function isitusa_private.publish_observation(uuid,integer,text,boolean),public.isitusa_publish_observation(uuid,integer,text,boolean),isitusa_private.save_sighting_referral(uuid,integer,text,text,text,text,boolean,text),public.isitusa_save_sighting_referral(uuid,integer,text,text,text,text,boolean,text) to authenticated;
-- Persist a separately optional sharing choice atomically with intake.
create or replace function public.isitusa_submit_sighting(sighting uuid,body jsonb,photos jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.isitusa_catalog where kind='county' and id=body->>'county_id') then raise exception 'Choose a valid county'; end if;
 if jsonb_array_length(photos)>3 then raise exception 'At most three photographs'; end if;
 if (body->>'observed_on')::date>current_date or (body->>'observed_on')::date<'1900-01-01' then raise exception 'Invalid date'; end if;
 insert into public.isitusa_sightings(id,species_label,county_id,observed_on,location_note,latitude,longitude,notes,contact_email,permission_version,authority_sharing)
 values(sighting,body->>'species_label',body->>'county_id',(body->>'observed_on')::date,body->>'location_note',(body->>'latitude')::numeric,(body->>'longitude')::numeric,body->>'notes',body->>'contact_email',body->>'permission_version',coalesce((body->>'authority_sharing')::boolean,false));
 insert into public.isitusa_assets(path,sighting_id,mime,bytes) select p->>'path',sighting,p->>'mime',(p->>'bytes')::integer from jsonb_array_elements(photos) p;
 insert into public.isitusa_audit(action,entity_id) values('sighting.received',sighting::text);
 return sighting;
end $$;
commit;
