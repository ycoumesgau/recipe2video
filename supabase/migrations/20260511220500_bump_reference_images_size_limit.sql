-- Bump the `reference-images` bucket size limit to 32 MiB so the asset
-- library seed can store the largest kitchen background PNGs (~18 MiB) and
-- leave headroom for future high-resolution recipe-specific references.
--
-- Original limit was 16 MiB (16777216) set by 20260509010500_create_media_storage_buckets.sql.
-- 32 MiB is conservative: GPT-Image 2 references at 1024×1024 land well under
-- 5 MiB and the upload paths still validate MIME types in code.

update storage.buckets
  set file_size_limit = 33554432
  where id = 'reference-images';
