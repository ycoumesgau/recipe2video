-- Asset library refactor: introduce a globally-shared asset library and a true
-- N→M segment ↔ reference link table.
--
-- Motivation:
--   * Today every recipe agent inserts its own `reference_assets` row for
--     library assets like `island_default` or `whisk`. Across 20 videos the
--     same canonical asset is duplicated 20+ times.
--   * The `reference_assets.video_id IS NULL` "global" concept exists but no
--     code path ever populates it, and there is no uniqueness guarantee.
--   * The page `/videos/[id]/references` lists every segment-level reference
--     entry instead of one card per logical asset.
--
-- New shape:
--   * `asset_library` holds the canonical library (66 assets seeded from
--     `recipe2video-agent-workspace/assets/`). One row per `canonical_name`,
--     `media_asset_id` points to a single Supabase Storage object stored
--     under `reference-images/library/<category>/<canonical_name>.png`. The
--     bucket stays private; signed URLs are minted just-in-time at Seedance
--     generation time so they survive multi-day retries.
--   * `reference_assets` keeps recipe-specific entries (raw/baked/filled
--     states, manual uploads, agent-generated specifics). A partial unique
--     index prevents duplicate canonical names per video.
--   * `segment_references` is the canonical N→M link between
--     `segments` and either an `asset_library` row OR a recipe-specific
--     `reference_assets` row. Exactly one of the two FKs is non-null.
--     Positions preserve the Runway `references[]` ordering and we cap
--     uniqueness so the same asset cannot appear twice in one segment.

create table public.asset_library (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null,
  category text not null check (
    category in (
      'character',
      'character_pose',
      'character_expression',
      'kitchen',
      'utensil'
    )
  ),
  media_asset_id uuid references public.media_assets(id) on delete restrict,
  description text,
  status text not null default 'active' check (status in ('active', 'deprecated')),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_name)
);

create index idx_asset_library_category_status
  on public.asset_library(category, status);

create trigger set_asset_library_updated_at
  before update on public.asset_library
  for each row execute function public.set_updated_at();

-- Recipe-specific reference assets: prevent the agent from inserting
-- duplicate canonical names within the same project. Library assets must
-- live in `asset_library` instead.
alter table public.reference_assets
  add column if not exists category text;

-- Deduplicate pre-existing rows: today the sync code happily inserts the
-- same `(video_id, canonical_name)` multiple times. Keep the strongest row
-- per pair (preferring uploaded → approved → generated → planned, then with
-- a runway_uri, then with a stored media asset, then most recent) and drop
-- the rest. Without this cleanup the unique index creation aborts.
with ranked as (
  select
    id,
    row_number() over (
      partition by video_id, canonical_name
      order by
        case status
          when 'uploaded_to_runway' then 0
          when 'approved' then 1
          when 'generated' then 2
          when 'planned' then 3
          when 'generating' then 4
          when 'failed' then 5
          when 'rejected' then 6
          else 7
        end,
        case when runway_uri is not null then 0 else 1 end,
        case when media_asset_id is not null then 0 else 1 end,
        created_at desc
    ) as rn
  from public.reference_assets
  where video_id is not null
)
delete from public.reference_assets r
using ranked
where r.id = ranked.id and ranked.rn > 1;

create unique index if not exists reference_assets_video_canonical_unique
  on public.reference_assets(video_id, canonical_name)
  where video_id is not null;

-- True N→M link between segments and either library or recipe-specific
-- references. The check constraint guarantees exactly one FK is set.
create table public.segment_references (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.segments(id) on delete cascade,
  library_asset_id uuid references public.asset_library(id) on delete restrict,
  recipe_reference_id uuid references public.reference_assets(id) on delete cascade,
  role text not null,
  position integer not null,
  required boolean not null default true,
  created_at timestamptz not null default now(),
  constraint segment_references_exactly_one_target check (
    (library_asset_id is not null and recipe_reference_id is null)
    or (library_asset_id is null and recipe_reference_id is not null)
  )
);

create unique index segment_references_unique_library
  on public.segment_references(segment_id, library_asset_id)
  where library_asset_id is not null;

create unique index segment_references_unique_recipe
  on public.segment_references(segment_id, recipe_reference_id)
  where recipe_reference_id is not null;

create unique index segment_references_position_unique
  on public.segment_references(segment_id, position);

create index idx_segment_references_library
  on public.segment_references(library_asset_id)
  where library_asset_id is not null;

create index idx_segment_references_recipe
  on public.segment_references(recipe_reference_id)
  where recipe_reference_id is not null;

-- RLS: same allowlist-only model used by every business table.
alter table public.asset_library enable row level security;
alter table public.segment_references enable row level security;

create policy "Allowlisted users can read asset_library"
  on public.asset_library
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert asset_library"
  on public.asset_library
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update asset_library"
  on public.asset_library
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete asset_library"
  on public.asset_library
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can read segment_references"
  on public.segment_references
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert segment_references"
  on public.segment_references
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update segment_references"
  on public.segment_references
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete segment_references"
  on public.segment_references
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

revoke all on public.asset_library from anon;
revoke all on public.segment_references from anon;

grant select, insert, update, delete on public.asset_library to authenticated;
grant select, insert, update, delete on public.segment_references to authenticated;
