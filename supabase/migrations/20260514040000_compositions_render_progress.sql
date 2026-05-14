-- Adds a `render_progress` column on `compositions` so the cloud render
-- orchestrator (Inngest → `renderAssemblyMp4InSandbox`) can report live
-- frame-level progress that the assembly UI / active-generations dashboard
-- can poll while a Vercel Sandbox render is in flight.
--
-- Shape (`schema: 'render_progress_v1'`), all fields optional except `schema`:
--   {
--     "schema": "render_progress_v1",
--     "phase": "starting" | "dnf_install" | "npm_install" | "bundling"
--              | "rendering" | "finalizing",
--     "renderedFrames": 463,
--     "totalFrames": 1171,
--     "encodedFrames": 329,
--     "sandboxId": "sbx_...",
--     "sandboxStartedAt": "2026-05-14T03:45:12.000Z",
--     "renderStartedAt": "2026-05-14T03:47:00.000Z",
--     "updatedAt": "2026-05-14T03:48:00.000Z"
--   }
--
-- Kept as JSONB rather than separate columns so future phases / fields can be
-- added without further migrations during the hackathon.

alter table public.compositions
  add column if not exists render_progress jsonb;
