-- Ordered schema source, not an applied migration. Create the migration with the CLI.
-- A dedicated IsItUSA project is required. Never apply to a shared research database.
begin;
create schema if not exists isitusa_private;
revoke all on schema isitusa_private from public, anon;
grant usage on schema isitusa_private to authenticated, service_role;

create table public.isitusa_staff (
 user_id uuid primary key references auth.users(id), email text not null,
 display_name text not null, is_owner boolean not null default false,
 active boolean not null default true, permissions text[] not null default '{}',
 created_at timestamptz not null default now(),
 check (permissions <@ array['review','review_decide','audience','finance','analytics','team']::text[])
);
create table public.isitusa_catalog (
 kind text not null check(kind in ('county','species')), id text not null,
 label text not null, release_id text not null, primary key(kind,id)
);
create table public.isitusa_subscribers (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 preferences jsonb not null default '{"streams":[],"counties":[],"species":[]}',
 confirmed_at timestamptz, suppressed_at timestamptz, suppression_reason text,
 version integer not null default 0, created_at timestamptz not null default now()
);
create table public.isitusa_consent_events (
 id bigint generated always as identity primary key,
 subscriber_id uuid not null references public.isitusa_subscribers(id),
 action text not null, consent_version text not null,
 preferences jsonb not null, created_at timestamptz not null default now()
);
create table public.isitusa_tokens (
 token_hash text primary key check(length(token_hash)=64),
 subscriber_id uuid not null references public.isitusa_subscribers(id),
 purpose text not null check(purpose in ('confirm','preferences','unsubscribe')),
 base_version integer not null, proposed_preferences jsonb,
 expires_at timestamptz not null, used_at timestamptz, used_action text
);
create table public.isitusa_sightings (
 id uuid primary key, species_label text not null, county_id text not null,
 observed_on date not null, location_note text not null,
 latitude numeric, longitude numeric, notes text not null,
 contact_email text, permission_version text not null,
 status text not null default 'submitted' check(status in ('submitted','in_review','needs_info','accepted','rejected')),
 version integer not null default 0, review_note text,
 created_at timestamptz not null default now(),
 check(length(notes)<=3000 and length(location_note)<=500),
 check(latitude between -90 and 90), check(longitude between -180 and 180),
 check((latitude is null) = (longitude is null))
);
create table public.isitusa_assets (
 path text primary key, sighting_id uuid not null references public.isitusa_sightings(id),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp')),
 bytes integer not null check(bytes between 12 and 5242880)
);
create table public.isitusa_reviews (
 id bigint generated always as identity primary key, sighting_id uuid not null references public.isitusa_sightings(id),
 actor_id uuid not null references auth.users(id), previous_status text not null,
 next_status text not null, reason text not null, created_at timestamptz not null default now()
);
create table public.isitusa_contributions (
 id uuid primary key default gen_random_uuid(), provider text not null check(provider in ('stripe','crypto')),
 provider_reference text not null, currency text not null, amount_minor numeric(40,0) not null check(amount_minor>0),
 decimals integer not null check(decimals between 0 and 18), status text not null,
 supporter_email text, verification_note text, created_at timestamptz not null default now(),
 unique(provider,provider_reference)
);
create table public.isitusa_wallets (
 id uuid primary key default gen_random_uuid(), asset text not null, network text not null,
 address text not null, verified_at timestamptz not null, verified_by uuid not null references auth.users(id),
 active boolean not null default true, verification_note text not null,
 unique(asset,network,address)
);
create table public.isitusa_checkout_requests (
 id uuid primary key, amount_minor integer not null check(amount_minor between 100 and 1000000),
 currency text not null check(currency='usd'), session_id text unique, created_at timestamptz not null default now()
);
create table public.isitusa_webhook_events (
 provider text not null, event_id text not null, event_type text not null,
 processed_at timestamptz not null default now(), primary key(provider,event_id)
);
create table public.isitusa_outbox (
 id uuid primary key default gen_random_uuid(), subscriber_id uuid references public.isitusa_subscribers(id),
 kind text not null check(kind in ('confirmation','preferences','digest')),
 stream text check(stream in ('counties','species','facts','action')),
 recipient text not null, payload jsonb not null, dedupe_key text not null unique,
 state text not null default 'queued' check(state in ('queued','sending','sent','suppressed','failed')),
 attempts integer not null default 0, lease_until timestamptz, provider_id text,
 created_at timestamptz not null default now(), sent_at timestamptz, error_code text
);
create table public.isitusa_audit (
 id bigint generated always as identity primary key, actor_id uuid, action text not null,
 entity_id text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.isitusa_rate_limits (
 key_hash text primary key, hits integer not null, reset_at timestamptz not null
);
create index isitusa_review_queue on public.isitusa_sightings(status,created_at desc);
create index isitusa_assets_sighting on public.isitusa_assets(sighting_id);
create index isitusa_review_history on public.isitusa_reviews(sighting_id,created_at);
create index isitusa_outbox_queue on public.isitusa_outbox(state,created_at);
create index isitusa_tokens_subscriber on public.isitusa_tokens(subscriber_id);
create index isitusa_subscriber_confirmed on public.isitusa_subscribers(confirmed_at) where suppressed_at is null;
create index isitusa_audit_created on public.isitusa_audit(created_at desc);

-- Fresh membership and session checks also invalidate stale JWT role claims.
create function isitusa_private.has_permission(requested text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid() is not null and auth.jwt()->>'aal' = 'aal2'
 and exists(select 1 from auth.sessions s where s.id=(auth.jwt()->>'session_id')::uuid and s.user_id=auth.uid())
 and exists(select 1 from public.isitusa_staff s where s.user_id=auth.uid() and s.active and (s.is_owner or requested=any(s.permissions))), false);
$$;
revoke all on function isitusa_private.has_permission(text) from public, anon;
grant execute on function isitusa_private.has_permission(text) to authenticated;
create function public.isitusa_can(requested text) returns boolean
language sql stable security invoker set search_path='' as $$ select isitusa_private.has_permission(requested); $$;
revoke all on function public.isitusa_can(text) from public, anon;
grant execute on function public.isitusa_can(text) to authenticated;

-- Enumerating permissions does not disclose anyone else's account.
alter table public.isitusa_staff enable row level security;
create policy staff_read on public.isitusa_staff for select to authenticated
 using ((user_id=auth.uid() and active) or isitusa_private.has_permission('team'));
grant select on public.isitusa_staff to authenticated;
alter table public.isitusa_catalog enable row level security;
create policy catalog_read on public.isitusa_catalog for select to anon, authenticated using(true);
revoke all on public.isitusa_catalog from anon, authenticated;
grant select on public.isitusa_catalog to anon, authenticated;

do $$
declare t text;
begin
 foreach t in array array['subscribers','consent_events','tokens','sightings','assets','reviews','contributions','wallets','checkout_requests','webhook_events','outbox','audit','rate_limits'] loop
   execute format('alter table public.%I enable row level security','isitusa_'||t);
 end loop;
end $$;
-- No anonymous writes and no direct authenticated writes. Changes use checked RPCs.
revoke all on public.isitusa_staff, public.isitusa_subscribers, public.isitusa_consent_events,
 public.isitusa_tokens, public.isitusa_sightings, public.isitusa_assets, public.isitusa_reviews,
 public.isitusa_contributions, public.isitusa_wallets, public.isitusa_checkout_requests,
 public.isitusa_webhook_events, public.isitusa_outbox, public.isitusa_audit, public.isitusa_rate_limits
 from anon, authenticated;
grant select on public.isitusa_staff, public.isitusa_subscribers, public.isitusa_consent_events,
 public.isitusa_sightings, public.isitusa_assets, public.isitusa_reviews, public.isitusa_contributions,
 public.isitusa_wallets, public.isitusa_audit to authenticated;
create policy audience_read on public.isitusa_subscribers for select to authenticated using(isitusa_private.has_permission('audience'));
create policy consent_read on public.isitusa_consent_events for select to authenticated using(isitusa_private.has_permission('audience'));
create policy sightings_read on public.isitusa_sightings for select to authenticated using(isitusa_private.has_permission('review'));
create policy assets_read on public.isitusa_assets for select to authenticated using(isitusa_private.has_permission('review'));
create policy reviews_read on public.isitusa_reviews for select to authenticated using(isitusa_private.has_permission('review'));
create policy contributions_read on public.isitusa_contributions for select to authenticated using(isitusa_private.has_permission('finance'));
create policy wallets_read on public.isitusa_wallets for select to authenticated using(isitusa_private.has_permission('finance'));
create policy audit_read on public.isitusa_audit for select to authenticated using(isitusa_private.has_permission('team'));
grant all on public.isitusa_staff, public.isitusa_catalog, public.isitusa_subscribers, public.isitusa_consent_events,
 public.isitusa_tokens, public.isitusa_sightings, public.isitusa_assets, public.isitusa_reviews,
 public.isitusa_contributions, public.isitusa_wallets, public.isitusa_checkout_requests,
 public.isitusa_webhook_events, public.isitusa_outbox, public.isitusa_audit, public.isitusa_rate_limits to service_role;
grant usage, select on sequence public.isitusa_consent_events_id_seq, public.isitusa_reviews_id_seq, public.isitusa_audit_id_seq to service_role;

create function isitusa_private.review_sighting(sighting uuid, expected_version integer, next_status text, reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare previous public.isitusa_sightings;
begin
 if not isitusa_private.has_permission('review') then raise exception 'Access denied' using errcode='42501'; end if;
 if next_status not in ('in_review','needs_info','accepted','rejected') or length(trim(reason))<3 or length(reason)>2000 then raise exception 'Add a review reason'; end if;
 select * into previous from public.isitusa_sightings where id=sighting for update;
 if previous.id is null or previous.version<>expected_version then raise exception 'This sighting changed. Refresh before reviewing.' using errcode='40001'; end if;
 if (next_status in ('accepted','rejected') or previous.status in ('accepted','rejected')) and not isitusa_private.has_permission('review_decide') then raise exception 'A lead reviewer must make or reopen a final decision' using errcode='42501'; end if;
 if previous.status in ('accepted','rejected') and next_status<>'in_review' then raise exception 'Reopen this sighting before changing its decision'; end if;
 if previous.status=next_status then raise exception 'Choose a different status'; end if;
 update public.isitusa_sightings set status=next_status, review_note=trim(reason), version=version+1 where id=sighting;
 insert into public.isitusa_reviews(sighting_id,actor_id,previous_status,next_status,reason)
 values(sighting,auth.uid(),previous.status,next_status,trim(reason));
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'sighting.review',sighting::text,jsonb_build_object('from',previous.status,'to',next_status));
 return jsonb_build_object('id',sighting,'version',previous.version+1,'status',next_status);
end $$;
revoke all on function isitusa_private.review_sighting(uuid,integer,text,text) from public,anon;
grant execute on function isitusa_private.review_sighting(uuid,integer,text,text) to authenticated;
create function public.isitusa_review(sighting uuid, expected_version integer, next_status text, reason text)
returns jsonb language sql security invoker set search_path='' as $$ select isitusa_private.review_sighting(sighting,expected_version,next_status,reason); $$;
revoke all on function public.isitusa_review(uuid,integer,text,text) from public,anon;
grant execute on function public.isitusa_review(uuid,integer,text,text) to authenticated;

create function isitusa_private.save_staff(target uuid, grants text[], enabled boolean, name text)
returns void language plpgsql security definer set search_path='' as $$
declare target_email text;
begin
 if not isitusa_private.has_permission('team') then raise exception 'Access denied' using errcode='42501'; end if;
 if target=auth.uid() or exists(select 1 from public.isitusa_staff where user_id=target and is_owner) then raise exception 'Owner and your own access cannot be changed here'; end if;
 if not exists(select 1 from public.isitusa_staff where user_id=auth.uid() and is_owner and active) and (not grants <@ array['review']::text[] or exists(select 1 from public.isitusa_staff where user_id=target and not permissions <@ array['review']::text[])) then raise exception 'Only the owner can manage elevated access' using errcode='42501'; end if;
 if not grants <@ array['review','review_decide','audience','finance','analytics','team']::text[] or length(trim(name))<1 or length(name)>100 then raise exception 'Invalid team settings'; end if;
 select email into target_email from auth.users where id=target;
 if target_email is null then raise exception 'Invite this user first'; end if;
 insert into public.isitusa_staff(user_id,email,display_name,permissions,active) values(target,target_email,trim(name),grants,enabled)
 on conflict(user_id) do update set permissions=excluded.permissions,active=excluded.active,display_name=excluded.display_name;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'staff.access',target::text,jsonb_build_object('permissions',grants,'active',enabled));
end $$;
revoke all on function isitusa_private.save_staff(uuid,text[],boolean,text) from public,anon;
grant execute on function isitusa_private.save_staff(uuid,text[],boolean,text) to authenticated;
create function public.isitusa_save_staff(target uuid, grants text[], enabled boolean, name text) returns void
language sql security invoker set search_path='' as $$ select isitusa_private.save_staff(target,grants,enabled,name); $$;
revoke all on function public.isitusa_save_staff(uuid,text[],boolean,text) from public,anon;
grant execute on function public.isitusa_save_staff(uuid,text[],boolean,text) to authenticated;

-- Private originals only. Public publication requires a separately reviewed, stripped copy.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('isitusa-sightings','isitusa-sightings',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy isitusa_private_photo_read on storage.objects for select to authenticated
 using(bucket_id='isitusa-sightings' and isitusa_private.has_permission('review')
 and exists(select 1 from public.isitusa_assets a where a.path=name));
commit;
