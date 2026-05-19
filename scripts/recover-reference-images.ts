/**
 * Recover reference images whose Runway tasks succeeded but were never
 * persisted (local poll timeout, crashed worker, etc.).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recover-reference-images.ts \
 *     --video-id=4c1053b6-ecfd-4af3-89f2-f866aa2a295b
 *
 * Options:
 *   --reference-id=<uuid>   Recover one row only
 *   --runway-task-id=<uuid> Override task id (when DB row lost it)
 *   --requested-by-user-id=<uuid>  Cost log attribution (else from cost_logs)
 *   --dry-run               Print actions without writing
 *   --reconcile-stuck       Fix rows stuck in `generating` (Runway done, persist failed)
 */
import { readFileSync } from "node:fs";

import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";

type RecoverySupabaseClient = SupabaseClient<Database>;
type ReferenceRow = Database["public"]["Tables"]["reference_assets"]["Row"];

const DEFAULT_VIDEO_ID = "4c1053b6-ecfd-4af3-89f2-f866aa2a295b";
const REFERENCE_IMAGES_BUCKET = "reference-images";
const RUNWAY_API_VERSION = "2024-11-06";
const REFERENCE_IMAGE_MODEL = "gpt_image_2";

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

  const requestedByUserId =
    args.requestedByUserId ??
    (await resolveRequestedByUserId(supabase, args.videoId));

  const { data: references, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", args.videoId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`list reference_assets failed: ${error.message}`);
  }

  const taskIdByReferenceId = await loadRunwayTaskIdsFromCostLogs(
    supabase,
    args.videoId,
  );

  const candidates = (references ?? [])
    .filter((reference) => {
      if (args.referenceId && reference.id !== args.referenceId) {
        return false;
      }
      if (args.reconcileStuck) {
        return reference.status === "generating";
      }
      if (reference.media_asset_id && reference.status !== "generating") {
        return false;
      }
      if (args.referenceId) {
        return true;
      }
      const hasTaskId =
        Boolean(reference.runway_task_id) ||
        Boolean(taskIdByReferenceId.get(reference.id)) ||
        Boolean(args.runwayTaskId);
      if (!hasTaskId) {
        return false;
      }
      return reference.status === "failed" || reference.status === "generating";
    })
    .map((reference) => ({
      reference,
      runwayTaskId:
        args.runwayTaskId ??
        reference.runway_task_id ??
        taskIdByReferenceId.get(reference.id),
    }));

  if (candidates.length === 0) {
    console.log(
      JSON.stringify(
        {
          videoId: args.videoId,
          message: "No recoverable references matched this filter.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const results = [];
  for (const { reference, runwayTaskId } of candidates) {
    if (args.reconcileStuck) {
      results.push(
        await reconcileStuckReferenceRow({
          supabase,
          runway,
          reference,
          videoId: args.videoId,
          runwayTaskId,
          requestedByUserId,
          dryRun: args.dryRun,
        }),
      );
      continue;
    }

    if (!runwayTaskId) {
      results.push({
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        recovered: false,
        reason: "No runway_task_id on the reference row or in cost_logs.",
      });
      continue;
    }

    results.push(
      await recoverSucceededRunwayTask({
        supabase,
        runway,
        reference,
        videoId: args.videoId,
        runwayTaskId,
        requestedByUserId,
        dryRun: args.dryRun,
      }),
    );
  }

  console.log(JSON.stringify({ videoId: args.videoId, results }, null, 2));
}

async function reconcileStuckReferenceRow(input: {
  supabase: RecoverySupabaseClient;
  runway: RunwayML;
  reference: ReferenceRow;
  videoId: string;
  runwayTaskId: string | undefined;
  requestedByUserId: string;
  dryRun: boolean;
}) {
  const { reference } = input;
  const runwayTaskId =
    input.runwayTaskId ?? reference.runway_task_id ?? undefined;

  if (!runwayTaskId) {
    if (input.dryRun) {
      return {
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        reconciled: false,
        reason: "dry_run: would mark failed (missing task id).",
      };
    }
    await input.supabase
      .from("reference_assets")
      .update({ status: "failed" })
      .eq("id", reference.id);
    return {
      referenceId: reference.id,
      canonicalName: reference.canonical_name,
      reconciled: true,
      action: "marked_failed_missing_task_id",
    };
  }

  const task = await input.runway.tasks.retrieve(runwayTaskId);
  const runwaySucceeded =
    task.status === "SUCCEEDED" || reference.runway_task_status === "SUCCEEDED";

  if (!runwaySucceeded) {
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      if (!input.dryRun) {
        await input.supabase
          .from("reference_assets")
          .update({ status: "failed" })
          .eq("id", reference.id);
      }
      return {
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        reconciled: true,
        action: "marked_failed_runway_terminal",
        runwayStatus: task.status,
      };
    }
    return {
      referenceId: reference.id,
      canonicalName: reference.canonical_name,
      reconciled: false,
      reason: `Runway task is still ${task.status}.`,
    };
  }

  const existingMedia = await findMediaForRunwayTask(
    input.supabase,
    input.videoId,
    reference.id,
    runwayTaskId,
  );

  if (existingMedia) {
    if (input.dryRun) {
      return {
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        reconciled: false,
        reason: `dry_run: would link media ${existingMedia.id}.`,
      };
    }
    await linkReferenceToMedia(input.supabase, reference.id, existingMedia.id);
    return {
      referenceId: reference.id,
      canonicalName: reference.canonical_name,
      reconciled: true,
      action: "linked_existing_media_for_task",
      mediaAssetId: existingMedia.id,
    };
  }

  return recoverSucceededRunwayTask({
    supabase: input.supabase,
    runway: input.runway,
    reference,
    videoId: input.videoId,
    runwayTaskId,
    requestedByUserId: input.requestedByUserId,
    dryRun: input.dryRun,
    recovery: true,
  });
}

async function recoverSucceededRunwayTask(input: {
  supabase: RecoverySupabaseClient;
  runway: RunwayML;
  reference: ReferenceRow;
  videoId: string;
  runwayTaskId: string;
  requestedByUserId: string;
  dryRun: boolean;
  recovery?: boolean;
}) {
  const task = await input.runway.tasks.retrieve(input.runwayTaskId);
  if (task.status !== "SUCCEEDED") {
    return {
      referenceId: input.reference.id,
      canonicalName: input.reference.canonical_name,
      runwayTaskId: input.runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: `Runway task is ${task.status}, not SUCCEEDED.`,
    };
  }

  const outputUrl = task.output?.[0];
  if (!outputUrl) {
    return {
      referenceId: input.reference.id,
      canonicalName: input.reference.canonical_name,
      runwayTaskId: input.runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: "Runway task succeeded but returned no output URL.",
    };
  }

  if (input.dryRun) {
    return {
      referenceId: input.reference.id,
      canonicalName: input.reference.canonical_name,
      runwayTaskId: input.runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: "dry_run: would persist output.",
    };
  }

  const response = await fetch(outputUrl);
  if (!response.ok) {
    throw new Error(
      `Download failed for ${input.reference.canonical_name}: HTTP ${response.status}`,
    );
  }

  const body = Buffer.from(await response.arrayBuffer());
  const mimeType = response.headers.get("content-type") ?? "image/png";
  const extension = extensionForMimeType(mimeType);
  const storagePath = `${input.videoId}/${input.reference.id}/${input.runwayTaskId}.${extension}`;

  const uploadResult = await input.supabase.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(storagePath, body, {
      contentType: mimeType,
      upsert: true,
    });
  if (uploadResult.error) {
    throw new Error(
      `Storage upload failed for ${input.reference.canonical_name}: ${uploadResult.error.message}`,
    );
  }

  const { data: mediaAsset, error: mediaError } = await input.supabase
    .from("media_assets")
    .insert({
      video_id: input.videoId,
      type: "reference_image",
      provider: "runway",
      storage_bucket: REFERENCE_IMAGES_BUCKET,
      storage_path: storagePath,
      runway_output_url: outputUrl,
      original_filename: `${input.reference.id}.${extension}`,
      mime_type: mimeType,
      file_size_bytes: body.length,
      status: "stored",
      metadata: {
        source: input.recovery
          ? "runway_text_to_image_recovery"
          : "runway_text_to_image",
        recovery: input.recovery ?? false,
        referenceId: input.reference.id,
        referenceVariantId: input.runwayTaskId,
        runwayTaskId: input.runwayTaskId,
        model: REFERENCE_IMAGE_MODEL,
      },
      created_by: input.requestedByUserId,
    })
    .select("*")
    .single();

  if (mediaError) {
    throw new Error(
      `media_assets insert failed for ${input.reference.canonical_name}: ${mediaError.message}`,
    );
  }

  await linkReferenceToMedia(
    input.supabase,
    input.reference.id,
    mediaAsset.id,
  );

  await input.supabase.from("cost_logs").insert({
    video_id: input.videoId,
    segment_id: null,
    provider: "runway",
    model: REFERENCE_IMAGE_MODEL,
    operation: "reference_image_generation_recovered",
    credits_used: null,
    metadata: {
      referenceId: input.reference.id,
      runwayTaskId: input.runwayTaskId,
      mediaAssetId: mediaAsset.id,
      recovery: true,
    },
    created_by: input.requestedByUserId,
  });

  return {
    referenceId: input.reference.id,
    canonicalName: input.reference.canonical_name,
    runwayTaskId: input.runwayTaskId,
    runwayStatus: task.status,
    mediaAssetId: mediaAsset.id,
    storagePath,
    recovered: true,
  };
}

async function findMediaForRunwayTask(
  supabase: RecoverySupabaseClient,
  videoId: string,
  referenceId: string,
  runwayTaskId: string,
) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path, metadata")
    .eq("video_id", videoId)
    .eq("type", "reference_image")
    .contains("metadata", { referenceId, runwayTaskId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`media_assets lookup failed: ${error.message}`);
  }

  return data;
}

async function linkReferenceToMedia(
  supabase: RecoverySupabaseClient,
  referenceId: string,
  mediaAssetId: string,
) {
  const { error } = await supabase
    .from("reference_assets")
    .update({
      media_asset_id: mediaAssetId,
      status: "generated",
      runway_uri: null,
      runway_task_id: null,
      runway_task_status: null,
      runway_progress: null,
    })
    .eq("id", referenceId);

  if (error) {
    throw new Error(`reference_assets update failed: ${error.message}`);
  }
}

async function loadRunwayTaskIdsFromCostLogs(
  supabase: RecoverySupabaseClient,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("cost_logs")
    .select("metadata")
    .eq("video_id", videoId)
    .eq("operation", "reference_image_generation_started")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`cost_logs runway lookup failed: ${error.message}`);
  }

  const taskIdByReferenceId = new Map<string, string>();
  for (const row of data ?? []) {
    const metadata = row.metadata as
      | { referenceId?: string; runwayTaskId?: string }
      | null;
    if (
      metadata?.referenceId &&
      metadata.runwayTaskId &&
      !taskIdByReferenceId.has(metadata.referenceId)
    ) {
      taskIdByReferenceId.set(metadata.referenceId, metadata.runwayTaskId);
    }
  }

  return taskIdByReferenceId;
}

async function resolveRequestedByUserId(
  supabase: RecoverySupabaseClient,
  videoId: string,
) {
  const { data, error } = await supabase
    .from("cost_logs")
    .select("created_by")
    .eq("video_id", videoId)
    .not("created_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`cost_logs lookup failed: ${error.message}`);
  }

  if (!data?.created_by) {
    throw new Error(
      "Pass --requested-by-user-id=<uuid> (no cost_logs.created_by found for this video).",
    );
  }

  return data.created_by;
}

function extensionForMimeType(mimeType: string) {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    default:
      return "png";
  }
}

function parseArgs(argv: string[]) {
  let videoId = DEFAULT_VIDEO_ID;
  let referenceId: string | undefined;
  let runwayTaskId: string | undefined;
  let requestedByUserId: string | undefined;
  let dryRun = false;
  let reconcileStuck = false;

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (arg === "--reconcile-stuck") {
      reconcileStuck = true;
      continue;
    }
    if (arg.startsWith("--video-id=")) {
      videoId = arg.slice("--video-id=".length);
      continue;
    }
    if (arg.startsWith("--reference-id=")) {
      referenceId = arg.slice("--reference-id=".length);
      continue;
    }
    if (arg.startsWith("--runway-task-id=")) {
      runwayTaskId = arg.slice("--runway-task-id=".length);
      continue;
    }
    if (arg.startsWith("--requested-by-user-id=")) {
      requestedByUserId = arg.slice("--requested-by-user-id=".length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    videoId,
    referenceId,
    runwayTaskId,
    requestedByUserId,
    dryRun,
    reconcileStuck,
  };
}

function loadDotenvLocal() {
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
