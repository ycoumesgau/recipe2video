/**
 * Backfill `cost_logs.credits_used` for historical GPT-Image 2 generations
 * (recipe reference images, album covers) that were logged with null credits.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/backfill-gpt-image-cost-credits.ts
 *   npx tsx --env-file=.env.local scripts/backfill-gpt-image-cost-credits.ts --dry-run
 *   npx tsx --env-file=.env.local scripts/backfill-gpt-image-cost-credits.ts --video-id=<uuid>
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import { planGptImageCostCreditsBackfill } from "@/modules/costs/backfill-gpt-image-cost-credits";
import { mapCostLog } from "@/modules/costs/repositories/cost.repository";
import type { Database } from "@/shared/supabase/database.types";

type BackfillSupabaseClient = SupabaseClient<Database>;

loadDotenvLocal();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false } },
  );

  const logs = await listNullCreditGptImageLogs(supabase, args.videoId);
  const plan = planGptImageCostCreditsBackfill(logs.map(mapCostLog));

  console.log(
    `Found ${logs.length} runway/gpt_image_2 log(s) with null credits_used.`,
  );
  console.log(
    `Plan: ${plan.candidates.length} update(s), ${plan.skipped.length} skipped.`,
  );

  if (plan.candidates.length === 0) {
    return;
  }

  const creditsByVideo = new Map<string, number>();
  for (const candidate of plan.candidates) {
    creditsByVideo.set(
      candidate.videoId,
      (creditsByVideo.get(candidate.videoId) ?? 0) + candidate.creditsUsed,
    );
  }

  for (const [videoId, credits] of creditsByVideo) {
    console.log(`  video ${videoId}: +${credits} cr`);
  }

  if (args.dryRun) {
    for (const candidate of plan.candidates) {
      console.log(
        `  [dry-run] ${candidate.logId} ${candidate.operation} → ${candidate.creditsUsed} cr (${candidate.ratio})`,
      );
    }
    return;
  }

  let updated = 0;
  for (const candidate of plan.candidates) {
    const row = logs.find((log) => log.id === candidate.logId);
    if (!row) {
      continue;
    }

    const mergedMetadata = {
      ...(row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {}),
      ...candidate.metadataPatch,
    };

    const { error } = await supabase
      .from("cost_logs")
      .update({
        credits_used: candidate.creditsUsed,
        metadata: mergedMetadata,
      })
      .eq("id", candidate.logId);

    if (error) {
      throw new Error(
        `Failed to update cost_log ${candidate.logId}: ${error.message}`,
      );
    }

    updated += 1;
    console.log(
      `  updated ${candidate.logId} (${candidate.operation}) → ${candidate.creditsUsed} cr`,
    );
  }

  console.log(`Done. Updated ${updated} cost_log row(s).`);
}

async function listNullCreditGptImageLogs(
  supabase: BackfillSupabaseClient,
  videoId?: string,
) {
  let query = supabase
    .from("cost_logs")
    .select("*")
    .eq("provider", "runway")
    .eq("model", "gpt_image_2")
    .is("credits_used", null)
    .order("created_at", { ascending: true });

  if (videoId) {
    query = query.eq("video_id", videoId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`list cost_logs failed: ${error.message}`);
  }

  return data ?? [];
}

function parseArgs(argv: string[]) {
  let dryRun = false;
  let videoId: string | undefined;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg.startsWith("--video-id=")) {
      videoId = arg.slice("--video-id=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { dryRun, videoId };
}

function loadDotenvLocal() {
  try {
    const envContent = readFileSync(".env.local", "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) {
        continue;
      }
      const separatorIndex = line.indexOf("=");
      if (separatorIndex <= 0) {
        continue;
      }
      const key = line.slice(0, separatorIndex);
      const value = line.slice(separatorIndex + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Rely on injected env in CI / cloud when .env.local is absent.
  }
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var ${key}.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
