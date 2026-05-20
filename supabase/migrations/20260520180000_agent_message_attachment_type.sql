-- Vision attachments for recipe agent messages (Cursor SDK images).

alter table public.media_assets
  drop constraint if exists media_assets_type_check;

alter table public.media_assets
  add constraint media_assets_type_check
  check (
    type in (
      'recipe_source',
      'reference_image',
      'runway_output',
      'accepted_clip',
      'suno_audio',
      'final_export',
      'album_cover_image',
      'spotify_canvas_video',
      'agent_message_attachment'
    )
  );
