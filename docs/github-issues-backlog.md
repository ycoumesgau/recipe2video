# Recipe2Video — GitHub Issues Backlog

### Purpose

This document contains the initial GitHub Issues backlog for the Recipe2Video hackathon repo. It is designed to be copied into GitHub Issues or used by a Cursor agent to create issues automatically once the public repo is created.

Use GitHub Issues instead of Linear for this hackathon project so the work is colocated with the public repository and visible to reviewers if needed.

---

## Labels to Create

Area labels:

* `area:ui`
* `area:auth`
* `area:db`
* `area:storage`
* `area:runway`
* `area:openai`
* `area:workflow`
* `area:mux`
* `area:remotion`
* `area:ux`
* `area:docs`
* `area:demo`

Priority labels:

* `priority:p0`
* `priority:p1`
* `priority:p2`

Execution labels:

* `agent-ready`
* `blocked`
* `demo-critical`
* `needs-human-review`

---

## Issue 01 — Bootstrap Next.js App and Repository Structure

Labels: `priority:p0`, `area:ui`, `area:docs`, `agent-ready`

Suggested branch: `agent/bootstrap-app`

### Goal

Create the initial Recipe2Video repository structure with Next.js, TypeScript, Tailwind, shadcn/ui, and the agreed folder conventions.

### Scope

* Initialize Next.js App Router project.
* Install and configure TypeScript and Tailwind.
* Initialize shadcn/ui.
* Create required folder structure.
* Add placeholder routes for login, dashboard, video detail, and docs.
* Add the PRD and execution docs.
* Install the Runway API skills: copy the contents of `runwayml/skills/skills/` from https://github.com/runwayml/skills into `.cursor/skills/` of this repository, keeping upstream folder names and SKILL.md files unchanged. `.cursor/skills/` must be tracked in git (not in `.gitignore`).

### Out of Scope

* Supabase implementation.
* Runway integration.
* Mux integration.
* Inngest workflows.

### Acceptance Criteria

* App runs locally.
* Folder structure matches `docs/technical-contracts.md`.
* shadcn/ui is initialized.
* Dashboard route renders a placeholder.
* Login route renders a placeholder.
* Documentation files are present.
* `.cursor/skills/use-runway-api/SKILL.md`, `.cursor/skills/rw-api-reference/SKILL.md`, and companion `rw-*` skills exist and match upstream `runwayml/skills/skills/` content.
* `.cursor/skills/` is tracked in git.

### Test / Demo

Run the app locally and verify `/login` and `/` render without errors. Confirm `.cursor/skills/use-runway-api/SKILL.md` is present and readable, and that `git ls-files .cursor/skills/` returns the skill files.

---

## Issue 02 — Implement Supabase Auth Magic Link and Email Allowlist

Labels: `priority:p0`, `area:auth`, `area:db`, `demo-critical`, `agent-ready`

Suggested branch: `agent/supabase-auth-schema`

### Goal

Implement internal-only authentication using Supabase Magic Link and an `allowed_users` table.

### Scope

* Supabase client setup.
* Magic Link login page.
* `allowed_users` migration.
* `profiles` migration.
* Server-side allowlist checks.
* Protected dashboard routes.

### Out of Scope

* Google OAuth.
* Public signup.
* Role-based permissions beyond admin/member.
* Main Runway generation logic.

### Acceptance Criteria

* User can request a Magic Link.
* Allowlisted user can access dashboard.
* Non-allowlisted user sees unauthorized state.
* Costly API route helper rejects unauthorized users.
* User ID can be associated with created videos.

### Test / Demo

Add one test email to `allowed_users`, log in, and verify dashboard access. Try another email and verify denial.

---

## Issue 03 — Create Supabase Schema and Data Access Layer

Labels: `priority:p0`, `area:db`, `agent-ready`

Suggested branch: `agent/supabase-schema-data`

### Goal

Create the database schema and typed data access helpers for projects, scenes, segments, references, generations, feedback, costs, and compositions.

### Scope

* Create migrations for all core tables.
* Add indexes defined in technical contracts.
* Add TypeScript domain types.
* Add data access helpers for video projects, segments, generations, and costs.

### Out of Scope

* Auth UI.
* Runway calls.
* Mux upload.
* RAG implementation beyond nullable embedding field.

### Acceptance Criteria

* Migrations run cleanly.
* Types match `docs/technical-contracts.md`.
* Helpers exist for creating and reading video projects.
* Helpers exist for updating segment and generation status.
* Cost log helper exists.

### Test / Demo

Seed a video project and display it in a simple debug query or test route.

---

## Issue 04 — Implement Supabase Storage Buckets and Media Persistence Helpers

Labels: `priority:p0`, `area:storage`, `area:db`, `demo-critical`, `agent-ready`

Suggested branch: `agent/supabase-storage`

### Goal

Implement durable storage for original generated media files using Supabase Storage.

### Scope

* Create or document required buckets.
* Add storage helper functions.
* Store original Runway outputs in Supabase Storage.
* Store source recipe uploads.
* Store approved reference images.
* Store uploaded Suno audio.
* Store final export files.

### Out of Scope

* Mux upload implementation.
* Remotion rendering.
* Runway generation task creation.

### Acceptance Criteria

* Storage paths follow `docs/technical-contracts.md`.
* A file can be uploaded and retrieved from Supabase Storage.
* Media metadata is persisted in the `media_assets` table per the schema in `docs/technical-contracts.md`, with `storage_bucket` and `storage_path` populated.
* Original file path is available for Remotion and future backup/export.

### Test / Demo

Upload a sample MP4 and image to Supabase Storage and create the corresponding `media_assets` rows. Verify the storage path resolves and the media asset metadata is queryable.

---

## Issue 05 — Implement Mux Pay-as-you-go Playback Integration

Labels: `priority:p0`, `area:mux`, `area:storage`, `agent-ready`

Suggested branch: `agent/mux-integration`

### Goal

Use Mux as the playback, thumbnail, and streaming layer for generated clips and final exports.

### Scope

* Mux API client.
* Upload a file from Supabase Storage to Mux.
* Store `mux_asset_id` and `mux_playback_id` on the related `media_assets` row, and link the generation through `generations.media_asset_id`.
* Create reusable MuxPlayer component.
* Use Basic on-demand video assumptions.

### Out of Scope

* Treating Mux as the only durable storage layer.
* DRM.
* Live streaming.
* Custom domains.
* Static MP4 renditions for every segment.

### Acceptance Criteria

* A Supabase-stored MP4 can be uploaded to Mux.
* Mux asset and playback IDs are stored on the `media_assets` row corresponding to the generation, in line with the schema in `docs/technical-contracts.md`.
* The related `generations` row references the media asset through `generations.media_asset_id`.
* MuxPlayer can play the uploaded asset using the stored playback ID.
* If Mux upload fails, the Supabase Storage original remains preserved and the `media_assets` status reflects the failure.

### Test / Demo

Upload a sample MP4 from Supabase Storage to Mux and play it in a test page.

---

## Issue 06 — Implement Runway Client and Task Polling

Labels: `priority:p0`, `area:runway`, `area:workflow`, `demo-critical`, `agent-ready`

Suggested branch: `agent/runway-client`

### Goal

Implement the Runway API client, media uploads, task creation, and task polling primitives.

### Contracts

* Read `.cursor/skills/use-runway-api/SKILL.md` and `.cursor/skills/rw-api-reference/SKILL.md` for endpoint shapes, parameter names, and polling cadence before implementing helpers. The skills are the authoritative low-level reference.
* Cross-check against the public Runway API documentation: https://docs.dev.runwayml.com/ and https://docs.dev.runwayml.com/api.
* Default model identifiers come from `docs/technical-contracts.md` (Runway Contract section).
* Use the official Node.js SDK: `@runwayml/sdk`.
* Required environment variable: `RUNWAYML_API_SECRET`.

### Scope

* Runway SDK setup using `@runwayml/sdk`.
* Upload helper for references.
* Start generation helper for Seedance segment tasks.
* Start reference image helper for GPT-Image 2 tasks.
* Task polling helper.
* Output download helper.

### Out of Scope

* Full Inngest workflow orchestration.
* Prompt generation.
* UI.
* Mux upload.

### Acceptance Criteria

* Runway API key is read from environment variables (`RUNWAYML_API_SECRET`).
* A test API call can verify organization or task access if available.
* A task polling helper returns status consistently.
* Runtime errors are normalized into application errors.
* No silent fallback exists.
* Helpers reference the patterns documented in `.cursor/skills/use-runway-api/SKILL.md` and `.cursor/skills/rw-api-reference/SKILL.md`. Any deviation must be justified in the PR description.

### Test / Demo

Run a minimal task or mocked task flow and verify statuses are persisted.

---

## Issue 07 — Implement OpenAI GPT-5.5 Planning and Prompt Engine

Labels: `priority:p0`, `area:openai`, `area:runway`, `agent-ready`

Suggested branch: `agent/openai-prompt-engine`

### Goal

Implement the agent reasoning layer for recipe analysis, storyboard generation, Seedance segmentation, and prompt editing.

### Scope

* OpenAI client setup.
* GPT-5.5 High configuration.
* Recipe analysis prompt.
* Storyboard generation prompt.
* Seedance segment compression prompt.
* Prompt editing from feedback.
* Prompt diff generation.
* Cost logging for token usage.

### Out of Scope

* UI chat implementation.
* Runway generation task execution.
* Embedding/RAG implementation unless trivial.

### Acceptance Criteria

* Given a recipe, the system can generate logical scenes.
* Given logical scenes, the system can generate Seedance segments.
* Given user feedback, the system can produce a revised prompt and diff.
* Token usage is logged.
* Useful rules from the existing `videos` repo are represented in prompt instructions.

### Test / Demo

Use a sample recipe and produce both logical scenes and Seedance segments in JSON.

---

## Issue 08 — Port Useful Rules from Existing videos Repo

Labels: `priority:p0`, `area:openai`, `area:runway`, `area:docs`, `agent-ready`

Suggested branch: `agent/port-video-rules`

### Goal

Port only the useful creative and prompting rules from the existing `ycoumesgau/videos` repo into the new hackathon repo.

### Scope

Keep useful concepts:

* recipe ingest
* food video constraints
* asset reference system
* food physics reference
* TikTok food direction
* Suno music generation
* Seedance workflow

Remove or avoid production assumptions:

* first-frame / last-frame workflow
* Kling 2.5 Turbo Pro production path
* one-generation-per-micro-scene workflow

### Out of Scope

* Implementing the full old repo.
* Copying obsolete prompts blindly.
* Creating Cursor skills that contradict the PRD.

### Acceptance Criteria

* New repo has concise rules for Seedance-only workflow.
* Rules explicitly distinguish logical scenes from Seedance segments.
* Rules preserve texture-first hook, micro-arc, ASMR, reference discipline, and complex geometry handling.
* No first-frame / last-frame production path is presented as current.

### Test / Demo

Review new prompting docs and confirm they align with the PRD and technical contracts.

---

## Issue 09 — Implement Inngest Workflow Orchestration

Labels: `priority:p0`, `area:workflow`, `area:runway`, `demo-critical`, `agent-ready`

Suggested branch: `agent/inngest-workflows`

### Goal

Implement durable background workflows for recipe processing, generation, polling, persistence, Mux upload, and cost logging.

### Scope

* Inngest client setup.
* Event definitions.
* Recipe ingest workflow stub.
* Storyboard generation workflow stub.
* Segment generation workflow.
* Task polling workflow.
* Output persistence workflow.
* Mux upload workflow.
* Concurrency control.
* Global pause support if feasible.

### Out of Scope

* UI implementation.
* Prompt design beyond calling existing services.
* Remotion rendering.

### Acceptance Criteria

* Workflow can be triggered from an API route.
* Long-running tasks do not depend on Vercel request duration.
* Task status is persisted before and after each major step.
* Failed tasks become visible in DB state.
* Concurrency is configurable.

### Test / Demo

Trigger a mocked segment generation workflow and verify state transitions in Supabase.

---

## Issue 10 — Implement Video Project Library Dashboard

Labels: `priority:p0`, `area:ui`, `area:ux`, `agent-ready`

Suggested branch: `agent/project-library-ui`

### Goal

Build the dashboard and project library UI using shadcn/ui.

### Scope

* Dashboard route.
* KPI cards.
* Project grid.
* Active generation queue summary.
* Filters and sorting.
* Empty state.
* Mobile responsive layout.

### Out of Scope

* Actual generation workflow.
* Prompt engine.
* Remotion assembly.

### Acceptance Criteria

* Dashboard shows seeded projects.
* Project cards show title, thumbnail, status, progress, active tasks, cost, and last update.
* Empty state exists.
* Mobile layout is usable.
* User can open a project.

### Test / Demo

Seed 3 projects with different statuses and verify dashboard display.

---

## Issue 11 — Implement New Video Wizard and Recipe Input

Labels: `priority:p0`, `area:ui`, `area:db`, `agent-ready`

Suggested branch: `agent/new-video-wizard`

### Goal

Implement the create video flow with URL, photo upload, pasted text, demo recipe, and model defaults.

### Scope

* `/videos/new` route.
* URL input.
* Photo upload UI.
* Pasted text input.
* Demo recipe selector.
* Model dropdowns.
* Create draft video project.

### Out of Scope

* Actual recipe extraction if not yet available.
* Runway generation.
* Mux upload.

### Acceptance Criteria

* User can create a draft video from at least one source type.
* Selected models are stored on the project.
* Source recipe files are stored in Supabase Storage if uploaded.
* User is redirected to the project overview after creation.

### Test / Demo

Create a draft video from pasted recipe text and verify it appears in the dashboard.

---

## Issue 12 — Implement Storyboard and Seedance Segmentation UI

Labels: `priority:p0`, `area:ui`, `area:openai`, `area:ux`, `agent-ready`

Suggested branch: `agent/storyboard-ui`

### Goal

Build the storyboard review screen with logical scenes and Seedance segments.

### Scope

* Storyboard tab/page.
* Logical scene table.
* Seedance segment card view.
* Approve storyboard action.
* Ask agent to revise action.
* Optional TTS pitch button placeholder.

### Out of Scope

* Actual TTS generation unless already implemented.
* Segment generation execution.

### Acceptance Criteria

* User can view logical scenes and Seedance segments separately.
* User can approve storyboard.
* User can request revision.
* No generation launch button is enabled before approval.

### Test / Demo

Load fixture storyboard and approve it.

---

## Issue 13 — Implement Reference Asset Review Workflow

Labels: `priority:p0`, `area:ui`, `area:runway`, `area:storage`, `agent-ready`

Suggested branch: `agent/reference-workflow`

### Goal

Build the UI and service flow for global and recipe-specific reference assets.

### Scope

* References tab/page.
* Reference asset cards.
* Approve/reject/regenerate actions.
* Manual upload action.
* Store approved references in Supabase Storage.
* Track Runway upload URI.

### Out of Scope

* Full image generation if Runway client is not ready.
* Segment generation.

### Acceptance Criteria

* User can see global and project references.
* User can approve a reference.
* User can upload a manual reference.
* Reference status updates persist.
* Segment readiness can detect missing references.

### Test / Demo

Upload and approve a manual reference image for a demo project.

---

## Issue 14 — Implement Segment Review, Variants, and Mux Playback

Labels: `priority:p0`, `area:ui`, `area:mux`, `area:ux`, `demo-critical`, `agent-ready`

Suggested branch: `agent/segment-review-ui`

### Goal

Implement the core segment review screen with variants, playback, prompt, references, model controls, and accept/reject actions.

### Scope

* Segment detail route.
* Variant list.
* MuxPlayer integration.
* Prompt panel.
* References panel.
* Model selector for regeneration.
* Accept/reject/regenerate actions.

### Out of Scope

* Agent feedback chat.
* Prompt diff generation.
* Remotion assembly.

### Acceptance Criteria

* User can view variants for a segment.
* User can play a variant through MuxPlayer.
* User can select accepted variant.
* User can reject a variant.
* User can trigger regeneration request.

### Test / Demo

Use seeded Mux playback IDs and verify review flow.

---

## Issue 15 — Implement Agent Chat and Prompt Diff Workflow

Labels: `priority:p0`, `area:openai`, `area:ui`, `area:ux`, `demo-critical`, `agent-ready`

Suggested branch: `agent/agent-chat-diff`

### Goal

Implement the feedback loop where the user gives natural-language feedback, the agent edits the prompt, and the user approves a diff before regeneration.

### Scope

* Segment-contextual chat panel.
* Feedback submission.
* OpenAI prompt edit call.
* Diff viewer.
* Apply and regenerate action.
* Store feedback in `scene_feedbacks`.

### Out of Scope

* Full RAG memory.
* Automatic skill rewriting.
* UI outside segment review.

### Acceptance Criteria

* User can submit feedback for a segment.
* Agent returns a revised prompt.
* Diff is displayed.
* User can approve or reject the diff.
* Approved diff updates the segment prompt.
* Feedback is stored in Supabase.

### Test / Demo

Use a sample prompt and feedback message, then verify the displayed diff and stored row.

---

## Issue 16 — Implement Cost Logging and Budget Dashboard

Labels: `priority:p0`, `area:db`, `area:ui`, `area:workflow`, `agent-ready`

Suggested branch: `agent/cost-dashboard`

### Goal

Implement cost logging and visibility for Runway, OpenAI, and Mux usage.

### Scope

* `cost_logs` helper.
* Project-level cost summary.
* Global cost dashboard.
* Budget threshold warnings.
* Cost by provider/model/segment.

### Out of Scope

* Exact provider billing reconciliation if API does not expose exact cost.
* Payment integrations.

### Acceptance Criteria

* Cost log entries can be created.
* Dashboard shows project cost and global cost.
* Warnings appear at 20% and 10% remaining Runway credits.
* User can see rejected/failed generation spend separately if data exists.

### Test / Demo

Seed cost logs and verify dashboard aggregation.

---

## Issue 17 — Implement Suno Prompt and Audio Upload Workflow

Labels: `priority:p1`, `area:remotion`, `area:ui`, `agent-ready`

Suggested branch: `agent/suno-workflow`

### Goal

Implement the manual Suno workflow: generate a prompt, copy it, upload the resulting audio, and store it for assembly.

### Scope

* Suno prompt generation UI.
* Copy prompt action.
* Audio upload UI.
* Store Suno audio in Supabase Storage.
* Link audio to video project.

### Out of Scope

* Suno API automation.
* Music generation inside the app.

### Acceptance Criteria

* User can generate a Suno prompt.
* User can copy the prompt.
* User can upload audio.
* Uploaded audio is stored and linked to the project.

### Test / Demo

Upload a sample MP3 and verify it appears in the assembly screen.

---

## Issue 18 — Implement Remotion Assembly Preview and Export

Labels: `priority:p1`, `area:remotion`, `area:ui`, `agent-ready`

Suggested branch: `agent/remotion-assembly`

### Goal

Implement final assembly preview using Remotion, selected segment originals from Supabase Storage, and optional Suno audio.

### Scope

* Remotion composition.
* Remotion Player on assembly screen.
* Segment ordering with dnd-kit.
* Audio offset and fade controls.
* Client-side export if feasible.
* Store final MP4 in Supabase Storage.
* Upload final MP4 to Mux.

### Out of Scope

* Full professional editing timeline.
* Complex transitions.
* Server-side Remotion infrastructure unless needed as fallback.

### Acceptance Criteria

* User can preview accepted segments in order.
* User can reorder segments.
* User can include uploaded Suno audio.
* User can adjust basic audio sync values.
* Export path stores final file in Supabase Storage.
* Final export can be played through Mux.

### Test / Demo

Use 2-3 short sample clips and one audio file to create a preview and export.

---

## Issue 19 — Implement Demo Mode and Fixture Project

Labels: `priority:p0`, `area:demo`, `demo-critical`, `agent-ready`

Suggested branch: `agent/demo-fixtures`

### Goal

Create a reliable demo mode so the hackathon presentation does not depend entirely on live model generation timing.

### Scope

* Demo project fixture.
* Fixture storyboard.
* Fixture Seedance segments.
* Fixture references.
* Fixture generations with playable sample clips.
* Fixture cost logs.
* Fixture prompt diff example.

### Out of Scope

* Fake claims that demo fixtures were live-generated.
* Hiding real app flow.

### Acceptance Criteria

* Demo Mode can be opened from sidebar.
* Demo project shows storyboard, references, segment review, prompt diff, costs, and assembly preview.
* Demo works without active Runway generation.

### Test / Demo

Open Demo Mode and walk through the full product story in under 5 minutes.

---

## Issue 20 — Integration QA and End-to-End Hackathon Runbook

Labels: `priority:p0`, `area:demo`, `demo-critical`, `needs-human-review`

Suggested branch: `agent/integration-qa`

### Goal

Perform final integration, fix cross-branch inconsistencies, and create the demo runbook.

### Scope

* End-to-end QA.
* Verify auth.
* Verify dashboard.
* Verify project creation.
* Verify storyboard flow.
* Verify generation or fixture fallback.
* Verify Mux playback.
* Verify Supabase Storage source files.
* Verify prompt diff.
* Verify costs.
* Verify assembly preview.
* Create demo script.

### Out of Scope

* Major new features.
* Redesign.
* Large refactors.

### Acceptance Criteria

* App can be demoed end-to-end.
* Demo runbook exists.
* Known limitations are documented.
* No costly action is available without auth.
* Final demo path works before Monday morning.

### Test / Demo

Run through the demo script and record any blockers.

---

## Suggested Creation Order

1. Issue 01
2. Issue 02
3. Issue 03
4. Issue 04
5. Issue 06
6. Issue 09
7. Issue 10
8. Issue 11
9. Issue 07
10. Issue 08
11. Issue 12
12. Issue 13
13. Issue 05
14. Issue 14
15. Issue 15
16. Issue 16
17. Issue 17
18. Issue 18
19. Issue 19
20. Issue 20

Parallelizable after Issues 01-04:

* Issue 06
* Issue 07
* Issue 09
* Issue 10
* Issue 11

Parallelizable after generation/storage basics:

* Issue 13
* Issue 14
* Issue 15
* Issue 16
* Issue 17
* Issue 18

---

## Monday Demo Acceptance Checklist

The final demo should prove:

* Auth works and unauthorized users are blocked.
* A video project can be created from a recipe source.
* The agent can generate or load a storyboard.
* Logical scenes and Seedance segments are clearly distinguished.
* A segment can be reviewed with video playback.
* User feedback can create a prompt diff.
* A regeneration can be triggered or simulated.
* Costs are visible.
* Accepted segments can be previewed in assembly.
* Final output or near-final output can be shown.