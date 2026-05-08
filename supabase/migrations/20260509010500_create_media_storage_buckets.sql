insert into storage.buckets (id, name, public, file_size_limit)
values
  ('recipe-sources', 'recipe-sources', false, 16777216),
  ('reference-images', 'reference-images', false, 16777216),
  ('runway-outputs', 'runway-outputs', false, 262144000),
  ('accepted-clips', 'accepted-clips', false, 262144000),
  ('suno-audio', 'suno-audio', false, 52428800),
  ('final-exports', 'final-exports', false, 524288000)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit;
