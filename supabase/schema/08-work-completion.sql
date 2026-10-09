-- Completion preserves the content that staff approved. Apply after 07.
begin;
create function isitusa_private.preserve_approved_work() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.status='approved' and new.status='completed' and
  row(new.kind,new.title,new.body,new.organization,new.source_url,new.due_on,new.assigned_to,new.approved_by)
  is distinct from row(old.kind,old.title,old.body,old.organization,old.source_url,old.due_on,old.assigned_to,old.approved_by)
 then raise exception 'Return changed work to draft for approval before completing it'; end if;
 return new;
end $$;
revoke all on function isitusa_private.preserve_approved_work() from public,anon,authenticated;
create trigger preserve_approved_work before update on public.isitusa_work
for each row execute function isitusa_private.preserve_approved_work();
commit;
