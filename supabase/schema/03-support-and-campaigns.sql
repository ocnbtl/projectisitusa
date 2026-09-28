begin;
-- Numeric atomic crypto amounts cross the API as text, never rounded JS numbers.
create view public.isitusa_contribution_records with(security_invoker=true) as
 select id,provider,provider_reference,currency,amount_minor::text as amount_minor,decimals,status,supporter_email,verification_note,created_at
 from public.isitusa_contributions;
revoke all on public.isitusa_contribution_records from public,anon,authenticated;
grant select on public.isitusa_contribution_records to authenticated;

create function isitusa_private.crypto_receipt(asset text, reference text, atomic_amount text, note text)
returns void language plpgsql security definer set search_path='' as $$
declare precision integer;
begin
 if not isitusa_private.has_permission('finance') then raise exception 'Access denied' using errcode='42501'; end if;
 if asset not in ('BTC','XMR','ETH') or atomic_amount !~ '^[0-9]{1,38}$' or atomic_amount::numeric<=0
 or length(trim(note))<10 or length(note)>1000 or length(trim(reference))<10 or length(reference)>180 then raise exception 'Check the verified receipt details'; end if;
 precision:=case asset when 'BTC' then 8 when 'XMR' then 12 else 18 end;
 insert into public.isitusa_contributions(provider,provider_reference,currency,amount_minor,decimals,status,verification_note)
 values('crypto',asset||':mainnet:'||trim(reference),asset,atomic_amount::numeric,precision,'manually_verified',trim(note));
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'crypto.receipt',asset||':'||trim(reference),jsonb_build_object('amount_minor',atomic_amount,'verification',trim(note)));
end $$;
revoke all on function isitusa_private.crypto_receipt(text,text,text,text) from public,anon;
grant execute on function isitusa_private.crypto_receipt(text,text,text,text) to authenticated;
create function public.isitusa_crypto_receipt(asset text, reference text, atomic_amount text, note text)
returns void language sql security invoker set search_path='' as $$ select isitusa_private.crypto_receipt(asset,reference,atomic_amount,note); $$;
revoke all on function public.isitusa_crypto_receipt(text,text,text,text) from public,anon;
grant execute on function public.isitusa_crypto_receipt(text,text,text,text) to authenticated;

create function isitusa_private.wallet(asset text, address text, note text)
returns void language plpgsql security definer set search_path='' as $$
declare chain text; wallet_id uuid;
begin
 if not isitusa_private.has_permission('finance') or not exists(select 1 from public.isitusa_staff where user_id=auth.uid() and is_owner and active) then raise exception 'Owner access required' using errcode='42501'; end if;
 if length(trim(note))<10 or length(note)>1000 then raise exception 'Record how ownership, checksum and network were verified'; end if;
 if asset='BTC' and address ~ '^(bc1[ac-hj-np-z02-9]{20,90}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$' then chain:='Bitcoin mainnet';
 elsif asset='XMR' and address ~ '^[48][1-9A-HJ-NP-Za-km-z]{94}$' then chain:='Monero mainnet';
 elsif asset='ETH' and address ~ '^0x[a-fA-F0-9]{40}$' then chain:='Ethereum mainnet';
 else raise exception 'Check the public receiving address and network'; end if;
 -- Serialize address replacement. Syntax checks do not claim ownership or checksum verification.
 perform pg_advisory_xact_lock(19280929);
 update public.isitusa_wallets w set active=false where w.asset=wallet.asset;
 insert into public.isitusa_wallets(asset,network,address,verified_at,verified_by,verification_note)
 values(asset,chain,address,now(),auth.uid(),trim(note))
 on conflict on constraint isitusa_wallets_asset_network_address_key do update set active=true,verified_at=now(),verified_by=auth.uid(),verification_note=excluded.verification_note
 returning id into wallet_id;
 insert into public.isitusa_audit(actor_id,action,entity_id,detail) values(auth.uid(),'wallet.address',wallet_id::text,jsonb_build_object('asset',asset,'network',chain,'address',address,'verification',note));
end $$;
revoke all on function isitusa_private.wallet(text,text,text) from public,anon;
grant execute on function isitusa_private.wallet(text,text,text) to authenticated;
create function public.isitusa_wallet(asset text, address text, note text) returns void
language sql security invoker set search_path='' as $$ select isitusa_private.wallet(asset,address,note); $$;
revoke all on function public.isitusa_wallet(text,text,text) from public,anon;
grant execute on function public.isitusa_wallet(text,text,text) to authenticated;

-- Facts and action emails are prepared explicitly. County/species digests also need
-- the approved publication adapter described in architecture.md before scheduling.
create table public.isitusa_campaigns(
 id uuid primary key default gen_random_uuid(), stream text not null check(stream in ('facts','action')),
 subject text not null check(length(subject) between 1 and 150), body text not null check(length(body) between 1 and 10000),
 status text not null default 'draft' check(status in ('draft','approved','cancelled')),
 created_by uuid not null references auth.users(id), approved_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
alter table public.isitusa_campaigns enable row level security;
revoke all on public.isitusa_campaigns from anon,authenticated;
grant select on public.isitusa_campaigns to authenticated;
grant all on public.isitusa_campaigns to service_role;
create policy campaign_read on public.isitusa_campaigns for select to authenticated using(isitusa_private.has_permission('audience'));
create function isitusa_private.campaign(stream text, subject text, body text) returns uuid
language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 if not isitusa_private.has_permission('audience') then raise exception 'Access denied' using errcode='42501'; end if;
 insert into public.isitusa_campaigns(stream,subject,body,created_by) values(stream,subject,body,auth.uid()) returning id into result;
 insert into public.isitusa_audit(actor_id,action,entity_id) values(auth.uid(),'campaign.draft',result::text);
 return result;
end $$;
revoke all on function isitusa_private.campaign(text,text,text) from public,anon;
grant execute on function isitusa_private.campaign(text,text,text) to authenticated;
create function public.isitusa_campaign(stream text, subject text, body text) returns uuid
language sql security invoker set search_path='' as $$ select isitusa_private.campaign(stream,subject,body); $$;
revoke all on function public.isitusa_campaign(text,text,text) from public,anon;
grant execute on function public.isitusa_campaign(text,text,text) to authenticated;
commit;
