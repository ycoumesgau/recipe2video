-- Soft-deleted conversations should not block reusing the same name/slug.
alter table public.agent_conversations
  drop constraint if exists agent_conversations_video_name_unique,
  drop constraint if exists agent_conversations_video_slug_unique;

create unique index if not exists agent_conversations_video_name_unique
  on public.agent_conversations (video_id, name)
  where deleted_at is null;

create unique index if not exists agent_conversations_video_slug_unique
  on public.agent_conversations (video_id, slug)
  where deleted_at is null;
