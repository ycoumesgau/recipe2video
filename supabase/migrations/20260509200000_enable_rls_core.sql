-- Enable RLS on every business table created by 20260508195300_create_core_schema.sql.
--
-- Recipe2Video is a public GitHub repository, so NEXT_PUBLIC_SUPABASE_URL and
-- NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are visible to anyone. Without RLS, an
-- attacker could call the Supabase REST API directly to read or write business
-- data. The PRD requires "Enable RLS if the app is deployed publicly" and
-- "No costly action without authenticated allowlisted user".
--
-- Strategy: every table allows access only to authenticated users whose
-- auth.uid() exists in public.profiles (the allowlist mirror). The server-side
-- admin client uses the service_role key, which bypasses RLS automatically.

create or replace function public.is_allowlisted_profile()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
  );
$$;

revoke all on function public.is_allowlisted_profile() from public;
grant execute on function public.is_allowlisted_profile() to authenticated;

-- Tables already RLS-protected by 20260508192500_auth_allowlist.sql:
--   public.allowed_users, public.profiles
-- We extend the profile policy so every allowlisted user can see the directory.
drop policy if exists "Profiles are readable by allowlisted users" on public.profiles;
create policy "Profiles are readable by allowlisted users"
  on public.profiles
  for select
  to authenticated
  using (public.is_allowlisted_profile());

-- Allowlist directory: only allowlisted users can read it. Writes stay
-- restricted to the service_role.
drop policy if exists "Allowed users readable by allowlisted users" on public.allowed_users;
create policy "Allowed users readable by allowlisted users"
  on public.allowed_users
  for select
  to authenticated
  using (public.is_allowlisted_profile());

-- Helper to apply the same allowlisted-only policy set to every business table.
do $$
declare
  target_table text;
  business_tables text[] := array[
    'videos',
    'segments',
    'logical_scenes',
    'media_assets',
    'reference_assets',
    'generations',
    'scene_feedbacks',
    'cost_logs',
    'compositions'
  ];
begin
  foreach target_table in array business_tables loop
    execute format('alter table public.%I enable row level security', target_table);

    execute format(
      'drop policy if exists "Allowlisted users can read %1$I" on public.%1$I',
      target_table
    );
    execute format(
      'create policy "Allowlisted users can read %1$I" on public.%1$I '
      'for select to authenticated using (public.is_allowlisted_profile())',
      target_table
    );

    execute format(
      'drop policy if exists "Allowlisted users can insert %1$I" on public.%1$I',
      target_table
    );
    execute format(
      'create policy "Allowlisted users can insert %1$I" on public.%1$I '
      'for insert to authenticated with check (public.is_allowlisted_profile())',
      target_table
    );

    execute format(
      'drop policy if exists "Allowlisted users can update %1$I" on public.%1$I',
      target_table
    );
    execute format(
      'create policy "Allowlisted users can update %1$I" on public.%1$I '
      'for update to authenticated using (public.is_allowlisted_profile()) '
      'with check (public.is_allowlisted_profile())',
      target_table
    );

    execute format(
      'drop policy if exists "Allowlisted users can delete %1$I" on public.%1$I',
      target_table
    );
    execute format(
      'create policy "Allowlisted users can delete %1$I" on public.%1$I '
      'for delete to authenticated using (public.is_allowlisted_profile())',
      target_table
    );
  end loop;
end;
$$;

-- Anonymous role cannot read any of the business data. Even if an attacker
-- gets hold of NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, the REST API will return
-- empty result sets without an authenticated allowlisted session.
revoke all on public.videos from anon;
revoke all on public.segments from anon;
revoke all on public.logical_scenes from anon;
revoke all on public.media_assets from anon;
revoke all on public.reference_assets from anon;
revoke all on public.generations from anon;
revoke all on public.scene_feedbacks from anon;
revoke all on public.cost_logs from anon;
revoke all on public.compositions from anon;
