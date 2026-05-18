-- Track Runway text_to_image task state on recipe-specific references so
-- segment / active-generations UIs can poll progress like Seedance generations.

alter table public.reference_assets
  add column if not exists runway_task_id text;

alter table public.reference_assets
  add column if not exists runway_task_status text;

alter table public.reference_assets
  add column if not exists runway_progress numeric(5,2);

alter table public.reference_assets
  drop constraint if exists reference_assets_runway_progress_range;

alter table public.reference_assets
  add constraint reference_assets_runway_progress_range
  check (
    runway_progress is null
    or (runway_progress >= 0 and runway_progress <= 100)
  );

create index if not exists idx_reference_assets_video_generating
  on public.reference_assets (video_id)
  where status = 'generating';
