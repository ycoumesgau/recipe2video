alter table public.videos
  drop constraint if exists videos_agent_status_check;

alter table public.videos
  add constraint videos_agent_status_check check (
    agent_status in (
      'idle',
      'running',
      'needs_sync',
      'validation_failed',
      'failed',
      'needs_input'
    )
  );

alter table public.videos
  add column agent_git_branch text,
  add column agent_git_commit_sha text;

alter table public.agent_runs
  add column agent_git_branch text,
  add column agent_git_commit_sha text,
  add column needs_user_input boolean not null default false;

create table public.agent_run_events (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  seq integer not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (agent_run_id, seq)
);

create index idx_agent_run_events_run_seq
on public.agent_run_events(agent_run_id, seq desc);

alter table public.agent_run_events enable row level security;

create policy "Allowlisted users can read agent_run_events"
  on public.agent_run_events
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert agent_run_events"
  on public.agent_run_events
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

grant select, insert on public.agent_run_events to authenticated;
revoke all on public.agent_run_events from anon;
