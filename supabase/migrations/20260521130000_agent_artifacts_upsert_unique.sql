-- PostgREST/Supabase upsert (ON CONFLICT) requires a non-partial unique constraint.
-- Partial indexes from the multi-conversation migration cannot be targeted by onConflict.

update public.agent_artifacts aa
set agent_conversation_id = ac.id
from public.agent_conversations ac
where aa.video_id = ac.video_id
  and ac.slug = 'initial'
  and ac.deleted_at is null
  and aa.agent_conversation_id is null;

drop index if exists public.agent_artifacts_video_conversation_name_unique;
drop index if exists public.agent_artifacts_video_name_legacy_unique;

alter table public.agent_artifacts
  alter column agent_conversation_id set not null;

alter table public.agent_artifacts
  add constraint agent_artifacts_video_conversation_name_unique
  unique (video_id, agent_conversation_id, artifact_name);
