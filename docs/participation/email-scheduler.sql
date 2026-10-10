-- Run after pg_cron/pg_net are enabled and Vault contains the separately
-- provisioned isitusa_delivery_job_secret. Never paste a secret into this file.
select cron.schedule('isitusa-email-delivery','* * * * *',$job$
select net.http_post(
 url:='https://cnbcqzecxydgpeejeegy.supabase.co/functions/v1/participation-delivery',
 headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='isitusa_delivery_job_secret')),
 body:='{}'::jsonb, timeout_milliseconds:=15000
) where exists(select 1 from public.isitusa_outbox where kind in ('confirmation','preferences') and (state='queued' or (state='sending' and lease_until<now())) and attempts<3 and created_at>now()-interval '23 hours')
and (select count(*) from public.isitusa_email_attempts where attempted_at>now()-interval '24 hours')<50;
$job$);
