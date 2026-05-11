alter table public.generations
  add column if not exists runway_task_status text,
  add column if not exists runway_progress numeric(5,2);

alter table public.generations
  drop constraint if exists generations_runway_progress_range;

alter table public.generations
  add constraint generations_runway_progress_range
  check (
    runway_progress is null
    or (runway_progress >= 0 and runway_progress <= 100)
  );
