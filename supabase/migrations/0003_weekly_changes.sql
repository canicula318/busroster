-- Weekly process: every active student rides both ways by default.
-- A family submits only when something changes that week:
--   per-student trip (行きのみ / 帰りのみ / お休み) and one-time guests with their own trip.

-- 1) Per-student trip on each change
alter table public.signup_students add column trip public.trip_type;
update public.signup_students ss set trip = s.trip from public.signups s where s.id = ss.signup_id;
alter table public.signup_students alter column trip set not null;

-- 2) Guests with their own trip
create table public.signup_guests (
  id uuid primary key default gen_random_uuid(),
  signup_id uuid not null references public.signups(id) on delete cascade,
  name text not null,
  trip public.trip_type not null check (trip <> 'none'),
  sort int not null default 0
);
create index on public.signup_guests (signup_id);
insert into public.signup_guests (signup_id, name, trip)
  select id, guest_name, case when trip = 'none' then 'both'::public.trip_type else trip end from public.signups where guest_name is not null;

alter table public.signup_guests enable row level security;
grant select, insert, update, delete on public.signup_guests to authenticated;
create policy signup_guests_select on public.signup_guests for select to authenticated
  using (exists (select 1 from public.signups s where s.id = signup_id
    and (private.is_admin() or s.family_id in (select private.my_family_ids()))));
create policy signup_guests_write on public.signup_guests for all to authenticated
  using (exists (select 1 from public.signups s where s.id = signup_id
    and (private.is_admin() or (s.family_id in (select private.my_family_ids()) and s.bus_date >= private.today_ny()))))
  with check (exists (select 1 from public.signups s where s.id = signup_id
    and (private.is_admin() or (s.family_id in (select private.my_family_ids()) and s.bus_date >= private.today_ny()))));

-- 3) The signup row is now just the family's change notice for that Saturday
drop function public.submit_signup(uuid, date, public.trip_type, uuid[], text, text);
alter table public.signups drop column trip, drop column guest_name;

-- 4) Save (or clear) a family's changes for one Saturday in one call. RLS applies (security invoker).
--    p_changes: [{"student_id": "...", "trip": "outbound"}]  (students not listed ride both ways as usual)
--    p_guests:  [{"name": "...", "trip": "both"}]
create or replace function public.save_changes(
  p_family_id uuid,
  p_bus_date date,
  p_changes jsonb,
  p_guests jsonb,
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

  -- Nothing to report: remove any existing notice
  if coalesce(jsonb_array_length(p_changes), 0) = 0
     and coalesce(jsonb_array_length(p_guests), 0) = 0
     and coalesce(trim(p_comments), '') = '' then
    delete from public.signups where family_id = p_family_id and bus_date = p_bus_date;
    return null;
  end if;

  insert into public.signups (family_id, bus_date, comments)
  values (p_family_id, p_bus_date, nullif(trim(p_comments), ''))
  on conflict (family_id, bus_date) do update set comments = excluded.comments
  returning id into v_id;

  delete from public.signup_students where signup_id = v_id;
  insert into public.signup_students (signup_id, student_id, trip)
  select v_id, (c ->> 'student_id')::uuid, (c ->> 'trip')::public.trip_type
  from jsonb_array_elements(coalesce(p_changes, '[]')) c
  where (c ->> 'trip') <> 'both';

  delete from public.signup_guests where signup_id = v_id;
  insert into public.signup_guests (signup_id, name, trip, sort)
  select v_id, trim(g ->> 'name'), (g ->> 'trip')::public.trip_type, ord
  from jsonb_array_elements(coalesce(p_guests, '[]')) with ordinality as t(g, ord)
  where coalesce(trim(g ->> 'name'), '') <> '';

  return v_id;
end $$;
revoke execute on function public.save_changes from anon, public;
grant execute on function public.save_changes to authenticated;

-- 5) Weekly roster for any registered parent (the 当番 posts it to LINE).
--    Exposes only names, grade, stop, trip and comments — no emails or phone numbers.
create or replace function public.weekly_roster(p_date date)
returns table (
  kind text,            -- 'student' | 'guest'
  person_id uuid,
  name text,
  name_ja text,
  grade text,
  family_id uuid,
  family_name text,
  stop_id uuid,
  trip public.trip_type,
  changed boolean,
  comments text,
  sort int
)
language sql stable security definer set search_path = ''
as $$
  select 'student', st.id, st.name, st.name_ja, st.grade, f.id, f.name, f.stop_id,
         coalesce(ss.trip, 'both'::public.trip_type), ss.trip is not null, su.comments, st.sort
  from public.students st
  join public.families f on f.id = st.family_id
  left join public.signups su on su.family_id = f.id and su.bus_date = p_date
  left join public.signup_students ss on ss.signup_id = su.id and ss.student_id = st.id
  where private.is_registered() and (st.active or ss.trip is not null)
  union all
  select 'guest', g.id, g.name, null, null, f.id, f.name, f.stop_id, g.trip, true, su.comments, 900 + g.sort
  from public.signup_guests g
  join public.signups su on su.id = g.signup_id
  join public.families f on f.id = su.family_id
  where private.is_registered() and su.bus_date = p_date
$$;
revoke execute on function public.weekly_roster from anon, public;
grant execute on function public.weekly_roster to authenticated;

-- Stops are needed by every parent for the roster view (already readable by registered users).
