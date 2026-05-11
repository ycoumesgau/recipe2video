# Recipe2Video — Demo Runbook

### Purpose

This runbook is the operating guide for recording the Runway API Hackathon demo video. It is not meant to replace the product. It helps Yoann record a clear, concise, judge-friendly demo that shows Recipe2Video as a real internal production tool for Licorn.

The demo video will be recorded manually by Yoann, potentially edited in CapCut or another video editor. The app should provide the product screens, assets, clips, and reliable demo states needed for that recording.

---

## Demo Goal

Show that Recipe2Video is a real agentic production workflow for turning food recipes into short vertical cooking videos using Runway API orchestration.

The demo should communicate four points quickly:

* Recipe2Video solves a real Licorn marketing workflow.
* Runway API is central to the product, not a superficial add-on.
* The system coordinates expensive media generation through checkpoints, references, variants, cost tracking, and feedback loops.
* The product is usable beyond the hackathon as an internal production tool.

---

## Local Setup and Verification

Run these steps before recording or rehearsing the demo. They are written so a fresh internal Licorn collaborator can reproduce a working demo path locally.

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```txt
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
RUNWAYML_API_SECRET=
OPENAI_API_KEY=
OPENAI_PLANNING_MODEL=
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=
APP_BASE_URL=http://localhost:3000
CURSOR_API_KEY=
CURSOR_AGENT_REPO_URL=
CURSOR_AGENT_STARTING_REF=main
CURSOR_AGENT_MODEL=gpt-5.5
CURSOR_AGENT_MODEL_THINKING=high
CURSOR_AGENT_RUNTIME=cloud
```

`OPENAI_PLANNING_MODEL` must be the exact API identifier for GPT-5.5 High on the account. Recipe2Video does not silently fall back to a different model if this variable is missing or invalid.

For a demo without live Cursor agent interaction, the `CURSOR_*` variables are optional. The Paris-Brest fixture path works without them.

For an offline-only demo, only `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY` are strictly required. `/demo` runs entirely against the Paris-Brest public-safe fixture.

### 3. Apply Supabase migrations

Run the migrations under `supabase/migrations/` against the hackathon Supabase project, in chronological order:

* `20260508192500_auth_allowlist.sql`
* `20260508195300_create_core_schema.sql`
* `20260508195500_new_video_wizard_core.sql`

Then insert the demo email into the allowlist:

```sql
insert into allowed_users (email, role) values ('demo@licorn.example', 'admin');
```

### 4. Verify code health

```bash
npm run lint
npm run build
npm test
```

All three commands must succeed before you record a demo. The integration QA pass (Issue #20) confirmed all three are green at the time the runbook was last updated.

### 5. Start the app

```bash
npm run dev
```

Open `http://localhost:3000`. You will be redirected to `/login` if you are not authenticated. Use Magic Link with the allowlisted email.

### 6. Smoke test the demo path

In this order:

* `/login` → request magic link → confirm authenticated session lands on `/`.
* `/` → confirm dashboard shows seeded projects, active queue, and budget warning state.
* `/demo` → confirm Paris-Brest fixture renders storyboard, references, segments, prompt diff, costs, and assembly preview.
* `/active-generations` → confirm the read-only cross-project queue renders.
* `/videos/new` → confirm the wizard accepts a recipe source and creates a draft video.
* `/videos/[videoId]/storyboard` → confirm the storyboard tab loads and the Paris-Brest fixture button works.
* `/videos/[videoId]/segments/[segmentId]` → confirm the segment review screen loads (use a seeded segment from a real project).
* `/videos/[videoId]/assembly` → confirm Suno + Remotion preview screens load.
* Verify Recipe Agent panel shows on project overview with agent status indicator.

If any of these screens 404 or show an unhandled error, fix it before recording.

---

## Target Demo Length

Recommended length: 2 to 3 minutes.

Absolute maximum: 4 minutes.

If time is short, prioritize clarity over completeness.

---

## Narrative Arc

### Opening message

Suggested voiceover:

```txt
Recipe2Video is an internal Licorn production tool that turns recipes into short vertical cooking videos using Runway’s API. It is designed for a real marketing workflow: producing social videos with our mascot while controlling creative quality, API cost, and iteration speed.
```

### Core demo story

The demo should follow this flow:

1. Start from a recipe.
2. Generate a storyboard.
3. Compress the storyboard into Seedance segments.
4. Validate references.
5. Generate or review a Runway segment.
6. Give feedback to the agent.
7. Show a prompt diff.
8. Show cost tracking.
9. Show final assembly preview.
10. Close with business impact.

### Closing message

Suggested voiceover:

```txt
The result is not just a video generation script. It is a production cockpit for repeatable, cost-aware, agent-assisted media creation. For Licorn, this means moving from manual one-off experiments to a scalable weekly video workflow.
```

---

## Before Recording Checklist

Complete these before recording the final demo.

### App readiness

* App is deployed and accessible.
* Auth works or an authenticated session is already open.
* Dashboard loads quickly.
* No visible console errors on key pages.
* Demo Mode works.
* At least one project has complete or fixture data.

### Demo project readiness

Use Paris-Brest if available.

Required demo data:

* Recipe data is present.
* Logical storyboard is present.
* Seedance segments are present.
* References are present.
* At least one segment has a playable video.
* At least one segment has multiple variants or simulated variants.
* At least one prompt feedback and diff example exists.
* Cost logs exist.
* Assembly preview works or fixture final video exists.

### Media readiness

* At least one Mux playback works.
* Supabase Storage original file exists for the demo clip.
* Optional Suno audio file is uploaded.
* Optional final preview/export is available.

### Budget readiness

* Credit state is visible.
* Cost dashboard has data.
* No unexpected live generation will run during recording unless intended.

---

## Recommended Recording Sequence

### Scene 1 — Dashboard

Goal: show this is a production cockpit, not a toy.

Show:

* project library
* active generation queue
* cost cards
* project statuses

Voiceover:

```txt
This is the Recipe2Video dashboard. It lets us manage multiple recipe video projects in parallel, see active generations, monitor costs, and jump directly to the next required action.
```

Do not spend time on login unless auth is part of the story.

---

### Scene 2 — Create or open a recipe project

Goal: show the input flow.

Show either:

* creating a new project from a recipe source, or
* opening the Paris-Brest demo project.

Voiceover:

```txt
A project can start from a recipe URL, uploaded photos, pasted text, or a prepared demo fixture. The app stores the recipe, selected models, and production settings immediately so work is never lost.
```

If live recipe ingest is slow, use the prepared project.

---

### Scene 2b — Recipe Agent Analysis

Goal: show the persistent Cursor SDK agent analyzing a recipe.

Show:

* Recipe Agent panel on the project overview
* Agent status changing from idle to running
* Agent producing artifacts (recipe-analysis.json, decisions.md)
* Artifacts being validated and synced to the project

Voiceover:

```txt
When a project is created, Recipe2Video provisions a persistent Cursor SDK agent dedicated to this recipe. The agent analyzes the recipe, identifies visual complexity, and produces structured planning artifacts. These artifacts are validated and synced back into the project state.
```

If live agent is slow, skip to the fixture storyboard and mention the agent workflow.

---

### Scene 3 — Storyboard and Seedance segmentation

Goal: show the product’s intelligence.

Show:

* logical scenes view
* Seedance segments view
* mapping between logical scenes and generation segments

Voiceover:

```txt
The agent first creates a logical storyboard, then compresses it into fewer Seedance segments. This preserves the creative structure while reducing the number of expensive video generations.
```

Critical point to communicate:

* 30-48 logical scenes are not 30-48 generated videos.
* They become around 5-10 Seedance multi-shot segments.

---

### Scene 4 — References

Goal: show quality control before generation.

Show:

* global references
* recipe-specific references
* approved / missing states

Voiceover:

```txt
Before spending credits, Recipe2Video identifies the references Seedance needs: kitchen, character, utensils, and recipe-specific states like baked, filled, glazed, or cut versions.
```

If possible, show a complex Paris-Brest reference state.

---

### Scene 5 — Segment generation and playback

Goal: show Runway-generated media in the app.

Show:

* segment review screen
* MuxPlayer playback
* prompt panel
* references panel
* generation metadata

Voiceover:

```txt
Each segment is generated through the Runway API and then persisted. The original file is stored in Supabase Storage, and a playback copy is uploaded to Mux for fast review.
```

If live generation is not available, show fixture playback and state that this is the review workflow.

---

### Scene 6 — Feedback and prompt diff

Goal: show the agent loop.

Show:

* user feedback message
* agent response
* prompt diff
* apply and regenerate button

Example feedback:

```txt
The caramel should crack into brittle shards, not bend like a soft sheet. The rolling pin should be held vertically with both hands.
```

Voiceover:

```txt
When a generation is wrong, I do not manually rewrite the prompt. I explain the issue to the agent, review the proposed diff, and only then regenerate the segment.
```

This is one of the most important parts of the demo.

---

### Scene 7 — Cost dashboard

Goal: show operational control.

Show:

* Runway credits used
* cost by model
* cost by segment
* failed/rejected spend
* budget threshold indicators

Voiceover:

```txt
Because video generation is expensive, every Runway and OpenAI call is logged. Recipe2Video tracks costs by project, segment, model, and provider.
```

---

### Scene 8 — Suno and Remotion assembly

Goal: show final production path.

Show:

* Suno prompt
* uploaded audio if available
* Remotion preview
* selected segments in order

Voiceover:

```txt
Music is currently generated manually in Suno. Recipe2Video generates the prompt, accepts the uploaded audio, and uses Remotion to preview the final sequence with music alignment.
```

If Remotion export is not working, show preview only.

---

### Scene 9 — Final output or near-final preview

Goal: close with tangible output.

Show:

* final preview
* generated clip montage
* selected segment outputs
* if needed, a CapCut-assembled final video using generated assets

Voiceover:

```txt
The output can be downloaded and reused for Licorn’s social channels. The workflow is designed to support two videos per week from end of May 2026, plus one Suno music single per week for streaming platforms, all in support of the Licorn waitlist and cooking forum launch. Batch generation during the hackathon weekend serves as the stress test.
```

---

## QA Verification Matrix

This matrix maps the Issue #20 acceptance checklist to the actual implementation state and the screens that must work for the demo. It is the deliverable for the integration QA pass.

| Capability | Status | Where to verify | Notes |
| --- | --- | --- | --- |
| Magic Link auth | Implemented | `/login` + `modules/auth/auth.actions.ts` | Allowlist enforced server-side. `getCurrentProfile` redirects unauthorized users to `/auth/sign-out?status=unauthorized`. |
| Allowlist guard on costly actions | Implemented | `assertCostlyActionAllowed` used in `generation`, `feedback`, `assembly`, `references`, `media-assets`, `videos`, `storyboard`, and `app/api/workflows/segments/generate/route.ts` | No costly action runs without an authenticated allowlisted user. |
| Dashboard library | Implemented | `/` + `modules/videos/ui/video-library-dashboard.tsx` | Seeded fixture + persisted projects merged. KPIs, active queue, recently updated, and budget warnings render. |
| Active generations cross-project view | Read-only stub | `/active-generations` | Reuses dashboard queue data. Per-task retry/cancel actions stay inside each project segment review. |
| Settings | Read-only stub | `/settings` | Shows authenticated profile and default models. Server secrets remain in environment variables. |
| New video wizard | Implemented | `/videos/new` | Accepts URL, photos, pasted text, demo recipe, and selectable models. Draft is created immediately. |
| Recipe ingest (live) | Deferred | `modules/recipe-ingest/ingest-recipe.ts` | Wizard creates a draft and stores source files. Live OpenAI extraction is not wired in this milestone. |
| Storyboard logical scenes | Implemented | `/videos/[videoId]/storyboard` | Paris-Brest fixture loadable from the storyboard actions. |
| Storyboard Seedance segments | Implemented | Same screen | Logical scene to segment mapping is preserved. |
| Storyboard live revision via OpenAI | Partial | `requestStoryboardRevisionAction` captures the revision request without spending OpenAI credits in this branch. The planning client is unit-tested separately. |
| References review | Implemented | `/videos/[videoId]/references` | Approve, reject, regenerate, manual upload, and Runway upload actions persist through `manage-reference-review`. |
| Reference image generation | Wired | `modules/references/use-cases/manage-reference-review.ts` | Requires `RUNWAYML_API_SECRET`. |
| Segment generation workflow | Implemented | `inngest/functions/segment-generation.ts` + `orchestrate-segment-generation.ts` | `assertSeedance2Selected` enforces the no-silent-fallback rule. Tested in `orchestrate-segment-generation.test.ts`. |
| Runway output persistence | Implemented | `modules/media-assets/use-cases/persist-media-asset.ts` | Originals stored in Supabase Storage before any Mux upload. |
| Mux playback | Implemented | `modules/media-assets/services/mux.service.ts` + `RecipeMuxPlayer` | Fallback message when no playback ID is available. |
| Segment review UI | Implemented | `/videos/[videoId]/segments/[segmentId]` | Variants, prompt, references, model selector, accept/reject/regenerate actions. |
| Prompt feedback and diff | Implemented | `modules/feedback/actions.ts` + `prompt-diff-viewer.tsx` | OpenAI prompt diff generation, persisted in `scene_feedbacks`, requires explicit approval. |
| Cost tracking | Implemented | `modules/costs/*` + `/costs` and `/videos/[videoId]/costs` | Aggregations by provider, model, segment, plus 20% / 10% Runway warnings. |
| Suno prompt | Implemented | `modules/assembly/suno-prompt.ts` + `/videos/[videoId]/assembly` | Copy-ready prompt, no unsupported Suno API call. |
| Suno audio upload | Implemented | `modules/assembly/use-cases/upload-suno-audio.ts` | Stored as `suno_audio` media asset in Supabase Storage. |
| Remotion preview | Implemented | `remotion/compositions/recipe-assembly.tsx` + `assembly-workspace.tsx` | Uses Supabase originals; no Mux HLS dependency for assembly. |
| Final export persistence | Implemented | `uploadFinalExportAction` | Final MP4 stored in Supabase Storage, then uploaded to Mux for playback. |
| Demo Mode fixture | Implemented | `/demo` | Paris-Brest public-safe fixture with storyboard, references, segments, prompt diff, costs, and assembly preview. |
| In-repo Runway skills | Tracked | `.cursor/skills/use-runway-api/SKILL.md` and companion `rw-*` skills | Cursor agents use these as the authoritative low-level reference. |
| Recipe Agent lifecycle | Implemented | Project overview + `modules/recipe-agent/*` | Create, resume, send message, validate artifacts, sync to Supabase. Agent panel shows status. |

### Confirmed during the QA pass

* `npm run lint` passes with 0 errors and 0 warnings.
* `npm run build` succeeds and emits every route listed in the smoke test above.
* `npm test` passes 12 of 12 unit tests covering planning, generation orchestration, and cost aggregation.
* The sidebar links `/active-generations` and `/settings` no longer 404.

---

## Demo Fallback Plan

### If Magic Link is slow

Use an already authenticated browser session.

Do not spend demo time waiting for email.

### If Runway generation is slow

Use the fixture project with preloaded segment outputs.

Say:

```txt
For demo speed, I am showing a previously generated segment inside the same review workflow.
```

### If Seedance 2 API is unavailable

Show:

* model selector
* Seedance segment prompt preparation
* fixture video playback
* explain that the app supports manual model switching but does not silently fallback.

Do not pretend another model is Seedance.

### If Mux upload fails

Show Supabase-stored original file playback if implemented, or use fixture clips.

Explain:

```txt
The durable original file is stored separately from the playback layer, so the system can recover from playback-provider issues.
```

### If Remotion export fails

Show Remotion Player preview only.

Say:

```txt
The preview is the core workflow. Export can be performed client-side or through a render worker after the hackathon.
```

### If cost dashboard has no live costs

Use seeded cost logs.

Do not fake provider-specific exact billing. Call it estimated cost tracking if needed.

---

## Known Limitations and Honest Roadmap

Document these for judges. They are framed as roadmap items, not failures, in line with `docs/agent-workflow.md`.

### Live API integrations that require explicit configuration

* `seedance2` availability is not yet listed on the public Runway Models page. Recipe2Video assumes it works, surfaces failures explicitly, and never silently switches model. The wizard currently exposes only `seedance2` because it is the single video endpoint wired through the Inngest workflow. If Runway confirms another model at the hackathon kickoff, add it back to `VIDEO_MODEL_OPTIONS` in `modules/videos/video.constants.ts` AND extend `assertSeedance2Selected` (or the equivalent guard) so the workflow accepts it. There is no automatic fallback.
* OpenAI GPT-5.5 High planning, prompt diff generation, and segment compression require `OPENAI_API_KEY` and `OPENAI_PLANNING_MODEL` set on the server.
* Runway, Mux, and Supabase secrets must be set for the full live pipeline. The demo fixture path under `/demo` is fully functional without them.
* Inngest workflows require `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` for production. Local development uses the Inngest dev server.

### Workflows that are deferred or partial

* Recipe ingestion does not yet call the live OpenAI extraction. The wizard creates a draft and stores recipe sources; structured recipe data is filled in by future work.
* `Ask agent to revise` on the storyboard captures the revision request in the UI but does not yet call OpenAI from this milestone. Use the Paris-Brest fixture for the demo storyboard story.
* TTS storyboard pitch (P1) is not implemented. The button is intentionally hidden.
* Embedding-based RAG retrieval over feedback (P1) is not implemented. The `scene_feedbacks.embedding` column is nullable and reserved for the post-hackathon iteration.
* Server-side Remotion render (Vercel Sandbox backup) is not implemented. The current export path is client-side; if rendering fails, fall back to demonstrating the Remotion preview only.
* `/active-generations` and `/settings` are read-only stubs at the time of the QA pass. Per-task retry, cancel, global pause, and writable settings live inside their parent flows.
* The Cursor SDK recipe agent requires `CURSOR_API_KEY` and `CURSOR_AGENT_REPO_URL` for live operation. Without these, the agent panel shows "not configured" and the fixture path should be used.
* Agent artifact sync is one-way (agent -> app). The agent does not read back from Supabase after sync.

### Architectural reminders for the demo

* Supabase Storage is the durable source of truth for original media. Mux is playback only. If Mux upload fails, the original file is still recoverable.
* Runway output URLs are temporary. Successful generations are downloaded immediately into Supabase Storage before being uploaded to Mux.
* Authentication is internal-only. Public self-serve signup is not exposed and never should be re-enabled in this product.
* `media_assets` is the canonical metadata layer for source uploads, references, Runway outputs, accepted clips, Suno audio, and final exports.

### Post-hackathon work that should land first

This list mirrors **Phase 5** of `audit_critique_recipe2video_05cb7661.plan` and what the post-hackathon team should pick up next:

* **TTS storyboard pitch.** The PRD lists "Optionally generate an audio pitch of the storyboard through Runway's ElevenLabs TTS model" as part of the storyboard tab. The button is intentionally hidden today and the workflow is not wired.
* **Trim-lite per segment in assembly.** PRD Functional Requirements ("Trim-lite: Allow simple start/end selection for variants when feasible"). The current `AssemblySegmentClip` model has no `trimStart`/`trimEnd`; the Remotion composition uses the full duration of each clip.
* **Server-side Remotion render.** `uploadFinalExportAction` accepts a user-uploaded MP4 today. A Phase 5 task is to wire either `@remotion/renderer` or a Vercel Sandbox worker to render the final master server-side, then store it in Supabase Storage and Mux as the contract requires.
* **Embedding-backed RAG memory.** `scene_feedbacks.embedding` is reserved as `vector(1536)` but no embedding pipeline runs yet. Phase 5 adds an ingest step that embeds each applied feedback and a retrieval helper that surfaces relevant prior diffs when the agent generates a new prompt.
* **PostHog tracking plan.** PRD lists 30+ events (`auth_magic_link_requested`, `seedance_segment_generation_succeeded`, `cost_logged`, `budget_threshold_reached`, ...). None are emitted today. Phase 5 should pick the smallest-meaningful subset (auth, segment generation lifecycle, cost log, budget threshold) and instrument them through `@posthog/node`.
* **`composition.render.requested` event.** Removed from `inngest/events.ts` because nothing handled it. Reintroduce when the server-side Remotion render is wired so the assembly screen can fire the event instead of waiting on a manual upload.
* **`/mux-test` route gating.** The route stays useful for verifying Mux ingest end-to-end, but should be hidden behind `process.env.NODE_ENV === "development"` (or a feature flag) before any public demo deploys it.
* **Live recipe ingestion via vision when only photos are uploaded.** Today the wizard passes filenames as `photoDescriptions`. A Phase 5 task downloads each photo from Supabase Storage, sends them to GPT-5.5 vision, and persists the recipe normalized output.
* **Project-scoped collaboration metadata.** When more than two internal users are active, surface `last actor` and a soft lock to avoid two users editing the same draft at the same time.
* **Two-way agent context.** Currently the recipe agent does not receive the latest Supabase state before each message. A Phase 5 task is to inject current recipe_data, storyboard summary, and reference status into the agent message context so the agent can make decisions based on the latest approved state.

---

## Assets to Prepare Before Monday Morning

Minimum assets:

* one complete Paris-Brest project fixture
* one playable segment video
* one prompt diff example
* one cost dashboard with data
* one reference image screen
* one assembly preview

Nice-to-have assets:

* two or three generated segment variants
* one uploaded Suno audio file
* one final assembled MP4
* one screen recording of live generation status changing

---

## Suggested Demo Script

```txt
Recipe2Video is an internal production tool for Licorn, built for the Runway API Hackathon.

```

`Our marketing workflow needs short vertical cooking videos featuring our mascot, but generating them manually is slow and expensive. Every recipe needs planning, references, model-specific prompts, review, regeneration, music, and final assembly.`

`Recipe2Video turns that into an agentic workflow.`

`I start from a recipe. The agent analyzes it, asks only the questions that matter, and creates a storyboard. The important part is that the storyboard is not one generation per scene. It creates 30 to 48 logical scenes for creative structure, then compresses them into a smaller number of Seedance segments.`

`Before spending credits, the app identifies the required references: kitchen, character, utensils, and recipe-specific food states.`

`Then the generation runs through Runway. Outputs are persisted to Supabase Storage as originals, and uploaded to Mux for review playback.`

`If a segment is wrong, I give feedback in natural language. The agent rewrites the prompt, shows me the diff, and only then do I regenerate.`

`The app also tracks cost across Runway and OpenAI, so I know what each project and segment costs.`

`Finally, I can import music generated manually in Suno and preview the final assembly in Remotion.`

`The result is a real internal production cockpit for Licorn, not a one-off generation demo. It lets us move toward repeatable weekly video production using Runway’s API.`  

---

## What Not to Show

Avoid spending time on:

* raw database schema
* long code walkthroughs
* waiting for a live task to finish
* full login flow unless very fast
* every single GitHub issue
* irrelevant settings
* old first-frame / last-frame workflow
* Kling references
* Linear or internal Licorn roadmap

---

## Final Submission Checklist

Before submitting:

* Demo video recorded.
* Demo video under acceptable length.
* Public repo contains README and docs.
* No secrets committed.
* App link works.
* If app requires login, provide judge-safe instructions if needed.
* README explains why the product is useful and how it uses Runway.
* PRD and contracts are available in repo.
* Known limitations are honest and framed as roadmap, not failures.

---

## Judge-Facing Value Points

Emphasize:

* Real internal Licorn marketing use case.
* Agentic orchestration, not single API call.
* Seedance segment planning with references.
* Cost-aware generation.
* Human checkpointing before expensive steps.
* Prompt diff feedback loop.
* Durable storage and playback pipeline.
* Batch production potential.

---

## Demo Success Standard

The demo is successful if a judge can understand within 3 minutes:

* what problem Recipe2Video solves;
* why Runway API is central;
* how the agent workflow works;
* how the user controls quality and cost;
* why this can become a real production tool for Licorn.