-- Polling orchestration for long-running Cursor agent runs (start → poll → finalize).

alter table public.agent_runs
  add column cursor_run_started_at timestamptz,
  add column cursor_stream_last_seq integer not null default 0,
  add column cursor_stream_last_event_signature text,
  add column cursor_assistant_text_length integer not null default 0,
  add column last_polled_at timestamptz,
  add column poll_count integer not null default 0,
  add column cancel_requested boolean not null default false;

alter table public.agent_runs
  drop constraint if exists agent_runs_status_check;

alter table public.agent_runs
  add constraint agent_runs_status_check check (
    status in (
      'queued',
      'starting',
      'running',
      'finalizing',
      'finished',
      'error',
      'cancelled',
      'timed_out'
    )
  );

create index idx_agent_runs_status_running
  on public.agent_runs(status)
  where status in ('running', 'starting', 'finalizing');
