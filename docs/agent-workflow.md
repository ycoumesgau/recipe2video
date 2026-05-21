# Recipe2Video — Agent Workflow Contract

### Purpose

This document defines how Yoann and Cursor agents should build Recipe2Video during the Runway API Hackathon. It is an execution contract, not a product strategy document. Every agent working on the repo must read this before making changes.

### Core Principle

The fastest path is not to launch many agents immediately. The fastest path is to create stable contracts first, then run parallel agents inside narrow boundaries.

Agents must not invent architecture, UI flows, status names, or data models independently. They must follow the PRD, the UX contract, and the technical contracts.

## Two Kinds of Agents

Recipe2Video uses the word "agent" in two distinct contexts:

1. **Build agents** (Cursor Cloud Agents): work on feature branches to implement application code during the hackathon. They follow GitHub Issues, branch boundaries, and merge rules described in this document.

2. **Recipe agents** (Cursor SDK agents): persistent creative planning workers scoped to a recipe video project. A project may have **multiple conversations** (distinct Cursor agents, models, instructions, and Git branches). They are created and managed programmatically through the `@cursor/sdk` TypeScript library. They do not contribute application code or open PRs on `recipe2video`. They produce structured recipe artifacts in a dedicated workspace repository (`recipe2video-agent-workspace`).

The rest of this document covers **build agents**. The recipe agent architecture is documented in `docs/technical-contracts.md` under "Cursor Recipe Agent Contract".

---

## Build Phases

### Phase 0 — Repository and Contracts

Goal: create the project foundation before parallel work starts.

Tasks:

* Create the public GitHub repository at the start of the hackathon.
* Add core documentation:
  * `README.md`
  * `PRD.md`
  * `docs/agent-workflow.md`
  * `docs/ux-contract.md`
  * `docs/technical-contracts.md`
  * `docs/github-issues-backlog.md`
* Scaffold the app with Next.js, TypeScript, Tailwind, and shadcn/ui.
* Add base folders and placeholder files.
* Create GitHub labels.
* Create GitHub issues from the backlog.

Do not start feature agents until this phase is complete.

### Phase 1 — Foundation Wave

Agents can run in parallel after Phase 0.

Recommended agents:

* Agent A: app scaffold and shadcn dashboard shell.
* Agent B: Supabase schema, auth, allowlist, and data access.
* Agent C: Runway and OpenAI client contracts.
* Agent D: Inngest event and workflow scaffold.

Phase 1 acceptance:

* App runs locally.
* Auth flow works or has a functional mocked path.
* Supabase migrations are present.
* Core TypeScript types exist.
* Inngest endpoint is wired.
* No generation workflow is launched yet.

### Phase 2 — Media Pipeline Wave

Recommended agents:

* Agent E: Seedance planning and prompt engine.
* Agent F: Runway task creation and polling.
* Agent G: Supabase Storage and Mux upload pipeline.
* Agent H: video project library and project detail UI.

Phase 2 acceptance:

* A test project can be created.
* A storyboard can be generated or loaded from a fixture.
* A Seedance segment can be queued.
* A Runway output can be persisted to Supabase Storage and uploaded to Mux.
* Project status is visible in the dashboard.

### Phase 3 — Review and Learning Wave

Recommended agents:

* Agent I: segment review UI.
* Agent J: agent chat and prompt diff workflow.
* Agent K: cost dashboard and budget alerts.
* Agent L: reference image approval workflow.

Phase 3 acceptance:

* User can review a segment variant.
* User can submit natural-language feedback.
* Agent can propose a prompt diff.
* User can approve diff and regenerate.
* Feedback and costs are logged.

### Phase 4 — Assembly and Demo Wave

Recommended agents:

* Agent M: Suno prompt and audio upload workflow.
* Agent N: Remotion preview and timeline ordering.
* Agent O: final demo mode and fixtures.
* Agent P: QA and integration pass.

Phase 4 acceptance:

* User can generate or paste a Suno prompt.
* User can upload Suno audio.
* User can preview an assembled sequence in Remotion.
* App has a reliable demo path even if live model generation is slow.

---

## Branch Strategy

Each agent must use a dedicated branch.

Recommended branches:

* `agent/bootstrap-app`
* `agent/supabase-auth-schema`
* `agent/runway-openai-clients`
* `agent/inngest-workflows`
* `agent/storage-mux-pipeline`
* `agent/project-library-ui`
* `agent/storyboard-seedance-engine`
* `agent/reference-workflow`
* `agent/segment-review-ui`
* `agent/agent-chat-diff`
* `agent/cost-dashboard`
* `agent/remotion-suno-assembly`
* `agent/demo-fixtures`
* `agent/integration-qa`

Rules:

* One branch per issue or tightly related issue group.
* No broad refactors unless explicitly assigned.
* No agent should modify PRD or contract documents unless the issue asks for it.
* Shared types must only be changed with care and mentioned clearly in the PR.

---

## GitHub Issue Format

Every issue assigned to an agent must include:

* Goal
* Scope
* Out of scope
* Contracts
* Acceptance criteria
* Test or demo instructions
* Suggested branch name
* Dependencies

Example:

```md
## Goal
Implement the video project dashboard.

## Scope
- app/(dashboard)/page.tsx
- components/video-library/\*
- lib/supabase/videos.ts

## Out of Scope
- Runway generation
- Mux upload
- Remotion assembly

## Contracts
- Use VideoProject from types/video.ts.
- Use project status values from technical-contracts.md.

## Acceptance Criteria
- User can view all video projects.
- Each card shows title, status, thumbnail, cost, and active task count.
- Empty state is implemented.
- Mobile layout works.

## Test / Demo
Run the app locally and open the dashboard with seeded projects.

```

---

## Agent Boundaries

### UI Agents

May edit:

* `app/(dashboard)`
* `components/*`
* `components/ui/*`
* client-side page composition

Must not edit:

* Supabase migrations unless explicitly assigned
* Inngest workflows
* Runway clients
* storage persistence logic

### Backend Agents

May edit:

* `lib/supabase/*`
* `lib/runway/*`
* `lib/openai/*`
* `lib/mux/*`
* `lib/storage/*`
* `inngest/functions/*`

Must not edit:

* UI layout beyond minimal wiring
* UX wording unless part of an API response or status label

### Prompt Agents

May edit:

* `lib/prompts/*`
* `lib/agents/*`
* `docs/prompting/*` if created
* imported rules from the existing `videos` repo

Must not edit:

* auth
* storage persistence
* Mux upload pipeline
* DB migrations unless adding prompt-related fields is explicitly assigned

---

## Merge and Review Rules

### Before opening a PR

Agent must verify:

* TypeScript passes.
* No secrets are committed.
* No unrelated files were modified.
* The implementation follows the PRD and contracts.
* Acceptance criteria are explicitly checked in the PR description.

### PR description template

```md
## What changed

## Why

## Acceptance criteria checked
- \[ \] Criterion 1
- \[ \] Criterion 2

## Screenshots / demo

## Risks / follow-ups

```

### Integration order

Recommended merge order:

1. Bootstrap app
2. Supabase schema and auth
3. Shared types and technical contracts
4. UI shell
5. API clients
6. Inngest workflows
7. Storage and Mux pipeline
8. Storyboard and Seedance engine
9. Review UI
10. Agent chat and diffs
11. Remotion and Suno assembly
12. Cost dashboard
13. Demo fixtures and QA

---

## Cursor Agent Instructions

Use these instructions when launching a Cursor Cloud Agent:

```txt
You are working on Recipe2Video, an internal Licorn hackathon app for the Runway API Hackathon.

Before coding, read:
- README.md
- PRD.md
- docs/agent-workflow.md
- docs/ux-contract.md
- docs/technical-contracts.md
- .cursor/skills/use-runway-api/SKILL.md and .cursor/skills/rw-api-reference/SKILL.md (Runway API skills, mirrored from https://github.com/runwayml/skills/tree/main/skills)
- the GitHub issue assigned to you

If your issue touches Runway API calls (video, image, audio, or task polling), the Runway skills at .cursor/skills/use-runway-api/SKILL.md and .cursor/skills/rw-api-reference/SKILL.md are authoritative for endpoints, model identifiers, request shapes, polling cadence, and error handling. Use the Runway API documentation at https://docs.dev.runwayml.com/ as the secondary source if the local skills are silent on a specific point.

Do not modify files outside your issue scope.
Do not invent new status values, API contracts, or folder conventions.
If a needed contract is missing, stop and ask for clarification in the issue.
Keep the implementation minimal and demo-ready.

```

---

## Demo Protection Rules

* Always preserve a demo path with fixture data.
* Do not make the app depend on live model generation for every demo screen.
* Live generation is ideal, but a reliable demo must still show:
  * project creation
  * storyboard
  * Seedance segment structure
  * video playback
  * prompt diff feedback loop
  * cost tracking
  * assembly preview

---

## Non-Negotiable Rules

* No public unauthenticated access to costly actions.
* No silent model fallback.
* No Runway output URL may be treated as durable storage.
* Supabase Storage is the source of truth for original media files.
* Mux is the playback and streaming layer, not the only archive.
* Every async action must have visible status.
* Every agent must work within branch and issue boundaries.

## Execution Decisions & Multi-Root Workspace

Cursor agents must use a multi-root workspace during the hackathon: the public **Recipe2Video** repository is the destination for all commits and PRs, and the private **ycoumesgau/videos** repository may be mounted as a read-only source of reference material only. Agents must never push changes to the private repository. Any content copied from the private repo into the public repo must follow the public-safe fixture extraction rules below.

### Public-safe fixture extraction

* Only copy minimal, non-sensitive fixture data required to preserve demo flows (for example: a minimal Paris-Brest fixture dataset).
* Do not copy obsolete or internal artifacts such as the original first-frame or last-frame production files, or the Kling production workflow.
* Do not copy secrets, credentials, large unnecessary binary assets, internal raw notes, or any data marked private.
* All copied items require a human review step before being committed to the public repository. The human reviewer must confirm that the fixture is small, non-sensitive, and appropriate for public distribution.

### Required baseline before feature agents

Before launching any feature agents, the following must be present in the public repository:

* README.md
* PRD.md
* docs/ux-contract.md
* docs/technical-contracts.md
* docs/github-issues-backlog.md
* demo runbook (fixture-backed instructions for running the demo)
* `.cursor/skills/use-runway-api/SKILL.md`, `.cursor/skills/rw-api-reference/SKILL.md`, and companion `rw-*` skills copied from `runwayml/skills/skills/`

### Runway API skill installation

The Runway API skill is the authoritative agent-readable reference for endpoints, model identifiers, request shapes, polling cadence, and error handling. It is hosted at the public repository https://github.com/runwayml/skills and uses the same SKILL.md format as Claude Code skills.

Setup rules:

* Copy the contents of `runwayml/skills/skills/` into `.cursor/skills/` of the Recipe2Video repository before any feature agent that touches Runway is launched.
* Keep upstream folder names, SKILL.md frontmatter, and structure unchanged; do not paraphrase or rewrite them.
* Track `.cursor/skills/` in git so Cursor Cloud Agents read it as in-repo context. Do not add `.cursor/skills/` to `.gitignore`.
* Refresh the local copy if Runway publishes an update to the skill during the hackathon.
* This skill copy is not subject to the public-safe fixture extraction rules above, because the source repository (`runwayml/skills`) is itself public and the skill content is intended for redistribution. No additional human review is required beyond confirming the source path and version.

### Branch, issue dependency, and critical-path discipline

* Agents must respect issue dependency fields such as *Depends on* and *Unblocks*, and should not merge work that violates those dependencies.
* Agents must pay attention to critical-path labels and blocked states in issues and defer work until blockers are resolved or the issue is explicitly reassigned.
* One branch per issue (or tightly related issue group) remains required; cross-issue work must be coordinated and explicitly documented in the PR.

### Architecture and demo risk management

* Agents must follow the feature-first, modular architecture boundaries specified in the technical contract. Shared types and contracts must be changed with care and clearly called out in PRs.
* If live systems fail during a demo path (Seedance generation, Mux upload, Magic Link auth, Remotion export, or similar), agents must preserve and surface a fixture-backed demo path so the demo remains reproducible.

---

## Recipe Agent Workspace Repository

Recipe2Video uses a dedicated GitHub repository (`recipe2video-agent-workspace`) as the filesystem for persistent Cursor SDK recipe agents.

### Purpose

The workspace repository is NOT an application repository. It exists so that Cursor SDK cloud agents have a filesystem to read from and write to. The application creates agents that clone this repo, instructs them to write structured artifacts, then downloads and validates those artifacts.

### Repository contents

```txt
.cursor/
  rules/          — Cursor rules inherited by recipe agents
  skills/         — Cursor skills available to recipe agents
agent-recipes/    — Root directory for per-recipe workspaces
  {videoId}/
    recipe-analysis.json
    decisions.md
    logical-scenes.json
    seedance-segments.json
    reference-plan.json
    suno-prompt.md
    changelog.md
```

### Rules

* The workspace repo is referenced by `CURSOR_AGENT_REPO_URL` environment variable.
* Cloud agents clone it at `CURSOR_AGENT_STARTING_REF` (default: `main`).
* Agents may only write inside `agent-recipes/{videoId}/` on their conversation branch.
* Git branches: `recipe2video/{videoId}` (initial conversation) or `recipe2video/{videoId}/{conversationSlug}`.
* Fresh conversations may receive `available-assets.json` (paid reference images + finalized segment videos only — no prior storyboard JSON).
* Switching the active conversation in the app archives the previous conversation's storyboard/segment rows via `is_active` flags (non-destructive).
* The application never pushes, merges, or commits into this repository directly (except server-side manifest refresh via `RECIPE_AGENT_GITHUB_TOKEN`).
* Artifacts produced by agents are downloaded via the Cursor SDK, not via git.
* The workspace repo may contain Cursor rules and skills that guide recipe agent behavior.
* The workspace repo should NOT contain application source code, migrations, or secrets.