alter table public.videos
  add column archived_at timestamptz;

comment on column public.videos.archived_at is
  'When set, the project is hidden from the default library and can be restored without deleting data.';
