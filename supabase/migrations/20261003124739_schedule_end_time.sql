alter table public.schedules add column ends_at timestamptz;
alter table public.schedules add constraint schedules_end_after_start check(ends_at is null or (starts_at is not null and ends_at>starts_at));
