-- Every registered parent email is an admin (any parent may be the 当番 and needs the duty sheet).
insert into public.admins (email) select email from public.family_emails on conflict do nothing;

-- Emails added to a family become admins; removed emails lose admin
-- (admins not tied to any family, e.g. added by hand, are kept).
create or replace function private.sync_admin_from_family_email() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.admins (email) values (new.email) on conflict do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    if not exists (select 1 from public.family_emails where email = old.email) then
      delete from public.admins where email = old.email;
    end if;
    return old;
  end if;
  return null;
end $$;

create trigger family_emails_sync_admin
after insert or delete on public.family_emails
for each row execute function private.sync_admin_from_family_email();
