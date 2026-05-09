-- Lightweight key-value table for app-wide settings that need to survive
-- a deployment without going through environment variables. The first user
-- of this table is the global generation queue pause flag, which is now
-- togglable from the /active-generations page (Issue #20 follow-up).
--
-- The table is RLS-protected and only readable/writable by allowlisted users.
-- The service_role bypasses RLS, which is what the Inngest worker uses.

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_app_settings_updated_at on public.app_settings;
create trigger set_app_settings_updated_at
before update on public.app_settings
for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;

drop policy if exists "Allowlisted users can read app_settings" on public.app_settings;
create policy "Allowlisted users can read app_settings"
  on public.app_settings
  for select
  to authenticated
  using (public.is_allowlisted_profile());

drop policy if exists "Allowlisted users can upsert app_settings" on public.app_settings;
create policy "Allowlisted users can upsert app_settings"
  on public.app_settings
  for insert
  to authenticated
  with check (public.is_allowlisted_profile());

drop policy if exists "Allowlisted users can update app_settings" on public.app_settings;
create policy "Allowlisted users can update app_settings"
  on public.app_settings
  for update
  to authenticated
  using (public.is_allowlisted_profile())
  with check (public.is_allowlisted_profile());

revoke all on public.app_settings from anon;

-- Default row for the queue pause flag so the first read does not return null.
insert into public.app_settings (key, value)
values ('generation_queue_paused', 'false'::jsonb)
on conflict (key) do nothing;
