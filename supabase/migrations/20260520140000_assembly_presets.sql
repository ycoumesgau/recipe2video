-- Named assembly presets: editable timeline settings per video project.
-- Compositions remain render jobs, now linked to a preset via preset_id.

create table public.assembly_presets (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  name text not null,
  segment_order jsonb not null default '[]'::jsonb,
  audio_media_asset_id uuid references public.media_assets(id) on delete set null,
  audio_sync jsonb,
  remotion_props jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assembly_presets_video_name_unique unique (video_id, name)
);

create trigger set_assembly_presets_updated_at
before update on public.assembly_presets
for each row execute function public.set_updated_at();

create index idx_assembly_presets_video_id on public.assembly_presets(video_id);
create index idx_assembly_presets_video_created on public.assembly_presets(video_id, created_at asc);

alter table public.compositions
  add column preset_id uuid references public.assembly_presets(id) on delete cascade;

create index idx_compositions_video_preset on public.compositions(video_id, preset_id);
create index idx_compositions_preset_export_status on public.compositions(preset_id, export_status);

-- Backfill: one "Default" preset per video that already has compositions.
insert into public.assembly_presets (
  video_id,
  name,
  segment_order,
  audio_media_asset_id,
  audio_sync,
  remotion_props,
  created_by,
  created_at,
  updated_at
)
select distinct on (c.video_id)
  c.video_id,
  'Default',
  c.segment_order,
  c.audio_media_asset_id,
  c.audio_sync,
  c.remotion_props,
  c.created_by,
  c.created_at,
  c.updated_at
from public.compositions c
order by c.video_id, c.updated_at desc;

update public.compositions c
set preset_id = p.id
from public.assembly_presets p
where p.video_id = c.video_id
  and p.name = 'Default'
  and c.preset_id is null;

-- Tag existing final exports with the Default preset for their video.
update public.media_assets ma
set metadata = jsonb_set(
  coalesce(ma.metadata, '{}'::jsonb),
  '{presetId}',
  to_jsonb(p.id::text),
  true
)
from public.assembly_presets p
where ma.type = 'final_export'
  and ma.video_id = p.video_id
  and p.name = 'Default'
  and (ma.metadata is null or ma.metadata->>'presetId' is null);

-- RLS (same allowlisted-only pattern as core tables).
alter table public.assembly_presets enable row level security;

create policy "Allowlisted users can read assembly_presets"
  on public.assembly_presets
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert assembly_presets"
  on public.assembly_presets
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update assembly_presets"
  on public.assembly_presets
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete assembly_presets"
  on public.assembly_presets
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

revoke all on public.assembly_presets from anon;
