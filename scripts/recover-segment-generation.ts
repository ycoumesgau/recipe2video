/**
 * Recover Seedance segment outputs when Runway tasks succeeded but Recipe2Video
 * never persisted them (e.g. persist/Mux step missed). Also backfills Runway
 * failure details on failed generations for the segment review UI.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recover-segment-generation.ts \
 *     --segment-id=df9bd08c-9564-4969-8a4c-6622013c47b0
 *
 * Options:
 *   --generation-id=<uuid>   Recover one generation row
 *   --runway-task-id=<uuid>  Override Runway task id
 *   --requested-by-user-id=<uuid>  Attribution for cost / created_by
 *   --backfill-failures-only  Only merge Runway failure text into model_params
 *   --dry-run                 Print actions without writing
 */
import { readFileSync } from "node:fs";

import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";
import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";

type RecoverySupabaseClient = SupabaseClient<Database>;
type GenerationRow = Database["public"]["Tables"]["generations"]["Row"];

const RUNWAY_API_VERSION = "2024-11-06";

loadDotenvLocal();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false } },
  );
  const runway = new RunwayML({
    apiKey: requireEnv("RUNWAYML_API_SECRET"),
    runwayVersion: RUNWAY_API_VERSION,
  });

  const generations = await listTargetGenerations(supabase, args);
  if (generations.length === 0) {
    console.log(JSON.stringify({ message: "No generations matched." }, null, 2));
    return;
  }

  const segment = await getSegment(supabase, generations[0]!.segment_id);
  const requestedByUserId =
    args.requestedByUserId ??
    generations[0]?.triggered_by ??
    (await resolveRequestedByUserId(supabase, segment.video_id));

  const results = [];
  for (const generation of generations) {
    const runwayTaskId =
      args.runwayTaskId ?? generation.runway_task_id ?? undefined;
    if (!runwayTaskId) {
      results.push({
        generationId: generation.id,
        recovered: false,
        reason: "Missing runway_task_id.",
      });
      continue;
    }

    const task = await runway.tasks.retrieve(runwayTaskId);
    const taskFailure =
      task.status === "FAILED" ? task.failure : undefined;
    const taskFailureCode =
      task.status === "FAILED" ? task.failureCode : undefined;

    if (args.backfillFailuresOnly) {
      if (task.status !== "FAILED" && task.status !== "CANCELLED") {
        results.push({
          generationId: generation.id,
          runwayTaskId,
          backfilled: false,
          runwayStatus: task.status,
        });
        continue;
      }

      const modelParams = {
        ...((generation.model_params as Record<string, unknown> | null) ?? {}),
        ...(taskFailure ? { runwayFailure: taskFailure } : {}),
        ...(taskFailureCode ? { runwayFailureCode: taskFailureCode } : {}),
      };

      if (args.dryRun) {
        results.push({
          generationId: generation.id,
          runwayTaskId,
          backfilled: false,
          reason: "dry_run: would update model_params with Runway failure.",
          modelParams,
        });
        continue;
      }

      const { error } = await supabase
        .from("generations")
        .update({ model_params: modelParams })
        .eq("id", generation.id);
      if (error) {
        throw new Error(`model_params update failed: ${error.message}`);
      }

      results.push({
        generationId: generation.id,
        runwayTaskId,
        backfilled: true,
        runwayStatus: task.status,
      });
      continue;
    }

    if (task.status !== "SUCCEEDED") {
      results.push({
        generationId: generation.id,
        runwayTaskId,
        recovered: false,
        runwayStatus: task.status,
        failure: taskFailure ?? null,
        failureCode: taskFailureCode ?? null,
      });
      continue;
    }

    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      results.push({
        generationId: generation.id,
        runwayTaskId,
        recovered: false,
        reason: "SUCCEEDED task has no output URL.",
      });
      continue;
    }

    const existingAsset = await findMediaAssetForGeneration(
      supabase,
      generation.id,
    );
    if (existingAsset) {
      results.push({
        generationId: generation.id,
        recovered: true,
        action: "already_persisted",
        mediaAssetId: existingAsset.id,
      });
      continue;
    }

    if (args.dryRun) {
      results.push({
        generationId: generation.id,
        runwayTaskId,
        recovered: false,
        reason: "dry_run: would persist output and schedule Mux upload.",
        outputUrl,
      });
      continue;
    }

    await inngest.send({
      name: INNGEST_EVENTS.segmentOutputPersistRequested,
      data: {
        generationId: generation.id,
        outputUrl,
        requestedByUserId,
        isAllowlisted: true,
      },
    });

    results.push({
      generationId: generation.id,
      runwayTaskId,
      recovered: true,
      action: "segment.output.persist.requested",
      outputUrl,
    });
  }

  console.log(
    JSON.stringify(
      {
        segmentId: segment.id,
        videoId: segment.video_id,
        position: segment.position,
        results,
      },
      null,
      2,
    ),
  );
}

async function listTargetGenerations(
  supabase: RecoverySupabaseClient,
  args: ParsedArgs,
): Promise<GenerationRow[]> {
  if (args.generationId) {
    const { data, error } = await supabase
      .from("generations")
      .select("*")
      .eq("id", args.generationId)
      .maybeSingle();
    if (error) {
      throw new Error(`generation lookup failed: ${error.message}`);
    }
    return data ? [data] : [];
  }

  if (!args.segmentId) {
    throw new Error("Provide --segment-id or --generation-id.");
  }

  const { data, error } = await supabase
    .from("generations")
    .select("*")
    .eq("segment_id", args.segmentId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`list generations failed: ${error.message}`);
  }

  return data ?? [];
}

async function getSegment(supabase: RecoverySupabaseClient, segmentId: string) {
  const { data, error } = await supabase
    .from("segments")
    .select("*")
    .eq("id", segmentId)
    .single();
  if (error) {
    throw new Error(`segment lookup failed: ${error.message}`);
  }
  return data;
}

async function findMediaAssetForGeneration(
  supabase: RecoverySupabaseClient,
  generationId: string,
) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("generation_id", generationId)
    .maybeSingle();
  if (error) {
    throw new Error(`media_assets lookup failed: ${error.message}`);
  }
  return data;
}

async function resolveRequestedByUserId(
  supabase: RecoverySupabaseClient,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("videos")
    .select("created_by")
    .eq("id", videoId)
    .single();
  if (error || !data?.created_by) {
    throw new Error("Could not resolve requestedByUserId from videos.created_by.");
  }
  return data.created_by;
}

type ParsedArgs = {
  segmentId?: string;
  generationId?: string;
  runwayTaskId?: string;
  requestedByUserId?: string;
  backfillFailuresOnly: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    backfillFailuresOnly: false,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--backfill-failures-only") {
      args.backfillFailuresOnly = true;
    } else if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--segment-id=")) {
      args.segmentId = arg.slice("--segment-id=".length);
    } else if (arg.startsWith("--generation-id=")) {
      args.generationId = arg.slice("--generation-id=".length);
    } else if (arg.startsWith("--runway-task-id=")) {
      args.runwayTaskId = arg.slice("--runway-task-id=".length);
    } else if (arg.startsWith("--requested-by-user-id=")) {
      args.requestedByUserId = arg.slice("--requested-by-user-id=".length);
    }
  }

  return args;
}

function loadDotenvLocal() {
  try {
    const raw = readFileSync(".env.local", "utf8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq === -1) {
        continue;
      }
      const key = trimmed.slice(0, eq);
      const value = trimmed.slice(eq + 1);
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Cloud agents inject secrets directly.
  }
}

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
