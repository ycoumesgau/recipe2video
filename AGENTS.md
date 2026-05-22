# AGENTS.md

## Cursor Cloud specific instructions

### Services overview

Recipe2Video is a Next.js 16 (App Router) application with TypeScript, Tailwind CSS 4, and shadcn/ui. It uses Supabase (Postgres + Auth + Storage), Inngest (background workflows), Runway API (video generation), OpenAI (planning), and Mux (video playback).

### Development commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` |
| Lint | `npm run lint` |
| Tests | `npm test` |
| Build | `npm run build` (runs Next.js build then bundles Remotion into `remotion-export/` for cloud assembly export) |

### Pre-PR quality gate (mandatory for Cloud Agents)

**Do not open or update a pull request until all three checks pass locally.** Vercel preview builds run the same TypeScript step as `npm run build`; failing here wastes a deploy cycle.

Run in order from the repo root:

```bash
npm run lint
npm test
npm run build
```

| Check | What it catches |
|-------|-----------------|
| `npm run lint` | ESLint issues (including React hooks rules) |
| `npm test` | Regressions in `modules/**/*.test.ts` |
| `npm run build` | Next.js compile + **TypeScript** (`tsc` via `next build`) — this is what Vercel fails on most often |

**Workflow:**

1. Implement and commit on a `cursor/<name>-<suffix>` branch.
2. Run the three commands above; fix every error (warnings in unrelated files may already exist — still fix any error in files you touched).
3. Commit fixes, push, then create or update the PR.
4. Optionally confirm the Vercel preview: MCP server **Vercel** → `list_deployments` (project `recipe2video`, team Licorn) → `get_deployment_build_logs` on the preview URL if the GitHub check is red. Prefer local `npm run build` first; it is faster and matches the Vercel failure mode.

If `npm run build` fails with a type error, fix imports/types before pushing — do not rely on the PR build to discover them.

### Environment variables

A `.env.local` file is required for the dev server to start. Copy `.env.example` and fill in values. With placeholder values the server starts but auth-protected routes redirect to `/login`. The app gracefully handles missing external services (Supabase, Mux, etc.) via try/catch fallbacks in layout data loaders.

Required env vars for the server to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. All other env vars are needed only when exercising their respective features (Runway generation, OpenAI planning, Mux playback, Inngest workflows).

### Dev auth bypass (cloud agent / local dev only)

Set `DEV_AUTH_BYPASS_ALLOWLIST_EMAIL` to a valid allowlisted email (e.g. `yoann@licorn.org`) to skip Supabase Magic Link authentication. The bypass resolves the user via the `allowed_users` table and ensures a profile, so all auth-protected routes work without a browser session.

**Constraints:**
- Only active when `NODE_ENV !== "production"` — the app throws on startup if the variable is set in production.
- The email must already exist in the `allowed_users` table or the request returns a 403.
- Intended exclusively for Cursor Cloud Agents and local `npm run dev` testing. Never deploy with this variable set.

Cloud agent secret: `DEV_AUTH_BYPASS_ALLOWLIST_EMAIL=yoann@licorn.org` (injected via Cursor Cloud Agents → Secrets).

### Linked repository: `recipe2video-agent-workspace`

This repo has a companion repository — `recipe2video-agent-workspace` — which is the dedicated workspace where Cursor SDK recipe agents write their artifacts (`recipe-analysis.json`, `decisions.md`, `logical-scenes.json`, `seedance-segments.json`, etc.).

**Boundary rule:** any modification that belongs to the agent workspace (agent artifacts, agent workspace docs, agent-specific configs) MUST be committed and PR'd on `recipe2video-agent-workspace`, NOT on `recipe2video`. Do not pollute the current repo with files or changes that belong to the agent workspace.

**How to push to the agent workspace:** the secret `RECIPE_AGENT_GITHUB_TOKEN` is a fine-grained GitHub PAT with read-write permissions on **Contents** and **Pull Requests** for `recipe2video-agent-workspace`. Agents can use it to:
- Clone / fetch the agent workspace repo (HTTPS with token auth).
- Create branches, commit, and push changes.
- Create pull requests via the GitHub API (`gh` CLI or REST).

Example git clone with token auth:
```
git clone https://x-access-token:${RECIPE_AGENT_GITHUB_TOKEN}@github.com/ycoumesgau/recipe2video-agent-workspace.git
```

This ensures a clean separation: `recipe2video` contains the application code, and `recipe2video-agent-workspace` contains the per-recipe agent artifacts managed autonomously by Cursor SDK agents.

### Multi-conversations agent par vidéo

Each video project can have **multiple Cursor SDK recipe agent conversations** stored in `agent_conversations`. Only one conversation is active at a time; switching conversations toggles `is_active` on `logical_scenes`, `segments`, and `segment_references` (archived rows stay in Postgres).

| Concept | Location / convention |
|---------|----------------------|
| Conversation metadata | `agent_conversations` (model, reasoning, custom instructions, Git branch, Cursor agent id) |
| Active conversation UI | Overview → Recipe Agent toolbar; URL query `?conversation={uuid}` (mirrors Assembly preset pattern) |
| Git branch (initial) | `recipe2video/{videoId}` |
| Git branch (other) | `recipe2video/{videoId}/{conversationSlug}` |
| Pre-existing assets briefing | `agent-recipes/{videoId}/available-assets.json` on the conversation branch (signed URLs, no storyboard replay) |
| Shared paid assets | `reference_assets`, `generations`, `media_assets` remain scoped by `video_id` only |

Server actions live in `modules/recipe-agent/actions.ts` (`createAgentConversationAction`, `switchActiveConversationAction`, etc.). Inngest events `recipe.agent.*` carry optional `conversationId`.

### Gotchas

- The Supabase config (`modules/auth/supabase/config.ts`) throws on missing env vars rather than returning undefined. The dashboard layout catches these at the page level, but without a `.env.local` the app will error on any route that touches auth.
- All dashboard routes require authentication. Unauthenticated requests redirect to `/login`. When `DEV_AUTH_BYPASS_ALLOWLIST_EMAIL` is set in dev, the bypass makes all auth-protected routes accessible without a session cookie.
- Tests run with Node.js built-in test runner via `tsx --test "modules/**/*.test.ts"`. No Jest or Vitest.
- ESLint uses flat config (`eslint.config.mjs`) with `eslint-config-next`.
- The `@cursor/sdk` package is marked as `serverExternalPackages` in `next.config.ts` to avoid bundling issues.
- Tailwind CSS v4 is used via `@tailwindcss/postcss` (not the classic `tailwind.config.js` approach).
