import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

import { REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES } from "./remotion-headless-shell-al2023-packages";

/**
 * Files whose content (alongside the dnf packages and runtime version) defines
 * a unique cache key for the cold-install state of a Vercel Sandbox running
 * the Remotion render worker. Any change to any of these files invalidates
 * every previously-cached snapshot.
 *
 * Paths are repo-root relative; the caller passes `process.cwd()`.
 *
 * Note: when deploying to Vercel, these files must be force-included in the
 * function bundle via `outputFileTracingIncludes` in `next.config.ts`, since
 * they are not imported by any traced module.
 */
const CACHE_KEY_FILES = [
  "remotion-export/package-lock.json",
  "remotion-export/package.json",
  "remotion-export/render.mjs",
  "remotion/index.tsx",
  "remotion/compositions/recipe-assembly.tsx",
] as const;

const CACHE_KEY_RUNTIME = "node24";

/**
 * Compute the snapshot cache key for the cloud render. Returns `null` when
 * any of the source files cannot be read — in that case the orchestrator
 * gracefully falls back to a cold render (no snapshot lookup, no snapshot
 * persistence) so a single missing file never blocks a user-facing render.
 *
 * Kept free of `server-only` so the test suite (`tsx --test`) can exercise
 * the hashing logic in plain Node. The Supabase-bound lookup / persist
 * helpers live in `sandbox-snapshot-cache.ts` next to this file.
 */
export async function computeSandboxRenderCacheKey(): Promise<string | null> {
  try {
    const repoRoot = process.cwd();
    const contents = await Promise.all(
      CACHE_KEY_FILES.map((relative) =>
        fs.readFile(path.join(repoRoot, relative), "utf8"),
      ),
    );

    const hash = createHash("sha256");
    hash.update("schema:sandbox_snapshot_cache_v1\n");
    hash.update(`runtime:${CACHE_KEY_RUNTIME}\n`);
    hash.update("dnf:");
    hash.update(
      JSON.stringify(
        [...REMOTION_HEADLESS_SHELL_AL2023_DNF_PACKAGES].sort(),
      ),
    );
    hash.update("\n");
    for (let i = 0; i < CACHE_KEY_FILES.length; i++) {
      hash.update(`file:${CACHE_KEY_FILES[i]}\n`);
      hash.update(contents[i]);
      hash.update("\n--\n");
    }
    return hash.digest("hex");
  } catch (error) {
    console.warn(
      "[sandbox-snapshot-cache] cache key computation failed, falling back to cold render:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
