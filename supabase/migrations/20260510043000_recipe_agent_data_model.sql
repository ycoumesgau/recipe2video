alter table public.videos
  add column cursor_agent_id text,
  add column cursor_agent_runtime text check (
    cursor_agent_runtime is null or cursor_agent_runtime in ('cloud', 'local')
  ),
  add column agent_workspace_path text,
  add column last_agent_run_id text,
  add column last_agent_sync_at timestamptz,
  add column agent_status text not null default 'idle' check (
    agent_status in (
      'idle',
      'running',
      'needs_sync',
      'validation_failed',
      'failed'
    )
  );

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  cursor_agent_id text not null,
  cursor_run_id text,
  stage text not null check (
    stage in (
      'recipe_ingest',
      'storyboard_revision',
      'seedance_segmentation',
      'reference_planning',
      'segment_prompt_revision',
      'suno_prompt_revision',
      'general'
    )
  ),
  user_message text not null,
  status text not null default 'queued' check (
    status in ('queued', 'running', 'finished', 'error', 'cancelled')
  ),
  result_summary text,
  error text,
  created_by uuid references public.profiles(id),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agent_artifacts (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null references public.videos(id) on delete cascade,
  artifact_name text not null,
  artifact_path text not null,
  content text not null,
  content_hash text,
  validation_status text not null default 'pending' check (
    validation_status in ('pending', 'valid', 'invalid')
  ),
  validation_errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (video_id, artifact_name)
);

create trigger set_agent_runs_updated_at
before update on public.agent_runs
for each row execute function public.set_updated_at();

create trigger set_agent_artifacts_updated_at
before update on public.agent_artifacts
for each row execute function public.set_updated_at();

create index idx_videos_cursor_agent_id
on public.videos(cursor_agent_id)
where cursor_agent_id is not null;

create index idx_videos_agent_status
on public.videos(agent_status);

create index idx_agent_runs_video_created
on public.agent_runs(video_id, created_at desc);

create index idx_agent_runs_cursor_agent
on public.agent_runs(cursor_agent_id);

create index idx_agent_artifacts_video
on public.agent_artifacts(video_id);

alter table public.agent_runs enable row level security;
alter table public.agent_artifacts enable row level security;

create policy "Allowlisted users can read agent_runs"
  on public.agent_runs
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert agent_runs"
  on public.agent_runs
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update agent_runs"
  on public.agent_runs
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete agent_runs"
  on public.agent_runs
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can read agent_artifacts"
  on public.agent_artifacts
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert agent_artifacts"
  on public.agent_artifacts
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update agent_artifacts"
  on public.agent_artifacts
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can delete agent_artifacts"
  on public.agent_artifacts
  for delete
  to authenticated
  using (public.is_allowlisted_profile());

grant select, insert, update, delete on public.agent_runs to authenticated;
grant select, insert, update, delete on public.agent_artifacts to authenticated;

revoke all on public.agent_runs from anon;
revoke all on public.agent_artifacts from anon;
