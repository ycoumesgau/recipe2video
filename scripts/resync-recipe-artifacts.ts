/**
 * Re-sync recipe-agent artifacts that are already stored in `agent_artifacts`
 * back through `syncRecipeAgentArtifacts`. Use this to recover videos whose
 * first sync was rejected by a strict Zod validation (e.g. unknown keys on
 * `recipe-analysis.json`) before the schema was loosened.
 *
 * Usage:
 *   npx tsx scripts/resync-recipe-artifacts.ts <videoId> [<videoId> ...]
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or the secret key) in
 * the environment.
 */
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";
import { listAgentArtifactsByVideoId } from "@/modules/recipe-agent/repositories/recipe-agent.repository";
import { syncRecipeAgentArtifacts } from "@/modules/recipe-agent/use-cases/sync-recipe-agent-artifacts";

async function main() {
  const videoIds = process.argv.slice(2);
  if (videoIds.length === 0) {
    console.error(
      "Usage: npx tsx scripts/resync-recipe-artifacts.ts <videoId> [<videoId> ...]",
    );
    process.exit(1);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_SECRET_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) before running.",
    );
    process.exit(1);
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  for (const videoId of videoIds) {
    console.log(`\n=== resync ${videoId} ===`);
    const artifacts = await listAgentArtifactsByVideoId(supabase, videoId);
    if (artifacts.length === 0) {
      console.warn(`  no artifacts found for video ${videoId}; skipping.`);
      continue;
    }

    const plan = await syncRecipeAgentArtifacts(supabase, {
      videoId,
      artifacts: artifacts.map((row) => ({
        name: row.artifactName,
        path: row.artifactPath,
        content: row.content ?? "",
      })),
    });

    console.log(
      `  valid=${plan.valid} scenes=${plan.logicalScenes.length} segments=${plan.segments.length} refs=${plan.referencesRaw.length}`,
    );
    if (plan.errors.length > 0) {
      console.log("  errors:", plan.errors);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
