-- Clear spatula family naming: the former `spatula` asset is a flexible bowl
-- scraper (French: maryse), not a rigid turner or pastry offset. Renames the
-- library canonical_name to match storage after operators rename
-- `assets/ustensils/spatula.png` -> `silicone_spatula.png` and re-seed.
--
-- Post-deploy: upload `library/utensil/silicone_spatula.png` to match
-- `media_assets.storage_path` (e.g. `tsx scripts/seed-asset-library.ts`), then
-- optionally delete the old `library/utensil/spatula.png` object from Storage.

update public.asset_library
set
  canonical_name = 'silicone_spatula',
  description =
    'Flexible silicone spatula (French: maryse) for folding batters, scraping mixing bowls, stand-mixer bowls, and sauces in pans. Do not use for sliding under baked casseroles or gratins to lift serving portions—use @TurningSpatula. Do not use for transferring fragile layered pastries—use @OffsetSpatula.',
  aliases = array['SiliconeSpatula', 'Maryse', 'RubberSpatula', 'Spatula']
where canonical_name = 'spatula';

update public.media_assets ma
set
  storage_path = 'library/utensil/silicone_spatula.png',
  original_filename = 'silicone_spatula.png',
  metadata = coalesce(ma.metadata, '{}'::jsonb)
    || jsonb_build_object('canonicalName', 'silicone_spatula')
from public.asset_library lib
where lib.canonical_name = 'silicone_spatula'
  and ma.id = lib.media_asset_id;

update public.asset_library
set
  description =
    'Rigid turning spatula (fish / slotted turner style) for sliding under foods in pans or baking dishes—lasagna, gratin, sheet-cake portions, fish fillets—and lifting a serving while keeping it supported.',
  aliases = array['TurningSpatula', 'FishSpatula']
where canonical_name = 'turning_spatula';

update public.asset_library
set
  description =
    'Offset pastry spatula (cranked blade) for sliding under tart shells, cookies, or entremets and lifting delicate layers; pairs are common for tall items.',
  aliases = array['OffsetSpatula']
where canonical_name = 'offset_spatula';
