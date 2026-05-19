-- Dedicated Storage buckets for streaming-publication artifacts.
--
--   album-covers     : GPT-Image 2 source PNG (max ~2.5 MB at 2880x2880,
--                      well under the 16 MB cap). The 3000x3000 JPEG used
--                      for upload to streaming platforms is computed on
--                      the fly by sharp at download time and is NOT
--                      re-stored.
--   spotify-canvases : Seedance 2 MP4 output at 1080:1920, 5-8 s. Capped
--                      to 256 MB (same as runway-outputs) to leave room
--                      for future regen variants and any optional
--                      Mux-side transcode artifact.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('album-covers', 'album-covers', false, 16777216),
  ('spotify-canvases', 'spotify-canvases', false, 262144000)
on conflict (id) do update
set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit;
