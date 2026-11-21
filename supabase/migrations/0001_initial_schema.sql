-- BusRoster schema (already applied to the Supabase project "busroster").
-- Keep this file in sync with any future changes so the database can be rebuilt.

create schema if not exists private;

create type public.trip_type as enum ('both', 'outbound', 'return', 'none');

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  notes text,
  created_at timestamptz not null default now()
);

-- Any of these emails can sign in for the family (both parents, etc.)
create table public.family_emails (
  email text primary key check (email = lower(trim(email))),
  family_id uuid not null references public.families(id) on delete cascade
);
create index on public.family_emails (family_id);

create table public.students (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  name text not null,
  grade text,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.students (family_id);

create table public.admins (
  email text primary key check (email = lower(trim(email)))
);

-- One signup per family per Saturday
create table public.signups (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  bus_date date not null check (extract(isodow from bus_date) = 6),
  trip public.trip_type not null,
  guest_name text,
  comments text,
  created_by text default lower(auth.jwt() ->> 'email'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (family_id, bus_date)
);
create index on public.signups (bus_date);

create table public.signup_students (
  signup_id uuid not null references public.signups(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  primary key (signup_id, student_id)
);
create index on public.signup_students (student_id);

create table public.fares (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  method text,
  price_cents int,
  link text,
  sort int not null default 0
);

create table public.stops (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  sort int not null default 0
);

-- Helper functions (private schema: not exposed through the API)
create or replace function private.current_email() returns text
language sql stable security definer set search_path = ''
as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.admins a where a.email = private.current_email()) $$;

create or replace function private.my_family_ids() returns setof uuid
language sql stable security definer set search_path = ''
as $$ select fe.family_id from public.family_emails fe where fe.email = private.current_email() $$;

create or replace function private.is_registered() returns boolean
language sql stable security definer set search_path = ''
as $$ select private.is_admin() or exists (select 1 from public.family_emails fe where fe.email = private.current_email()) $$;

create or replace function private.today_ny() returns date
language sql stable set search_path = ''
as $$ select (now() at time zone 'America/New_York')::date $$;

grant usage on schema private to authenticated;
grant execute on all functions in schema private to authenticated;
revoke execute on all functions in schema private from anon, public;

create or replace function private.touch_updated_at() returns trigger
language plpgsql set search_path = ''
as $$ begin new.updated_at = now(); return new; end $$;
create trigger signups_touch before update on public.signups
for each row execute function private.touch_updated_at();

-- Row-level security
alter table public.families enable row level security;
alter table public.family_emails enable row level security;
alter table public.students enable row level security;
alter table public.admins enable row level security;
alter table public.signups enable row level security;
alter table public.signup_students enable row level security;
alter table public.fares enable row level security;
alter table public.stops enable row level security;

revoke all on all tables in schema public from anon;
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on
  public.families, public.family_emails, public.students, public.admins,
  public.signups, public.signup_students, public.fares, public.stops
to authenticated;
grant usage on type public.trip_type to authenticated;

create policy families_select on public.families for select to authenticated
  using (private.is_admin() or id in (select private.my_family_ids()));
create policy families_admin_write on public.families for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy family_emails_select on public.family_emails for select to authenticated
  using (private.is_admin() or family_id in (select private.my_family_ids()));
create policy family_emails_admin_write on public.family_emails for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy students_select on public.students for select to authenticated
  using (private.is_admin() or family_id in (select private.my_family_ids()));
create policy students_admin_write on public.students for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

create policy admins_select on public.admins for select to authenticated
  using (email = private.current_email() or private.is_admin());
create policy admins_admin_write on public.admins for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Families manage their own upcoming signups; admins manage all
create policy signups_select on public.signups for select to authenticated
  using (private.is_admin() or family_id in (select private.my_family_ids()));
create policy signups_insert on public.signups for insert to authenticated
  with check (private.is_admin() or (family_id in (select private.my_family_ids()) and bus_date >= private.today_ny()));
create policy signups_update on public.signups for update to authenticated
  using (private.is_admin() or (family_id in (select private.my_family_ids()) and bus_date >= private.today_ny()))
  with check (private.is_admin() or (family_id in (select private.my_family_ids()) and bus_date >= private.today_ny()));
create policy signups_delete on public.signups for delete to authenticated
  using (private.is_admin() or (family_id in (select private.my_family_ids()) and bus_date >= private.today_ny()));

create policy signup_students_select on public.signup_students for select to authenticated
  using (exists (select 1 from public.signups s where s.id = signup_id
    and (private.is_admin() or s.family_id in (select private.my_family_ids()))));
create policy signup_students_insert on public.signup_students for insert to authenticated
  with check (exists (select 1 from public.signups s join public.students st on st.family_id = s.family_id
    where s.id = signup_id and st.id = student_id
      and (private.is_admin() or (s.family_id in (select private.my_family_ids()) and s.bus_date >= private.today_ny()))));
create policy signup_students_delete on public.signup_students for delete to authenticated
  using (exists (select 1 from public.signups s where s.id = signup_id
    and (private.is_admin() or (s.family_id in (select private.my_family_ids()) and s.bus_date >= private.today_ny()))));

create policy fares_select on public.fares for select to authenticated using (private.is_registered());
create policy fares_admin_write on public.fares for all to authenticated
  using (private.is_admin()) with check (private.is_admin());
create policy stops_select on public.stops for select to authenticated using (private.is_registered());
create policy stops_admin_write on public.stops for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- Save a signup (create or replace for that family + Saturday) in one call.
-- security invoker: all RLS rules above still apply.
create or replace function public.submit_signup(
  p_family_id uuid,
  p_bus_date date,
  p_trip public.trip_type,
  p_student_ids uuid[],
  p_guest_name text default null,
  p_comments text default null
) returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id uuid;
begin
  if extract(isodow from p_bus_date) <> 6 then
    raise exception 'Bus date must be a Saturday';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 and coalesce(trim(p_guest_name), '') = '' then
    raise exception 'Choose at least one student or enter a guest name';
  end if;

  insert into public.signups (family_id, bus_date, trip, guest_name, comments)
  values (p_family_id, p_bus_date, p_trip, nullif(trim(p_guest_name), ''), nullif(trim(p_comments), ''))
  on conflict (family_id, bus_date) do update
    set trip = excluded.trip, guest_name = excluded.guest_name, comments = excluded.comments
  returning id into v_id;

  delete from public.signup_students where signup_id = v_id;
  insert into public.signup_students (signup_id, student_id)
  select v_id, unnest(coalesce(p_student_ids, '{}'));

  return v_id;
end $$;
revoke execute on function public.submit_signup from anon, public;
grant execute on function public.submit_signup to authenticated;

-- Keep-alive ping for the scheduled GitHub Action. Touches no data.
create or replace function public.ping() returns int
language sql stable security invoker set search_path = ''
as $$ select 1 $$;
grant execute on function public.ping to anon, authenticated;

-- Seed: fares and stops (admins are added separately, not committed here)
insert into public.fares (name, method, price_cents, link, sort) values
 ('2026年第二学期　一人', 'Invoice経由でACH支払い', 77400, null, 1),
 ('2026年第二学期　二人以上', 'Invoice経由でACH支払い', 154900, null, 2),
 ('単発・片道　一人', 'Square Link（クレジットカードのみ）', 3100, 'https://square.link/u/8TfU9mwH', 3),
 ('単発・片道　二人以上', 'Square Link（クレジットカードのみ）', 6100, 'https://square.link/u/5iefJ488', 4);
insert into public.stops (name, address, sort) values
 ('BH', '345 Plainfield Ave Berkeley Heights NJ 07922', 1),
 ('Summit', '48 Springfield Ave Summit NJ 07901', 2),
 ('Paramus Catholic High School', '425 Paramus Rd Paramus NJ 07652', 3);
