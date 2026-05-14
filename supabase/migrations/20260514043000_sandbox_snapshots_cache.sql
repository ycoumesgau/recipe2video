-- Cache table for Vercel Sandbox snapshots that the cloud render orchestrator
-- uses as a warm-start cache.
--
-- After a successful "cold" composition render (clone → dnf install → npm ci →
-- bundle → render), the orchestrator calls `sandbox.snapshot()` on the running
-- VM and stores the returned `snapshot_id` here, keyed by a content hash of
-- everything that would invalidate the cached filesystem:
--   - `remotion-export/package-lock.json`
--   - `remotion/index.tsx` and `remotion/compositions/recipe-assembly.tsx`
--   - `remotion-export/render.mjs`
--   - the list of dnf packages installed for Chrome Headless Shell
--   - the sandbox runtime (e.g. "node24")
--
-- On the next render, the orchestrator looks the row up and, when present,
-- creates the sandbox with `source: { type: "snapshot", snapshotId }` —
-- skipping the cold install steps entirely. The render still writes a fresh
-- `props.json` and reads back `out.mp4`.
--
-- The `scope` column is reserved for future warm-start caches (e.g. if we add
-- a Suno transcript renderer or another sandbox-driven worker). Today every
-- row uses `composition_render`.

create table if not exists public.sandbox_snapshots (
  id uuid primary key default gen_random_uuid(),
  scope text not null,
  cache_key text not null,
  snapshot_id text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  last_used_at timestamptz,
  unique (scope, cache_key)
);

create index if not exists sandbox_snapshots_scope_key_idx
  on public.sandbox_snapshots (scope, cache_key);

alter table public.sandbox_snapshots enable row level security;

-- Only the service_role (Inngest worker) ever touches this table; the table is
-- not exposed to any client surface. We still add an allowlisted read policy
-- so /active-generations could show the cache state in the future without
-- needing a separate admin route.

drop policy if exists "Allowlisted users can read sandbox_snapshots"
  on public.sandbox_snapshots;
create policy "Allowlisted users can read sandbox_snapshots"
  on public.sandbox_snapshots
  for select
  to authenticated
  using (public.is_allowlisted_profile());

revoke all on public.sandbox_snapshots from anon;
