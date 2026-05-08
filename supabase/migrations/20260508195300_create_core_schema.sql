create extension if not exists pgcrypto;
create extension if not exists vector with schema extensions;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- allowed_users + profiles: created in 20260508192500_auth_allowlist.sql

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique not null,
  recipe_url text,
  recipe_data jsonb,
  status text not null default 'draft' check (
    status in (
      'draft',
      'recipe_ingested',
      'clarification_needed',
      'storyboard_ready',
      'storyboard_approved',
      'references_ready',
      'generating',
      'review',
      'assembling',
      'exported',
      'failed'
    )
  ),
  storyboard jsonb,
  seedance_segments jsonb,
  selected_video_model text not null default 'seedance2',
  selected_image_model text not null default 'gpt_image_2',
  selected_tts_model text not null default 'eleven_multilingual_v2',
  selected_sfx_model text not null default 'eleven_text_to_sound_v2',
  total_cost_credits integer not null default 0,
  total_cost_openai numeric not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.segments (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  position integer not null,
  arc text not null,
  title text not null,
  logical_scene_ids jsonb not null default '[]'::jsonb,
  description text not null,
  prompt text not null,
  prompt_initial text not null,
  "references" jsonb not null default '[]'::jsonb,
  duration_target numeric not null,
  status text not null default 'pending' check (
    status in (
      'pending',
      'ready',
      'queued',
      'generating',
      'review',
      'accepted',
      'rejected',
      'failed',
      'blocked'
    )
  ),
  selected_generation_id uuid,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, position)
);

create table public.logical_scenes (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  segment_id uuid references public.segments(id) on delete set null,
  position integer not null,
  scene_type text not null check (scene_type in ('detail', 'context')),
  arc text not null,
  description text not null,
  bg text,
  zoom text,
  duration_target numeric,
  note text,
  unique (video_id, position)
);

create table public.media_assets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  segment_id uuid references public.segments(id) on delete set null,
  generation_id uuid,
  type text not null check (
    type in (
      'recipe_source',
      'reference_image',
      'runway_output',
      'accepted_clip',
      'suno_audio',
      'final_export'
    )
  ),
  provider text not null check (
    provider in ('supabase', 'mux', 'runway', 'suno', 'manual')
  ),
  storage_bucket text,
  storage_path text,
  mux_asset_id text,
  mux_playback_id text,
  runway_output_url text,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  duration_seconds numeric,
  width integer,
  height integer,
  status text not null default 'pending' check (
    status in (
      'pending',
      'stored',
      'uploaded_to_mux',
      'failed',
      'deleted',
      'archived'
    )
  ),
  metadata jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reference_assets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid references public.videos(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  type text not null,
  canonical_name text not null,
  source text not null,
  runway_uri text,
  prompt text,
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
  created_at timestamptz not null default now()
);

create table public.generations (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments(id) on delete cascade,
  media_asset_id uuid references public.media_assets(id) on delete set null,
  model text not null,
  model_params jsonb not null default '{}'::jsonb,
  runway_task_id text,
  status text not null default 'pending' check (
    status in (
      'pending',
      'queued',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
      'expired'
    )
  ),
  cost_credits integer,
  duration_seconds numeric,
  triggered_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.segments
  add constraint segments_selected_generation_id_fkey
  foreign key (selected_generation_id)
  references public.generations(id)
  on delete set null;

alter table public.media_assets
  add constraint media_assets_generation_id_fkey
  foreign key (generation_id)
  references public.generations(id)
  on delete set null;

create table public.scene_feedbacks (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments(id) on delete cascade,
  generation_id uuid not null references public.generations(id) on delete cascade,
  message text not null,
  prompt_before text not null,
  prompt_after text not null,
  diff jsonb not null,
  applied boolean not null default false,
  embedding extensions.vector(1536),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.cost_logs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  segment_id uuid references public.segments(id) on delete set null,
  provider text not null,
  model text not null,
  operation text not null,
  credits_used integer,
  cost_dollars numeric,
  tokens_input integer,
  tokens_output integer,
  metadata jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.compositions (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  export_media_asset_id uuid references public.media_assets(id) on delete set null,
  segment_order jsonb not null default '[]'::jsonb,
  audio_media_asset_id uuid references public.media_assets(id) on delete set null,
  audio_sync jsonb,
  remotion_props jsonb,
  export_status text not null default 'pending' check (
    export_status in ('pending', 'rendering', 'completed', 'failed')
  ),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_videos_updated_at
before update on public.videos
for each row execute function public.set_updated_at();

create trigger set_segments_updated_at
before update on public.segments
for each row execute function public.set_updated_at();

create trigger set_media_assets_updated_at
before update on public.media_assets
for each row execute function public.set_updated_at();

create trigger set_compositions_updated_at
before update on public.compositions
for each row execute function public.set_updated_at();

create index idx_videos_status on public.videos(status);
create index idx_videos_updated_at on public.videos(updated_at desc);
create index idx_segments_video_position on public.segments(video_id, position);
create index idx_media_assets_video on public.media_assets(video_id);
create index idx_media_assets_generation on public.media_assets(generation_id);
create index idx_generations_segment_status on public.generations(segment_id, status);
create index idx_cost_logs_video on public.cost_logs(video_id);
create index idx_feedback_segment_created on public.scene_feedbacks(segment_id, created_at desc);

create index idx_feedback_embedding
on public.scene_feedbacks
using ivfflat (embedding extensions.vector_cosine_ops)
where embedding is not null;
