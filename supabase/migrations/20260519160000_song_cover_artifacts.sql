-- Streaming-publication artifacts (album cover + Spotify Canvas) authored by
-- the recipe2video-agent-workspace agent and stored in Supabase by the app.
-- Driven by `agent-recipes/{videoId}/song-cover-plan.json` per
-- `contracts/song-cover.md` in the agent workspace repo.
--
-- One row per (video_id, kind):
--   * album_cover    : 1:1 square, GPT-Image 2 via Runway, upscaled to
--                      3000x3000 at download.
--   * spotify_canvas : 9:16 vertical 1080:1920 video, 5-8 s, seedance2 via
--                      Runway, continuous loop driven by the prompt.
--
-- Variants (regen history) live in `media_assets` with type
-- `album_cover_image` or `spotify_canvas_video` and metadata
-- `{"song_cover_artifact_id": "<uuid>"}`. The active variant pointer lives
-- on this table (`active_media_asset_id`).
--
-- Status / runway tracking mirrors `reference_assets` (no shared enum: the
-- core schema uses text + CHECK constraints, not Postgres enums).

create table if not exists public.song_cover_artifacts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  kind text not null check (kind in ('album_cover', 'spotify_canvas')),
  prompt text not null,
  image_reference_canonical_names text[] not null default '{}',
  video_reference_canonical_names text[] not null default '{}',
  loop_anchor_reference_name text,
  duration_seconds integer,
  status text not null default 'planned' check (
    status in (
      'planned',
      'generating',
      'generated',
      'approved',
      'rejected',
      'uploaded_to_runway',
      'failed'
    )
  ),
  active_media_asset_id uuid references public.media_assets(id) on delete set null,
  runway_task_id text,
  runway_task_status text,
  runway_progress numeric(5,2),
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint song_cover_artifacts_video_kind_unique unique (video_id, kind),
  constraint song_cover_artifacts_runway_progress_range check (
    runway_progress is null
    or (runway_progress >= 0 and runway_progress <= 100)
  ),
  constraint song_cover_artifacts_shape_per_kind check (
    (
      kind = 'album_cover'
      and video_reference_canonical_names = '{}'::text[]
      and loop_anchor_reference_name is null
      and duration_seconds is null
    )
    or (
      kind = 'spotify_canvas'
      and loop_anchor_reference_name is not null
      and duration_seconds is not null
      and duration_seconds between 5 and 8
    )
  ),
  constraint song_cover_artifacts_loop_anchor_in_image_refs check (
    loop_anchor_reference_name is null
    or loop_anchor_reference_name = any (image_reference_canonical_names)
  ),
  constraint song_cover_artifacts_image_refs_max_9 check (
    coalesce(array_length(image_reference_canonical_names, 1), 0) <= 9
  ),
  constraint song_cover_artifacts_video_refs_max_3 check (
    coalesce(array_length(video_reference_canonical_names, 1), 0) <= 3
  )
);

create index if not exists idx_song_cover_artifacts_video
  on public.song_cover_artifacts (video_id);

create index if not exists idx_song_cover_artifacts_video_generating
  on public.song_cover_artifacts (video_id)
  where status = 'generating';

-- Touch updated_at on every UPDATE.
create or replace function public.song_cover_artifacts_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_song_cover_artifacts_updated_at on public.song_cover_artifacts;
create trigger trg_song_cover_artifacts_updated_at
  before update on public.song_cover_artifacts
  for each row execute function public.song_cover_artifacts_set_updated_at();

-- RLS: same allowlist policy set as the rest of the business tables.
alter table public.song_cover_artifacts enable row level security;

drop policy if exists "Allowlisted users can read song_cover_artifacts"
  on public.song_cover_artifacts;
create policy "Allowlisted users can read song_cover_artifacts"
  on public.song_cover_artifacts
  for select
  to authenticated
  using (public.is_allowlisted_profile());

drop policy if exists "Allowlisted users can insert song_cover_artifacts"
  on public.song_cover_artifacts;
create policy "Allowlisted users can insert song_cover_artifacts"
  on public.song_cover_artifacts
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

drop policy if exists "Allowlisted users can update song_cover_artifacts"
  on public.song_cover_artifacts;
create policy "Allowlisted users can update song_cover_artifacts"
  on public.song_cover_artifacts
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

drop policy if exists "Allowlisted users can delete song_cover_artifacts"
  on public.song_cover_artifacts;
create policy "Allowlisted users can delete song_cover_artifacts"
  on public.song_cover_artifacts
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

revoke all on public.song_cover_artifacts from anon;
