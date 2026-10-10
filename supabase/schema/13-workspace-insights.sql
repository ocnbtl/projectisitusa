begin;
create function isitusa_private.workspace_insights(section text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if section is null or section not in ('audience','finance') or auth.uid() is null or not coalesce(isitusa_private.has_permission(section),false) then raise exception 'Access denied' using errcode='42501'; end if;
 if section='audience' then
  select jsonb_build_object('total',count(*),'confirmed',count(*) filter(where confirmed_at is not null and suppressed_at is null),'pending',count(*) filter(where confirmed_at is null and suppressed_at is null),'suppressed',count(*) filter(where suppressed_at is not null),'joined30',count(*) filter(where created_at>=now()-interval '30 days')) into result from public.isitusa_subscribers;
  result:=result||jsonb_build_object('monthly',coalesce((select jsonb_agg(row_to_json(m)) from (select to_char(date_trunc('month',created_at at time zone 'UTC'),'YYYY-MM') as month,count(*) as joined from public.isitusa_subscribers where created_at>=date_trunc('month',now())-interval '11 months' group by 1 order by 1) m),'[]'::jsonb));
  result:=result||jsonb_build_object('delivery30',coalesce((select jsonb_agg(row_to_json(d)) from (select state,count(*) as messages from public.isitusa_outbox where created_at>=now()-interval '30 days' group by state order by state) d),'[]'::jsonb));
 else
  select jsonb_build_object('receipts',count(*),'receipts30',count(*) filter(where created_at>=now()-interval '30 days')) into result from public.isitusa_contributions;
  result:=result||jsonb_build_object('currencies',coalesce((select jsonb_agg(row_to_json(c)) from (select currency,decimals,count(*) as receipts,sum(amount_minor)::text as amount_minor from public.isitusa_contributions group by currency,decimals order by currency) c),'[]'::jsonb));
  result:=result||jsonb_build_object('monthly',coalesce((select jsonb_agg(row_to_json(m)) from (select to_char(date_trunc('month',created_at at time zone 'UTC'),'YYYY-MM') as month,currency,decimals,count(*) as receipts,sum(amount_minor)::text as amount_minor from public.isitusa_contributions where created_at>=date_trunc('month',now())-interval '11 months' group by 1,currency,decimals order by 1,currency) m),'[]'::jsonb));
 end if;
 return result||jsonb_build_object('checkedAt',now());
end $$;
revoke all on function isitusa_private.workspace_insights(text) from public,anon;
grant execute on function isitusa_private.workspace_insights(text) to authenticated;
create function public.isitusa_workspace_insights(section text)
returns jsonb language sql stable security invoker set search_path='' as $$ select isitusa_private.workspace_insights(section); $$;
revoke all on function public.isitusa_workspace_insights(text) from public,anon;
grant execute on function public.isitusa_workspace_insights(text) to authenticated;
commit;
