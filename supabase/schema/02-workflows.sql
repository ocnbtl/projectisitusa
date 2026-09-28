begin;
-- Called only by the server with its secret key. Public clients cannot execute these.
create function public.isitusa_validate_preferences(p jsonb) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 if jsonb_typeof(p) is distinct from 'object' or jsonb_typeof(p->'streams') is distinct from 'array' or jsonb_typeof(p->'counties') is distinct from 'array' or jsonb_typeof(p->'species') is distinct from 'array' then return false; end if;
 if jsonb_array_length(p->'streams')>4 or jsonb_array_length(p->'counties')>20 or jsonb_array_length(p->'species')>20 then return false; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'streams') s where s not in ('counties','species','facts','action')) then return false; end if;
 if p->'streams' ? 'counties' and jsonb_array_length(p->'counties')=0 then return false; end if;
 if p->'streams' ? 'species' and jsonb_array_length(p->'species')=0 then return false; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'counties') s where not exists(select 1 from public.isitusa_catalog c where c.kind='county' and c.id=s)) then return false; end if;
 if exists(select 1 from jsonb_array_elements_text(p->'species') s where not exists(select 1 from public.isitusa_catalog c where c.kind='species' and c.id=s)) then return false; end if;
 return true;
end $$;

create function public.isitusa_request_email(address text, prefs jsonb, purpose text, hash text, link text)
returns void language plpgsql security invoker set search_path='' as $$
declare person public.isitusa_subscribers; outbox_kind text;
begin
 if purpose not in ('confirm','preferences') or length(hash)<>64 then raise exception 'Invalid request'; end if;
 if purpose='confirm' and (not public.isitusa_validate_preferences(prefs) or jsonb_array_length(prefs->'streams')=0) then raise exception 'Choose valid email preferences'; end if;
 insert into public.isitusa_subscribers(email) values(address) on conflict(email) do nothing;
 select * into person from public.isitusa_subscribers where email=address for update;
 if person.suppression_reason in ('bounce','complaint') then return; end if;
 if exists(select 1 from public.isitusa_outbox where recipient=address and created_at>now()-interval '2 minutes' and kind in ('confirmation','preferences')) then return; end if;
 insert into public.isitusa_tokens(token_hash,subscriber_id,purpose,base_version,proposed_preferences,expires_at)
 values(hash,person.id,purpose,person.version,prefs,now()+case when purpose='confirm' then interval '24 hours' else interval '30 minutes' end);
 outbox_kind:=case when purpose='confirm' then 'confirmation' else 'preferences' end;
 insert into public.isitusa_outbox(subscriber_id,kind,recipient,payload,dedupe_key)
 values(person.id,outbox_kind,address,jsonb_build_object('url',link,'preferences',prefs),'token:'||hash);
end $$;

create function public.isitusa_token_action(hash text, action text, prefs jsonb default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare token public.isitusa_tokens; person public.isitusa_subscribers; chosen jsonb;
begin
 select * into token from public.isitusa_tokens where token_hash=hash;
 select * into person from public.isitusa_subscribers where id=token.subscriber_id for update;
 select * into token from public.isitusa_tokens where token_hash=hash for update;
 if token.used_action='unsubscribe' and action='unsubscribe' then return '{"saved":true}'; end if;
 if token.token_hash is null or token.used_at is not null or token.expires_at<now() then raise exception 'This link has expired. Request a new preferences email.'; end if;
 if token.base_version<>person.version then raise exception 'Your preferences changed since this link was sent. Request a new link.'; end if;
 if action='read' and token.purpose='preferences' then
   return jsonb_build_object('preferences',person.preferences,'suppressed',person.suppressed_at is not null);
 end if;
 if action='unsubscribe' and token.purpose in ('preferences','unsubscribe') then
   update public.isitusa_subscribers set suppressed_at=coalesce(suppressed_at,now()),suppression_reason=coalesce(suppression_reason,'user'),version=version+1 where id=person.id;
   update public.isitusa_tokens set used_at=now(),used_action='superseded' where subscriber_id=person.id and used_at is null;
   update public.isitusa_tokens set used_action=action where token_hash=hash;
   update public.isitusa_outbox set state='suppressed' where subscriber_id=person.id and state='queued';
   insert into public.isitusa_consent_events(subscriber_id,action,consent_version,preferences) values(person.id,'unsubscribe','2026-09-28-v1',person.preferences);
   return '{"saved":true}';
 end if;
 if (action='confirm' and token.purpose='confirm') then chosen:=token.proposed_preferences;
 elsif (action='save' and token.purpose='preferences') then chosen:=prefs;
 else raise exception 'Invalid link action'; end if;
 if not public.isitusa_validate_preferences(chosen) then raise exception 'Check your email preferences'; end if;
 if person.suppression_reason in ('bounce','complaint') then raise exception 'Email delivery is paused for this address'; end if;
 update public.isitusa_subscribers set preferences=chosen,confirmed_at=coalesce(confirmed_at,now()),
 suppressed_at=case when jsonb_array_length(chosen->'streams')=0 then now() else null end,
 suppression_reason=case when jsonb_array_length(chosen->'streams')=0 then 'user' else null end,
 version=version+1 where id=person.id;
 update public.isitusa_tokens set used_at=now(),used_action='superseded' where subscriber_id=person.id and used_at is null;
   update public.isitusa_tokens set used_action=action where token_hash=hash;
 insert into public.isitusa_consent_events(subscriber_id,action,consent_version,preferences) values(person.id,action,'2026-09-28-v1',chosen);
 return '{"saved":true}';
end $$;

create function public.isitusa_rate_limit(key text, maximum integer, seconds integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare total integer;
begin
 insert into public.isitusa_rate_limits(key_hash,hits,reset_at) values(key,1,now()+make_interval(secs=>seconds))
 on conflict(key_hash) do update set hits=case when public.isitusa_rate_limits.reset_at<now() then 1 else public.isitusa_rate_limits.hits+1 end,
 reset_at=case when public.isitusa_rate_limits.reset_at<now() then now()+make_interval(secs=>seconds) else public.isitusa_rate_limits.reset_at end
 returning hits into total;
 return total<=maximum;
end $$;

create function public.isitusa_submit_sighting(sighting uuid, body jsonb, photos jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from public.isitusa_catalog where kind='county' and id=body->>'county_id') then raise exception 'Choose a valid county'; end if;
 if jsonb_array_length(photos)>3 then raise exception 'At most three photographs'; end if;
 if (body->>'observed_on')::date>current_date or (body->>'observed_on')::date<'1900-01-01' then raise exception 'Invalid date'; end if;
 insert into public.isitusa_sightings(id,species_label,county_id,observed_on,location_note,latitude,longitude,notes,contact_email,permission_version)
 values(sighting,body->>'species_label',body->>'county_id',(body->>'observed_on')::date,body->>'location_note',
 (body->>'latitude')::numeric,(body->>'longitude')::numeric,body->>'notes',body->>'contact_email',body->>'permission_version');
 insert into public.isitusa_assets(path,sighting_id,mime,bytes)
 select p->>'path',sighting,p->>'mime',(p->>'bytes')::integer from jsonb_array_elements(photos) p;
 insert into public.isitusa_audit(action,entity_id) values('sighting.received',sighting::text);
 return sighting;
end $$;

-- Event insert and record update are one transaction. Duplicate events make no changes.
create function public.isitusa_stripe_event(event text, event_type text, reference text, request_id uuid, amount integer, currency_code text, payment_state text, address text)
returns void language plpgsql security invoker set search_path='' as $$
declare fresh text; expected public.isitusa_checkout_requests;
begin
 insert into public.isitusa_webhook_events(provider,event_id,event_type) values('stripe',event,event_type)
 on conflict do nothing returning event_id into fresh;
 if fresh is null then return; end if;
 select * into expected from public.isitusa_checkout_requests where id=request_id for update;
 if expected.id is null or expected.amount_minor<>amount or expected.currency<>currency_code or (expected.session_id is not null and expected.session_id<>reference) then raise exception 'Payment does not match its checkout request'; end if;
 update public.isitusa_checkout_requests set session_id=reference where id=request_id;
 if payment_state<>'paid' then return; end if;
 insert into public.isitusa_contributions(provider,provider_reference,currency,amount_minor,decimals,status,supporter_email)
 values('stripe',reference,currency_code,amount,2,'paid',address) on conflict(provider,provider_reference) do nothing;
end $$;
-- Refunds and disputes are shown as distinct provider events pending reconciliation.
-- The paid receipt remains immutable, avoiding out-of-order events reviving a refund.
create table public.isitusa_payment_adjustments (
 provider_event text primary key, payment_reference text not null, kind text not null,
 amount_minor numeric(40,0), currency text, created_at timestamptz not null default now()
);
alter table public.isitusa_payment_adjustments enable row level security;
revoke all on public.isitusa_payment_adjustments from anon,authenticated;
grant select on public.isitusa_payment_adjustments to authenticated;
grant all on public.isitusa_payment_adjustments to service_role;
create policy adjustments_read on public.isitusa_payment_adjustments for select to authenticated using(isitusa_private.has_permission('finance'));

create function public.isitusa_suppress(event text, event_type text, addresses text[], reason text)
returns void language plpgsql security invoker set search_path='' as $$
declare fresh text;
begin
 insert into public.isitusa_webhook_events(provider,event_id,event_type) values('resend',event,event_type)
 on conflict do nothing returning event_id into fresh;
 if fresh is null then return; end if;
 if reason not in ('bounce','complaint') then return; end if;
 update public.isitusa_subscribers set suppressed_at=now(),suppression_reason=reason,version=version+1 where email=any(addresses);
 update public.isitusa_outbox set state='suppressed' where recipient=any(addresses) and state='queued';
 insert into public.isitusa_consent_events(subscriber_id,action,consent_version,preferences)
 select id,reason,'2026-09-28-v1',preferences from public.isitusa_subscribers where email=any(addresses);
end $$;

create table public.isitusa_email_attempts (
 outbox_id uuid not null references public.isitusa_outbox(id),
 attempt integer not null, attempted_at timestamptz not null default now(),
 primary key(outbox_id,attempt)
);
create index isitusa_email_attempt_time on public.isitusa_email_attempts(attempted_at);
alter table public.isitusa_email_attempts enable row level security;
revoke all on public.isitusa_email_attempts from anon,authenticated;
grant all on public.isitusa_email_attempts to service_role;

create function public.isitusa_claim_email() returns setof public.isitusa_outbox
language plpgsql security invoker set search_path='' as $$
declare item public.isitusa_outbox; person public.isitusa_subscribers;
begin
 -- Serialize claim and enforce a conservative 50/day cap including failed attempts.
 perform pg_advisory_xact_lock(19280928);
 if (select count(*) from public.isitusa_email_attempts where attempted_at>now()-interval '24 hours')>=50 then return; end if;
 select * into item from public.isitusa_outbox
 where kind in ('confirmation','preferences') and (state='queued' or (state='sending' and lease_until<now()))
 and attempts<3 and created_at>now()-interval '23 hours'
 order by created_at limit 1 for update skip locked;
 if item.id is null then return; end if;
 if not exists(select 1 from public.isitusa_tokens t where 'token:'||t.token_hash=item.dedupe_key and t.used_at is null and t.expires_at>now()) then update public.isitusa_outbox set state='failed',error_code='expired_link' where id=item.id; return; end if;
 select * into person from public.isitusa_subscribers where id=item.subscriber_id;
 if person.id is null or person.suppression_reason in ('bounce','complaint')
 or (item.kind='digest' and (person.confirmed_at is null or person.suppressed_at is not null or not (person.preferences->'streams' ? item.stream))) then
   update public.isitusa_outbox set state='suppressed' where id=item.id; return;
 end if;
 update public.isitusa_outbox set state='sending',attempts=attempts+1,lease_until=now()+interval '2 minutes' where id=item.id returning * into item;
 insert into public.isitusa_email_attempts(outbox_id,attempt) values(item.id,item.attempts);
 return next item;
end $$;

-- Revoke default PUBLIC execute on every service endpoint, including future overloads.
do $$
declare f record;
begin
 for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace
 and proname in ('isitusa_validate_preferences','isitusa_request_email','isitusa_token_action','isitusa_rate_limit','isitusa_submit_sighting','isitusa_stripe_event','isitusa_suppress','isitusa_claim_email') loop
   execute format('revoke all on function %s from public,anon,authenticated', f.signature);
   execute format('grant execute on function %s to service_role', f.signature);
 end loop;
end $$;
commit;
