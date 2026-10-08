begin;
-- Reservations serialize concurrent uploads below the dedicated project's free storage allowance.
-- Unfinished reservations stay counted until a verified cleanup; they never expire unsafely.
create table public.isitusa_upload_reservations (
 id uuid primary key, bytes bigint not null check(bytes between 0 and 15728640),
 created_at timestamptz not null default now()
);
alter table public.isitusa_upload_reservations enable row level security;
revoke all on public.isitusa_upload_reservations from public,anon,authenticated;
grant all on public.isitusa_upload_reservations to service_role;
create function public.isitusa_reserve_upload(reservation uuid, requested_bytes bigint) returns boolean
language plpgsql security invoker set search_path='' as $$
declare occupied bigint; reserved bigint;
begin
 perform pg_advisory_xact_lock(19281008);
 if requested_bytes<0 or requested_bytes>15728640 then return false; end if;
 if (select count(*) from public.isitusa_sightings)>=5000 then return false; end if;
 select coalesce(sum(case when metadata->>'size' ~ '^[0-9]+$' then (metadata->>'size')::bigint else 5242880 end),0) into occupied from storage.objects;
 select coalesce(sum(bytes),0) into reserved from public.isitusa_upload_reservations;
 if occupied+reserved+requested_bytes>700000000 then return false; end if;
 insert into public.isitusa_upload_reservations(id,bytes) values(reservation,requested_bytes);
 return true;
end $$;
revoke all on function public.isitusa_reserve_upload(uuid,bigint) from public,anon,authenticated;
grant execute on function public.isitusa_reserve_upload(uuid,bigint) to service_role;
commit;
