-- Stops get schedule info; families get their pickup stop; students get a Japanese name
alter table public.stops
  add column kind text not null default 'stop' check (kind in ('stop', 'school')),
  add column short_name text,
  add column place text,
  add column am_time text,
  add column pm_time text;

alter table public.families add column stop_id uuid references public.stops(id) on delete set null;
create index on public.families (stop_id);

alter table public.students add column name_ja text;

-- Contacts shown on the info page (admins_only rows only visible to admins)
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  name text,
  phone text,
  note text,
  admins_only boolean not null default false,
  sort int not null default 0
);
alter table public.contacts enable row level security;
grant select, insert, update, delete on public.contacts to authenticated;
create policy contacts_select on public.contacts for select to authenticated
  using (private.is_admin() or (private.is_registered() and not admins_only));
create policy contacts_admin_write on public.contacts for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Schedule (2026年第二学期 bus sheet)
update public.stops set name='Berkeley Heights', short_name='BH', place='Columbia Middle School',
  address='345 Plainfield Ave, Berkeley Heights, NJ 07922', am_time='8:00 AM', pm_time='3:25 PM', sort=1 where name='BH';
update public.stops set name='Summit', short_name='Summit', place='Summit Park & Ride',
  address='48 Springfield Ave, Summit, NJ 07901', am_time='8:10 AM', pm_time='3:10 PM', sort=2 where name='Summit';
update public.stops set short_name='学校', place='Paramus Catholic High School', kind='school',
  address='425 Paramus Rd, Paramus, NJ 07652', am_time='8:50 AM', pm_time='2:30 PM', sort=3 where name='Paramus Catholic High School';
-- Contacts (phone numbers) are entered via SQL/Table Editor, not committed here.
