-- A family's details (name, phone, stop, emails, students) can only be changed by
-- someone signed in with one of that family's emails.
-- Exception: a family with no emails yet (just created) can be set up by any admin.
create or replace function private.can_edit_family(fid uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select fid in (select private.my_family_ids())
      or (private.is_admin() and not exists (select 1 from public.family_emails fe where fe.family_id = fid))
$$;
grant execute on function private.can_edit_family(uuid) to authenticated;

drop policy families_admin_write on public.families;
create policy families_insert on public.families for insert to authenticated with check (private.is_admin());
create policy families_update on public.families for update to authenticated
  using (private.can_edit_family(id)) with check (private.can_edit_family(id));
create policy families_delete on public.families for delete to authenticated using (private.can_edit_family(id));

drop policy family_emails_admin_write on public.family_emails;
create policy family_emails_insert on public.family_emails for insert to authenticated with check (private.can_edit_family(family_id));
create policy family_emails_update on public.family_emails for update to authenticated
  using (private.can_edit_family(family_id)) with check (private.can_edit_family(family_id));
create policy family_emails_delete on public.family_emails for delete to authenticated using (private.can_edit_family(family_id));

drop policy students_admin_write on public.students;
create policy students_insert on public.students for insert to authenticated with check (private.can_edit_family(family_id));
create policy students_update on public.students for update to authenticated
  using (private.can_edit_family(family_id)) with check (private.can_edit_family(family_id));
create policy students_delete on public.students for delete to authenticated using (private.can_edit_family(family_id));
