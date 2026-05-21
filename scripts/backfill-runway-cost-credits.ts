/**
 * Correct historical Runway `cost_logs` (dedupe double Seedance charges,
 * partial refunds on failed segments, duplicate reference starts).
 *
 *   npx tsx --env-file=.env.local scripts/backfill-runway-cost-credits.ts
 *   npx tsx --env-file=.env.local scripts/backfill-runway-cost-credits.ts --dry-run
 */
import { createClient } from "@supabase/supabase-js";

import { planRunwayCostCreditsBackfill } from "@/modules/costs/plan-runway-cost-credits-backfill";
import { mapCostLog } from "@/modules/costs/repositories/cost.repository";
import type { Database, Json } from "@/shared/supabase/database.types";

const dryRun = process.argv.includes("--dry-run");

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

async function main() {
  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
  );

  const { data: logs, error: logsError } = await supabase
    .from("cost_logs")
    .select("*")
    .eq("provider", "runway")
    .order("created_at", { ascending: true });

  if (logsError) {
    throw new Error(`list cost_logs failed: ${logsError.message}`);
  }

  const { data: generations, error: generationsError } = await supabase
    .from("generations")
    .select("id, status, segment_id, runway_task_id, model, triggered_by")
    .not("runway_task_id", "is", null);

  if (generationsError) {
    throw new Error(`list generations failed: ${generationsError.message}`);
  }

  const segmentIds = [
    ...new Set((generations ?? []).map((row) => row.segment_id)),
  ];
  const { data: segments, error: segmentsError } = await supabase
    .from("segments")
    .select("id, video_id")
    .in("id", segmentIds);

  if (segmentsError) {
    throw new Error(`list segments failed: ${segmentsError.message}`);
  }

  const videoIdBySegmentId = new Map(
    (segments ?? []).map((row) => [row.id, row.video_id]),
  );

  const plan = planRunwayCostCreditsBackfill({
    logs: (logs ?? []).map(mapCostLog),
    generations: (generations ?? [])
      .map((row) => {
        const videoId = videoIdBySegmentId.get(row.segment_id);
        if (!videoId) {
          return null;
        }
        return {
          id: row.id,
          status: row.status,
          segmentId: row.segment_id,
          videoId,
          model: row.model,
          runwayTaskId: row.runway_task_id,
          triggeredBy: row.triggered_by,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null),
  });

  const patchCreditDelta = plan.zeroCreditsPatches.reduce((total, patch) => {
    const log = logs?.find((row) => row.id === patch.logId);
    return total - (log?.credits_used ?? 0);
  }, 0);
  const refundDelta = plan.refundInserts.reduce(
    (total, insert) => total + insert.creditsUsed,
    0,
  );
  const currentTotal = (logs ?? []).reduce(
    (total, row) => total + (row.credits_used ?? 0),
    0,
  );

  console.log(
    `Plan: ${plan.zeroCreditsPatches.length} zero patch(es), ${plan.refundInserts.length} refund insert(s), ${plan.skipped.length} skipped.`,
  );
  console.log(
    `Credits: current=${currentTotal}, patchDelta=${patchCreditDelta}, refundDelta=${refundDelta}, projected=${currentTotal + patchCreditDelta + refundDelta}`,
  );

  if (dryRun) {
    for (const patch of plan.zeroCreditsPatches) {
      console.log(`  [dry-run] zero ${patch.logId}`);
    }
    for (const insert of plan.refundInserts) {
      console.log(
        `  [dry-run] refund ${insert.metadata.generationId} ${insert.creditsUsed} cr`,
      );
    }
    return;
  }

  for (const patch of plan.zeroCreditsPatches) {
    const existing = logs?.find((row) => row.id === patch.logId);
    const metadata =
      existing?.metadata && typeof existing.metadata === "object"
        ? { ...(existing.metadata as Record<string, unknown>), ...patch.metadataPatch }
        : patch.metadataPatch;

    const { error } = await supabase
      .from("cost_logs")
      .update({
        credits_used: patch.creditsUsed,
        metadata: metadata as Json,
      })
      .eq("id", patch.logId);

    if (error) {
      throw new Error(`patch ${patch.logId} failed: ${error.message}`);
    }
    console.log(`  patched ${patch.logId} → credits_used=${patch.creditsUsed}`);
  }

  for (const insert of plan.refundInserts) {
    const { error } = await supabase.from("cost_logs").insert({
      video_id: insert.videoId,
      segment_id: insert.segmentId,
      provider: insert.provider,
      model: insert.model,
      operation: insert.operation,
      credits_used: insert.creditsUsed,
      metadata: insert.metadata as Json,
      created_by: insert.createdBy,
    });

    if (error) {
      throw new Error(`refund insert failed: ${error.message}`);
    }
    console.log(
      `  inserted refund for ${insert.metadata.generationId}: ${insert.creditsUsed} cr`,
    );
  }

  const { data: after } = await supabase
    .from("cost_logs")
    .select("credits_used")
    .eq("provider", "runway");

  const afterTotal = (after ?? []).reduce(
    (total, row) => total + (row.credits_used ?? 0),
    0,
  );
  console.log(`Done. Runway cost_logs total is now ${afterTotal} credits.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
