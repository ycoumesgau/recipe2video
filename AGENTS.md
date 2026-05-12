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

### Environment variables

A `.env.local` file is required for the dev server to start. Copy `.env.example` and fill in values. With placeholder values the server starts but auth-protected routes redirect to `/login`. The app gracefully handles missing external services (Supabase, Mux, etc.) via try/catch fallbacks in layout data loaders.

Required env vars for the server to boot: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`. All other env vars are needed only when exercising their respective features (Runway generation, OpenAI planning, Mux playback, Inngest workflows).

### Gotchas

- The Supabase config (`modules/auth/supabase/config.ts`) throws on missing env vars rather than returning undefined. The dashboard layout catches these at the page level, but without a `.env.local` the app will error on any route that touches auth.
- All dashboard routes require authentication. Unauthenticated requests redirect to `/login`.
- Tests run with Node.js built-in test runner via `tsx --test "modules/**/*.test.ts"`. No Jest or Vitest.
- ESLint uses flat config (`eslint.config.mjs`) with `eslint-config-next`.
- The `@cursor/sdk` package is marked as `serverExternalPackages` in `next.config.ts` to avoid bundling issues.
- Tailwind CSS v4 is used via `@tailwindcss/postcss` (not the classic `tailwind.config.js` approach).
