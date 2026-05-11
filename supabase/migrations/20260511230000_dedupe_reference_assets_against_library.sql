-- Cleanup recipe-specific reference_assets rows that duplicate an asset_library
-- entry. These were created BEFORE the library was seeded: the agent had no
-- way to know "KitchenIslandDefault" was a canonical library asset, so it
-- persisted a per-video row instead of linking to the library. Now that the
-- library exists and the sync resolves library hits without writing a row,
-- these rows are pure noise on the /references page.
--
-- Safe to run because:
--   1. segment_references has just been introduced and is empty: no FK row
--      points at these reference_assets yet, so deleting them cannot break
--      a join (the CASCADE on segment_references.recipe_reference_id would
--      handle it anyway).
--   2. Generations table references reference_assets only through segments'
--      JSON references (resolved at run time), not through a FK. We checked:
--      every duplicate row is in status 'planned' or 'generated' (no
--      runwayUri attached) so deletion does not strand a paid asset.
--
-- The next agent sync will re-resolve these canonical names against
-- asset_library and populate `segment_references.library_asset_id` for every
-- segment that mentions them.

delete from public.reference_assets r
using public.asset_library lib
where r.video_id is not null
  and r.canonical_name = lib.canonical_name;
