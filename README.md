# Recipe2Video

Recipe2Video is an internal Licorn production tool built for the Runway API Hackathon. It turns a food recipe into an agent-driven workflow for producing short vertical cooking videos featuring the Licorn mascot. The creative planning engine is a persistent per-recipe Cursor SDK agent (`@cursor/sdk`), while the Runway API handles all video generation.

The product is designed for a real operational use case at Licorn: generating high-quality cooking videos for TikTok, YouTube Shorts, and Instagram while controlling creative quality, generation cost, iteration loops, media storage, and final assembly.

## Why it matters

Producing AI-generated cooking videos is expensive and operationally fragile. A single recipe video can require:

* recipe analysis and creative direction
* storyboard planning
* visual reference selection
* model-specific prompt writing
* Seedance video generations
* review and regeneration of weak outputs
* music generation through Suno
* final video assembly
* cost tracking across multiple APIs
* durable storage of generated assets

Without a dedicated workflow, this process is slow, manual, and hard to scale. Recipe2Video turns it into a repeatable production cockpit with agentic planning, user checkpoints, prompt diffs, background generation, and persistent project state.

## What it does

Recipe2Video supports the following workflow:

1. Ingest a recipe from a URL, uploaded photos, pasted text, or demo fixture.
2. Extract structured recipe data and identify visual complexity.
3. A persistent Cursor SDK recipe agent analyzes the recipe and generates a logical storyboard with 30-48 editorial scenes.
4. The agent compresses the storyboard into approximately 5-10 Seedance 2.0 generation segments.
5. Select global and recipe-specific reference images.
6. Generate missing reference images when needed.
7. Launch Seedance segment generation through the Runway API.
8. Persist generated media to Supabase Storage as the durable source of truth.
9. Upload playable versions to Mux for review and streaming.
10. Review generated variants per segment.
11. Give natural-language feedback to the agent when a generation is wrong.
12. Review prompt diffs before regenerating.
13. Track costs by project, segment, provider, and model.
14. Generate a Suno prompt for music, then upload the manually generated audio file.
15. Preview the final assembly with Remotion.
16. Export the final MP4 and preserve it as a durable asset.

## Hackathon scope

Recipe2Video is not a generic demo wrapper around a video model. It is a production workflow tool built for a real internal use case at Licorn: generating short, high-quality cooking videos for social channels from recipes, while controlling creative quality, generation cost, and iteration loops.

The hackathon milestone focuses on the highest-value end-to-end workflow: recipe input, agent storyboard, Seedance 2.0 segment planning, Runway generation, durable media persistence, Mux playback, feedback-driven prompt iteration, cost tracking, and final assembly preview.

The first milestone is an end-to-end usable product for Licorn’s own marketing workflow, with a clear path to post-hackathon production use.

## Core product principles

* Internal production tool, not a public creator platform.
* Seedance-first workflow for video generation.
* Human checkpoints before expensive generation steps.
* No silent model fallback.
* Every async task must have visible status.
* Every costly API call must be logged.
* Supabase Storage is the durable media source of truth.
* Mux is the playback, streaming, and thumbnail layer.
* User feedback modifies prompts through visible diffs.
* The system should learn from correction history over time.
* Persistent per-recipe Cursor SDK agent as the creative planning engine.
* Agent artifacts are validated before synchronization into canonical project state.

## Tech stack

* Next.js App Router
* TypeScript
* shadcn/ui
* dnd-kit
* Supabase Auth Magic Link
* Supabase Postgres
* Supabase Storage
* pgvector for future feedback retrieval
* Inngest
* Cursor TypeScript SDK (`@cursor/sdk`) for persistent recipe agents
* `recipe2video-agent-workspace` — dedicated agent workspace repository
* Runway API (`@runwayml/sdk`)
* OpenAI GPT-5.5 High (fallback/narrow utilities: prompt diffs, feedback interpretation)
* Mux Pay-as-you-go with Basic on-demand video
* Remotion
* Suno manual music workflow
* GitHub Issues for hackathon execution
* Cursor Cloud Agents for parallel implementation

## Runway API references and Cursor skill setup

Recipe2Video is built against the Runway API. Cursor agents working on this repository must have direct access to the Runway API documentation and the official Runway agent skill.

External references:

* API documentation: https://docs.dev.runwayml.com/
* API reference: https://docs.dev.runwayml.com/api
* Models: https://docs.dev.runwayml.com/guides/models/
* Pricing: https://docs.dev.runwayml.com/guides/pricing/
* Skills repository: https://github.com/runwayml/skills
* Node.js SDK: `@runwayml/sdk`
* API key environment variable: `RUNWAYML_API_SECRET`

Local skill setup:

* The official Runway API skills are published under `skills/` in the public `runwayml/skills` repository under the same SKILL.md format as Claude Code skills.
* Recipe2Video stores a mirror at `.cursor/skills/` so that Cursor Cloud Agents can read the skills like any other in-repo context.
* The skill contents must be copied from `runwayml/skills/skills/` (public repo) into `.cursor/skills/` of Recipe2Video, keeping the upstream folder names and SKILL.md files unchanged.
* `.cursor/skills/` must not be added to `.gitignore`. The skill is part of the agent execution context and must be tracked.
* Refresh the local copy when Runway publishes an update to the skill.

This skill copy is not subject to the public-safe fixture extraction rules in `docs/agent-workflow.md` because the source repository (`runwayml/skills`) is itself public and the skill content is intended for distribution.

## Media architecture

Recipe2Video separates durable storage from playback infrastructure.

```txt
Runway output URL
  ↓ downloaded immediately
Supabase Storage
  ↓ durable original media source of truth
Mux
  ↓ playback, thumbnails, review, streaming
Remotion
  ↑ uses Supabase Storage originals for final assembly
  ↓ exports final MP4
Supabase Storage
  ↓ stores final master
Mux
  ↓ final playback
```

Rules:

* Runway output URLs are temporary API artifacts and must not be treated as durable storage.
* Original generated media files must be persisted to Supabase Storage.
* Mux assets are used for playback and review, not as the only archive.
* Final Remotion assembly should use original files from Supabase Storage, not Mux playback streams.

## Cursor SDK Agent Architecture

Recipe2Video uses a two-repository architecture where the main app orchestrates persistent Cursor SDK agents that operate in a separate workspace.

```txt
recipe2video (this repo)
  → creates/resumes Cursor SDK agent per recipe
  → agent clones recipe2video-agent-workspace
  → agent writes artifacts in agent-recipes/{videoId}/
  → app downloads and validates artifacts (Zod)
  → app syncs valid artifacts into Supabase
```

### Contractual artifacts

Each agent produces 7 artifacts in `agent-recipes/{videoId}/`:

| File | Purpose |
|------|---------|
| `recipe-analysis.json` | Structured recipe understanding |
| `decisions.md` | Creative direction and rationale |
| `logical-scenes.json` | 30-48 editorial scenes |
| `seedance-segments.json` | Compressed Seedance generation segments |
| `reference-plan.json` | Reference image requirements |
| `suno-prompt.md` | Music generation prompt |
| `changelog.md` | Agent reasoning log |

### Agent boundaries

The Cursor SDK agent:

* **Can:** read recipe data, reason about creative direction, write artifact files
* **Cannot:** access Runway/Supabase/Mux/Suno credentials
* **Cannot:** create branches, PRs, or commits for everyday recipe work
* **Cannot:** call external APIs directly

### Inngest workflows

* `recipe.agent.create.requested` — spawn a new agent for a recipe
* `recipe.agent.message.requested` — send a follow-up message to an existing agent
* `recipe.agent.sync.requested` — download and validate agent artifacts

### Database tables

* `agent_runs` — tracks agent lifecycle and status
* `agent_artifacts` — stores validated artifact metadata
* Agent columns on `videos` table — links video projects to their agent

### Environment variables (agent)

```txt
CURSOR_API_KEY=
CURSOR_AGENT_REPO_URL=
CURSOR_AGENT_STARTING_REF=main
CURSOR_AGENT_MODEL=gpt-5.5
CURSOR_AGENT_MODEL_THINKING=high
CURSOR_AGENT_RUNTIME=cloud
CURSOR_AGENT_LOCAL_CWD=
```

## Authentication

Recipe2Video is restricted to internal Licorn users.

Authentication approach:

* Supabase Auth Magic Link
* `allowed_users` email allowlist
* no public self-serve signup
* server-side authorization checks before costly actions

Costly actions include:

* Runway generation
* OpenAI calls
* Mux upload
* Remotion export
* background workflows that may trigger any of the above

## Documentation

The repository should include the following documentation files:

* `PRD.md` — product requirements and hackathon scope
* `docs/agent-workflow.md` — how Cursor agents should work in parallel
* `docs/ux-contract.md` — UX screens, states, rules, and component expectations
* `docs/technical-contracts.md` — architecture, types, data model, storage, auth, service contracts, and Cursor SDK agent architecture
* `docs/github-issues-backlog.md` — agent-ready GitHub Issues backlog
* `docs/demo-runbook.md` — demo recording plan and fallback strategy
* `.cursor/skills/use-runway-api/SKILL.md` and companion `rw-*` skills — Runway API agent skills, copied from https://github.com/runwayml/skills/tree/main/skills (kept in repo so Cursor Cloud Agents read them as in-repo context)

## Expected repository structure

```txt
app/
  (auth)/
  (dashboard)/
  api/
components/
  ui/
  layout/
modules/
  auth/
  videos/
  recipe-ingest/
  recipe-agent/
  storyboard/
  references/
  generation/
  media-assets/
  feedback/
  costs/
  assembly/
  demo/
shared/
  config/
  errors/
  utils/
  constants/
  logger/
supabase/
  migrations/
inngest/
  functions/
remotion/
  compositions/
fixtures/
  paris-brest/
.cursor/
  skills/
    use-runway-api/
    rw-api-reference/
    rw-integrate-video/
docs/
```

## Architecture approach

Recipe2Video uses a feature-first modular architecture with lightweight application and infrastructure boundaries.

The project should not implement a heavy clean architecture or full hexagonal architecture. The goal is to stay fast enough for a hackathon while preventing the codebase from becoming a collection of unstructured API calls.

Rules:

* UI components must not call external APIs directly.
* External API integrations live in infrastructure/service files.
* Use cases orchestrate domain operations.
* Repositories handle Supabase database access.
* Media persistence is centralized in the media-assets module.
* Inngest workflows call application-level use cases.

## Key modules

* `auth` — Magic Link login, allowlist checks, profiles
* `videos` — video project lifecycle and dashboard data
* `recipe-ingest` — recipe extraction from URL, photos, or text
* `recipe-agent` — persistent Cursor SDK recipe agents, artifact validation, Supabase synchronization
* `storyboard` — logical scenes and Seedance 2.0 segment planning
* `references` — global and recipe-specific reference assets
* `generation` — Runway task creation, polling, and generation state
* `media-assets` — Supabase Storage, Mux upload, durable media records
* `feedback` — natural-language correction, prompt diffs, learning data
* `costs` — Runway/OpenAI/Mux cost logging and budget alerts
* `assembly` — Suno audio upload, Remotion preview, final export

## Demo mode

The project should include a demo mode to reduce hackathon presentation risk.

Demo mode may include:

* a Paris-Brest fixture based on prior work from the private `videos` repo
* sample recipe data
* sample logical scenes
* sample Seedance segments
* sample reference metadata
* sample prompt diff
* sample cost logs
* sample video clips when available

Demo mode must not hide the real product flow. It exists to make the presentation reliable if live model generation is slow, unavailable, or too expensive during recording.

## Paris-Brest fixture

The existing private `ycoumesgau/videos` repository contains useful Paris-Brest work that can seed the demo fixture.

The fixture extraction should:

* copy only public-safe material
* preserve useful recipe/storyboard/Seedance logic
* avoid copying obsolete first-frame / last-frame / Kling assumptions
* avoid secrets or internal-only notes
* avoid copying unnecessary large assets

Recommended fixture path:

```txt
fixtures/paris-brest/
  recipe.json
  logical-scenes.json
  seedance-segments.json
  references.json
  prompt-diff-example.json
  cost-logs.json
  suno-prompt.md
  README.md
```

Optional public demo media:

```txt
public/demo/paris-brest/
  segment-01.mp4
  segment-02.mp4
  final-preview.mp4
  reference-raw.png
  reference-baked.png
```

## Environment variables

Expected environment variables:

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
APP_BASE_URL=
CURSOR_API_KEY=
CURSOR_AGENT_REPO_URL=
CURSOR_AGENT_STARTING_REF=main
CURSOR_AGENT_MODEL=gpt-5.5
CURSOR_AGENT_MODEL_THINKING=high
CURSOR_AGENT_RUNTIME=cloud
CURSOR_AGENT_LOCAL_CWD=
```

Never expose server-side secrets to the client.

OpenAI planning uses `OPENAI_API_KEY` only on the server. Set
`OPENAI_PLANNING_MODEL` to the exact API model identifier that corresponds to
GPT-5.5 High for the account. OpenAI is now a fallback/narrow utility layer
(prompt diffs, feedback interpretation); the primary planning engine is the
Cursor SDK agent. Recipe2Video does not silently fall back to a different model
if this value is missing or unavailable.

## Development workflow

The project should be built through GitHub Issues and Cursor Cloud Agents.

Recommended flow:

1. Create the public GitHub repository at hackathon start.
2. Add PRD and documentation files.
3. Copy the Runway API skills from `runwayml/skills/skills/` into `.cursor/skills/`.
4. Create GitHub labels.
5. Create GitHub Issues from `docs/github-issues-backlog.md`.
6. Launch Cursor agents on separate branches.
7. Merge foundational contracts and schema first.
8. Run feature agents in parallel.
9. Preserve a reliable demo mode throughout the build.

## Critical path

The critical path is:

```txt
Bootstrap app
→ Supabase schema and auth
→ Supabase Storage
→ Runway client
→ Inngest workflows
→ Mux upload and playback
→ Segment review UI
→ Prompt feedback and diff
→ Demo mode
→ Demo runbook
```

Remotion assembly is important, but it should not block the core demo if generation, persistence, playback, review, and prompt feedback are working.

## Demo checklist

The final hackathon demo should show:

* Internal login or authenticated session
* Recipe project creation
* Storyboard with logical scenes
* Seedance segment compression
* Reference planning or approval
* Segment generation status
* Mux video playback
* Variant review
* Natural-language feedback
* Prompt diff approval
* Cost dashboard
* Suno prompt or uploaded audio
* Remotion assembly preview
* Final output or near-final preview

## Current limitations

* Suno generation is manual because no official Suno API is available.
* Seedance 2 API access has been announced by Runway but is not yet documented on the public Models page (https://docs.dev.runwayml.com/guides/models/). Availability must be confirmed at the hackathon kickoff. Fallback path: switch the default video model to `gen4.5` if Seedance 2 is not actually exposed via API.
* Mux is not the durable media archive; Supabase Storage is the source of truth.
* Demo mode may be required if live generation is slow during recording.
* The first version is built for internal Licorn use, not public self-service usage.

## License and usage

This project is created for the Runway API Hackathon and for Licorn’s internal marketing production workflow. Public repo visibility is intended for hackathon review, not public access to the deployed application or API credentials.