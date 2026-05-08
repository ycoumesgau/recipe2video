create table if not exists public.videos (
  id uuid primary key,
  title text,
  slug text unique,
  recipe_url text,
  recipe_data jsonb,
  status text not null default 'draft',
  storyboard jsonb,
  seedance_segments jsonb,
  selected_video_model text not null default 'seedance2',
  selected_image_model text not null default 'gpt_image_2',
  selected_tts_model text not null default 'eleven_multilingual_v2',
  selected_sfx_model text not null default 'eleven_text_to_sound_v2',
  total_cost_credits integer not null default 0,
  total_cost_openai numeric not null default 0,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.media_assets (
  id uuid primary key,
  video_id uuid references public.videos(id) on delete cascade,
  segment_id uuid null,
  generation_id uuid null,
  type text not null,
  provider text not null,
  storage_bucket text null,
  storage_path text null,
  mux_asset_id text null,
  mux_playback_id text null,
  runway_output_url text null,
  original_filename text null,
  mime_type text null,
  file_size_bytes bigint null,
  duration_seconds numeric null,
  width integer null,
  height integer null,
  status text not null default 'pending',
  metadata jsonb,
  created_by uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_videos_status on public.videos(status);
create index if not exists idx_videos_updated_at on public.videos(updated_at desc);
create index if not exists idx_media_assets_video on public.media_assets(video_id);
create index if not exists idx_media_assets_generation on public.media_assets(generation_id);

insert into storage.buckets (id, name, public)
values ('recipe-sources', 'recipe-sources', false)
on conflict (id) do nothing;
