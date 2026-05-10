-- Chat-first persistence for Recipe Agent (one thread per video).

create table public.recipe_agent_threads (
  id uuid primary key default gen_random_uuid(),
  video_id uuid not null unique references public.videos(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_agent_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.recipe_agent_threads(id) on delete cascade,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  status text not null default 'complete' check (
    status in ('streaming', 'complete', 'error', 'cancelled')
  ),
  summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.recipe_agent_steps (
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references public.agent_runs(id) on delete cascade,
  seq integer not null,
  step_type text not null check (
    step_type in ('thinking', 'tool_call', 'status', 'request', 'unknown')
  ),
  state text not null default 'running' check (
    state in ('pending', 'running', 'done', 'error')
  ),
  label text,
  detail text,
  payload jsonb not null default '{}'::jsonb,
  source_event_seq integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (agent_run_id, seq)
);

alter table public.agent_runs
  add column user_chat_message_id uuid references public.recipe_agent_messages(id) on delete set null,
  add column assistant_chat_message_id uuid references public.recipe_agent_messages(id) on delete set null;

create index idx_recipe_agent_messages_thread_created
  on public.recipe_agent_messages(thread_id, created_at asc);

create index idx_recipe_agent_steps_run_seq
  on public.recipe_agent_steps(agent_run_id, seq asc);

create trigger set_recipe_agent_threads_updated_at
  before update on public.recipe_agent_threads
  for each row execute function public.set_updated_at();

create trigger set_recipe_agent_messages_updated_at
  before update on public.recipe_agent_messages
  for each row execute function public.set_updated_at();

create trigger set_recipe_agent_steps_updated_at
  before update on public.recipe_agent_steps
  for each row execute function public.set_updated_at();

alter table public.recipe_agent_threads enable row level security;
alter table public.recipe_agent_messages enable row level security;
alter table public.recipe_agent_steps enable row level security;

create policy "Allowlisted users can read recipe_agent_threads"
  on public.recipe_agent_threads
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert recipe_agent_threads"
  on public.recipe_agent_threads
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update recipe_agent_threads"
  on public.recipe_agent_threads
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can read recipe_agent_messages"
  on public.recipe_agent_messages
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert recipe_agent_messages"
  on public.recipe_agent_messages
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update recipe_agent_messages"
  on public.recipe_agent_messages
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can read recipe_agent_steps"
  on public.recipe_agent_steps
  for select
  to authenticated
  using (public.is_allowlisted_profile());

create policy "Allowlisted users can insert recipe_agent_steps"
  on public.recipe_agent_steps
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

create policy "Allowlisted users can update recipe_agent_steps"
  on public.recipe_agent_steps
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

grant select, insert, update, delete on public.recipe_agent_threads to authenticated;
grant select, insert, update, delete on public.recipe_agent_messages to authenticated;
grant select, insert, update, delete on public.recipe_agent_steps to authenticated;

revoke all on public.recipe_agent_threads from anon;
revoke all on public.recipe_agent_messages from anon;
revoke all on public.recipe_agent_steps from anon;
