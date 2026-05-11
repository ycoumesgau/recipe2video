-- Bridge the file-basename canonical names in `asset_library` (e.g.
-- `island_default`) with the CamelCase aliases the agent has been using for
-- months (`KitchenIslandDefault`). Without this, the agent's
-- `reference-plan.json` and `segment.references[].name` values cannot be
-- resolved against the library and every recipe ends up re-creating
-- per-video duplicates.
--
-- Design:
--   * canonical_name stays equal to the storage path's file basename. It is
--     immutable, derived from disk, and what `scripts/seed-asset-library.ts`
--     will keep using.
--   * `aliases TEXT[]` holds the human-friendly names. The resolver in
--     `findAssetLibraryByCanonicalNames` checks BOTH `canonical_name` and
--     `aliases` so the agent does not need to know about the underlying
--     filename. The /library admin page (step 6) will own write access.

alter table public.asset_library
  add column if not exists aliases text[] not null default '{}'::text[];

-- GIN index accelerates `aliases @> ARRAY[...]` lookups when resolving plan
-- references. Uniqueness across aliases is enforced at write time by the
-- /library admin page (PostgreSQL's GIN index cannot enforce uniqueness on
-- array elements).
create index if not exists asset_library_aliases_gin
  on public.asset_library using gin (aliases);

-- Backfill aliases from the long-standing asset-reference-system skill so
-- existing recipes whose references reference CamelCase names start
-- resolving against the library immediately, without re-running the agent.
update public.asset_library set aliases = array['KitchenIslandDefault']    where canonical_name = 'island_default';
update public.asset_library set aliases = array['KitchenIslandOverhead']   where canonical_name = 'island_overhead';
update public.asset_library set aliases = array['KitchenIslandWide']       where canonical_name = 'island_overview_wide';
update public.asset_library set aliases = array['InductionCloseup']        where canonical_name = 'induction_left_closeup';
update public.asset_library set aliases = array['InductionWide']           where canonical_name = 'induction_wide';
update public.asset_library set aliases = array['OvenWide']                where canonical_name = 'oven_opened_wide';
update public.asset_library set aliases = array['OvenCloseup']             where canonical_name = 'oven_opened_closeup';
update public.asset_library set aliases = array['CharacterSheet']          where canonical_name = 'Character-sheet';
update public.asset_library set aliases = array['CharacterExpressions']    where canonical_name = 'Facial-expressions';
update public.asset_library set aliases = array['PoseFront']               where canonical_name = 'Luma-front-pose';
update public.asset_library set aliases = array['PoseBack']                where canonical_name = 'Luma-back-pose';
update public.asset_library set aliases = array['PoseTopDown']             where canonical_name = 'Luma-topDown-pose';
update public.asset_library set aliases = array['PoseProfileLeft']         where canonical_name = 'Luma-profileLeft-pose';
update public.asset_library set aliases = array['PoseProfileRight']        where canonical_name = 'Luma-profileRight-pose';
update public.asset_library set aliases = array['PoseThreeQuarterLeft']    where canonical_name = 'Luma-threeQuarterLeft-pose';
update public.asset_library set aliases = array['PoseThreeQuarterRight']   where canonical_name = 'Luma-threeQuarterRight-pose';

-- Utensils: the agent prompts with CamelCase versions of the snake_case
-- canonical names. We add the obvious mapping so reference_plan.json keeps
-- working out of the box.
update public.asset_library set aliases = array['BakingMat']               where canonical_name = 'baking_mat';
update public.asset_library set aliases = array['RollingPin']              where canonical_name = 'rolling_pin';
update public.asset_library set aliases = array['Blender']                 where canonical_name = 'blender';
update public.asset_library set aliases = array['StandMixer']              where canonical_name = 'stand_mixer';
update public.asset_library set aliases = array['SaucepanLarge']           where canonical_name = 'saucepan_large';
update public.asset_library set aliases = array['SaucepanSmall']           where canonical_name = 'saucepan_small';
update public.asset_library set aliases = array['Whisk']                   where canonical_name = 'whisk';
update public.asset_library set aliases = array['ImmersionBlender']        where canonical_name = 'immersion_blender';
update public.asset_library set aliases = array['Spatula']                 where canonical_name = 'spatula';
update public.asset_library set aliases = array['Spoon']                   where canonical_name = 'spoon';
update public.asset_library set aliases = array['Sieve']                   where canonical_name = 'sieve';
update public.asset_library set aliases = array['BakingDish']              where canonical_name = 'baking_dish';
update public.asset_library set aliases = array['ChefKnife']               where canonical_name = 'chef_knife';
update public.asset_library set aliases = array['CuttingBoard']            where canonical_name = 'cutting_board';
update public.asset_library set aliases = array['Tongs']                   where canonical_name = 'tongs';
update public.asset_library set aliases = array['DutchOvenInside']         where canonical_name = 'dutch_oven_inside';
update public.asset_library set aliases = array['DutchOvenOutside']        where canonical_name = 'dutch_oven_outside';
update public.asset_library set aliases = array['Colander']                where canonical_name = 'colander';
update public.asset_library set aliases = array['Ladle']                   where canonical_name = 'ladle';
update public.asset_library set aliases = array['Wok']                     where canonical_name = 'wok';

-- Second pass cleanup: now that aliases exist, drop any remaining
-- recipe-specific reference_assets row whose canonical_name matches either
-- the library's own canonical_name OR one of its aliases. This finishes the
-- de-duplication started in 20260511230000.
delete from public.reference_assets r
using public.asset_library lib
where r.video_id is not null
  and (
    r.canonical_name = lib.canonical_name
    or r.canonical_name = any(lib.aliases)
  );
