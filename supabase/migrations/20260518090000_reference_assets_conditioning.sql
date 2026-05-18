-- Recipe-specific reference images need to be visually grounded on the
-- existing global library (kitchen, character, cookware, utensils) so that
-- GPT-Image 2 produces an anchor that matches our overall video style rather
-- than inventing a kitchen and pan from scratch. We store, per
-- `reference_assets` row, the list of `asset_library.canonical_name` (or
-- alias) values the agent wants to use as `referenceImages[]` when invoking
-- `POST /v1/text_to_image`. The names are resolved against `asset_library`
-- at generation time (and re-resolved every time we regenerate, so the
-- library can evolve without rewriting plans).
--
-- Stored as text[] rather than a join table because (a) it's a small,
-- monotonically appended list (typically 2–5 entries), (b) the resolution
-- must accept both canonical names and aliases (e.g. `island_default` or
-- `KitchenIslandDefault`) which would otherwise require a polymorphic
-- lookup, and (c) the agent's reference-plan.json carries plain string
-- names, so keeping the storage isomorphic to the artifact avoids a
-- round-trip translation.

alter table public.reference_assets
  add column if not exists conditioning_canonical_names text[] not null default '{}'::text[];

comment on column public.reference_assets.conditioning_canonical_names is
  'asset_library canonical_name or alias values to pass to GPT-Image 2 as referenceImages[] when generating this recipe-specific anchor. Resolved at generation time; case-insensitive matching follows the same rules as segment_references resolution.';
