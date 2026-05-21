-- Multi-conversations Cursor SDK per video project.
-- Each conversation owns its own agent session, Git branch, chat thread,
-- storyboard rows (logical_scenes / segments), and agent artifacts snapshot.
-- reference_assets, media_assets, and generations stay shared at video level.

create table public.agent_conversations (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  name text not null,
  slug text not null,
  cursor_agent_id text,
  cursor_agent_runtime text check (
    cursor_agent_runtime is null or cursor_agent_runtime in ('cloud', 'local')
  ),
  agent_workspace_path text,
  agent_git_branch text,
  agent_git_commit_sha text,
  agent_status text not null default 'idle' check (
    agent_status in (
      'idle',
      'running',
      'needs_sync',
      'validation_failed',
      'failed',
      'needs_input'
    )
  ),
  last_agent_run_id text,
  last_agent_sync_at timestamptz,
  cursor_agent_model text not null default 'composer-2.5',
  cursor_agent_reasoning text,
  cursor_agent_fast boolean not null default false,
  custom_instructions text,
  include_assets_manifest boolean not null default true,
  is_active boolean not null default false,
  archived_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agent_conversations_video_name_unique unique (video_id, name),
  constraint agent_conversations_video_slug_unique unique (video_id, slug)
);

create unique index agent_conversations_one_active_per_video
  on public.agent_conversations(video_id)
  where is_active = true and deleted_at is null;

create index idx_agent_conversations_video
  on public.agent_conversations(video_id, created_at asc);

create trigger set_agent_conversations_updated_at
  before update on public.agent_conversations
  for each row execute function public.set_updated_at();

-- logical_scenes: scope by conversation + active flag
alter table public.logical_scenes
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade,
  add column is_active boolean not null default true;

alter table public.logical_scenes
  drop constraint if exists logical_scenes_video_id_position_key;

create unique index logical_scenes_active_position_unique
  on public.logical_scenes(video_id, position)
  where is_active = true;

create index idx_logical_scenes_conversation
  on public.logical_scenes(agent_conversation_id)
  where agent_conversation_id is not null;

-- segments: scope by conversation + active flag
alter table public.segments
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade,
  add column is_active boolean not null default true;

alter table public.segments
  drop constraint if exists segments_video_id_position_key;

create unique index segments_active_position_unique
  on public.segments(video_id, position)
  where is_active = true;

create index idx_segments_conversation
  on public.segments(agent_conversation_id)
  where agent_conversation_id is not null;

-- segment_references: track conversation + active for switch restore
alter table public.segment_references
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade,
  add column is_active boolean not null default true;

create index idx_segment_references_conversation
  on public.segment_references(agent_conversation_id)
  where agent_conversation_id is not null;

-- agent_artifacts: per conversation
alter table public.agent_artifacts
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade;

alter table public.agent_artifacts
  drop constraint if exists agent_artifacts_video_id_artifact_name_key;

create unique index agent_artifacts_video_conversation_name_unique
  on public.agent_artifacts(video_id, agent_conversation_id, artifact_name)
  where agent_conversation_id is not null;

-- Legacy rows without conversation keep the old unique key
create unique index agent_artifacts_video_name_legacy_unique
  on public.agent_artifacts(video_id, artifact_name)
  where agent_conversation_id is null;

-- agent_runs: per conversation
alter table public.agent_runs
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade;

create index idx_agent_runs_conversation
  on public.agent_runs(agent_conversation_id, created_at desc)
  where agent_conversation_id is not null;

-- recipe_agent_threads: one thread per conversation
alter table public.recipe_agent_threads
  add column agent_conversation_id uuid references public.agent_conversations(id) on delete cascade;

alter table public.recipe_agent_threads
  drop constraint if exists recipe_agent_threads_video_id_key;

create unique index recipe_agent_threads_video_conversation_unique
  on public.recipe_agent_threads(video_id, agent_conversation_id)
  where agent_conversation_id is not null;

create unique index recipe_agent_threads_video_legacy_unique
  on public.recipe_agent_threads(video_id)
  where agent_conversation_id is null;

-- RLS for agent_conversations
alter table public.agent_conversations enable row level security;

create policy "Allowlisted users can read agent_conversations"
  on public.agent_conversations
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert agent_conversations"
  on public.agent_conversations
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update agent_conversations"
  on public.agent_conversations
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete agent_conversations"
  on public.agent_conversations
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

grant select, insert, update, delete on public.agent_conversations to authenticated;
revoke all on public.agent_conversations from anon;

-- Data migration: one "Initial" conversation per video that has agent data or storyboard rows
do $$
declare
  v record;
  conv_id uuid;
  model_val text;
  reasoning_val text;
  fast_val boolean;
  instructions_val text;
begin
  for v in
    select
      vid.id as video_id,
      vid.cursor_agent_id,
      vid.cursor_agent_runtime,
      vid.agent_workspace_path,
      vid.agent_git_branch,
      vid.agent_git_commit_sha,
      vid.agent_status,
      vid.last_agent_run_id,
      vid.last_agent_sync_at,
      vid.recipe_data
    from public.videos vid
    where vid.cursor_agent_id is not null
       or exists (select 1 from public.logical_scenes ls where ls.video_id = vid.id)
       or exists (select 1 from public.segments s where s.video_id = vid.id)
       or exists (select 1 from public.agent_runs ar where ar.video_id = vid.id)
       or exists (select 1 from public.recipe_agent_threads rat where rat.video_id = vid.id)
  loop
    model_val := coalesce(
      nullif(trim(v.recipe_data->'productionDefaults'->>'cursorAgentModel'), ''),
      'composer-2.5'
    );
    reasoning_val := nullif(trim(v.recipe_data->'productionDefaults'->>'cursorAgentReasoning'), '');
    fast_val := coalesce(
      lower(v.recipe_data->'productionDefaults'->>'cursorAgentFast') in ('true', '1', 'yes'),
      false
    );
    instructions_val := nullif(trim(v.recipe_data->>'complementaryAgentInstructions'), '');

    insert into public.agent_conversations (
      video_id,
      name,
      slug,
      cursor_agent_id,
      cursor_agent_runtime,
      agent_workspace_path,
      agent_git_branch,
      agent_git_commit_sha,
      agent_status,
      last_agent_run_id,
      last_agent_sync_at,
      cursor_agent_model,
      cursor_agent_reasoning,
      cursor_agent_fast,
      custom_instructions,
      include_assets_manifest,
      is_active
    ) values (
      v.video_id,
      'Initial',
      'initial',
      v.cursor_agent_id,
      v.cursor_agent_runtime,
      v.agent_workspace_path,
      v.agent_git_branch,
      v.agent_git_commit_sha,
      v.agent_status,
      v.last_agent_run_id,
      v.last_agent_sync_at,
      model_val,
      reasoning_val,
      fast_val,
      instructions_val,
      true,
      true
    )
    returning id into conv_id;

    update public.logical_scenes
      set agent_conversation_id = conv_id
      where video_id = v.video_id and agent_conversation_id is null;

    update public.segments
      set agent_conversation_id = conv_id
      where video_id = v.video_id and agent_conversation_id is null;

    update public.segment_references sr
      set agent_conversation_id = conv_id
    from public.segments s
    where sr.segment_id = s.id
      and s.video_id = v.video_id
      and sr.agent_conversation_id is null;

    update public.agent_artifacts
      set agent_conversation_id = conv_id
      where video_id = v.video_id and agent_conversation_id is null;

    update public.agent_runs
      set agent_conversation_id = conv_id
      where video_id = v.video_id and agent_conversation_id is null;

    update public.recipe_agent_threads
      set agent_conversation_id = conv_id
      where video_id = v.video_id and agent_conversation_id is null;
  end loop;
end $$;
