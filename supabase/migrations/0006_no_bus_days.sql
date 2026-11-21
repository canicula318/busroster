-- School holidays: no bus, so these Saturdays are hidden from the date choices
create table public.no_bus_days (
  day date primary key,
  reason text
);
alter table public.no_bus_days enable row level security;
grant select, insert, update, delete on public.no_bus_days to authenticated;
create policy no_bus_days_select on public.no_bus_days for select to authenticated using (private.is_registered());
create policy no_bus_days_admin_write on public.no_bus_days for all to authenticated
  using (private.is_admin()) with check (private.is_admin());

-- 2026年度 年間授業日の予定（保護者用）: 休業日
insert into public.no_bus_days (day, reason) values
  ('2026-12-26', '冬期休業日'),
  ('2027-01-02', '冬期休業日'),
  ('2027-03-14', '卒園・卒業式予備日'),
  ('2027-03-20', '学年末休業日'),
  ('2027-03-27', '学年末休業日');
