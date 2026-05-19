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
 */
import { readFileSync } from "node:fs";

import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";

type RecoverySupabaseClient = SupabaseClient<Database>;

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
      if (reference.media_asset_id) {
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
    if (!runwayTaskId) {
      results.push({
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        recovered: false,
        reason: "No runway_task_id on the reference row or in cost_logs.",
      });
      continue;
    }

    const task = await runway.tasks.retrieve(runwayTaskId);
    if (task.status !== "SUCCEEDED") {
      results.push({
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        runwayTaskId,
        runwayStatus: task.status,
        recovered: false,
        reason: `Runway task is ${task.status}, not SUCCEEDED.`,
      });
      continue;
    }

    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      results.push({
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        runwayTaskId,
        runwayStatus: task.status,
        recovered: false,
        reason: "Runway task succeeded but returned no output URL.",
      });
      continue;
    }

    if (args.dryRun) {
      results.push({
        referenceId: reference.id,
        canonicalName: reference.canonical_name,
        runwayTaskId,
        runwayStatus: task.status,
        outputUrl,
        recovered: false,
        reason: "dry_run: would persist output.",
      });
      continue;
    }

    const response = await fetch(outputUrl);
    if (!response.ok) {
      throw new Error(
        `Download failed for ${reference.canonical_name}: HTTP ${response.status}`,
      );
    }

    const body = Buffer.from(await response.arrayBuffer());
    const mimeType = response.headers.get("content-type") ?? "image/png";
    const extension = extensionForMimeType(mimeType);
    const storagePath = `${args.videoId}/${reference.id}.${extension}`;

    const uploadResult = await supabase.storage
      .from(REFERENCE_IMAGES_BUCKET)
      .upload(storagePath, body, {
        contentType: mimeType,
        upsert: true,
      });
    if (uploadResult.error) {
      throw new Error(
        `Storage upload failed for ${reference.canonical_name}: ${uploadResult.error.message}`,
      );
    }

    const { data: mediaAsset, error: mediaError } = await supabase
      .from("media_assets")
      .insert({
        video_id: args.videoId,
        type: "reference_image",
        provider: "runway",
        storage_bucket: REFERENCE_IMAGES_BUCKET,
        storage_path: storagePath,
        runway_output_url: outputUrl,
        original_filename: `${reference.id}.${extension}`,
        mime_type: mimeType,
        file_size_bytes: body.length,
        status: "stored",
        metadata: {
          source: "runway_text_to_image_recovery",
          recovery: true,
          referenceId: reference.id,
          runwayTaskId,
          model: REFERENCE_IMAGE_MODEL,
        },
        created_by: requestedByUserId,
      })
      .select("*")
      .single();

    if (mediaError) {
      throw new Error(
        `media_assets insert failed for ${reference.canonical_name}: ${mediaError.message}`,
      );
    }

    const { error: referenceError } = await supabase
      .from("reference_assets")
      .update({
        media_asset_id: mediaAsset.id,
        status: "generated",
        runway_uri: null,
        runway_task_id: null,
        runway_task_status: null,
        runway_progress: null,
      })
      .eq("id", reference.id);

    if (referenceError) {
      throw new Error(
        `reference_assets update failed for ${reference.canonical_name}: ${referenceError.message}`,
      );
    }

    await supabase.from("cost_logs").insert({
      video_id: args.videoId,
      segment_id: null,
      provider: "runway",
      model: REFERENCE_IMAGE_MODEL,
      operation: "reference_image_generation_recovered",
      credits_used: null,
      metadata: {
        referenceId: reference.id,
        runwayTaskId,
        mediaAssetId: mediaAsset.id,
        recovery: true,
      },
      created_by: requestedByUserId,
    });

    results.push({
      referenceId: reference.id,
      canonicalName: reference.canonical_name,
      runwayTaskId,
      runwayStatus: task.status,
      mediaAssetId: mediaAsset.id,
      storagePath,
      recovered: true,
    });
  }

  console.log(JSON.stringify({ videoId: args.videoId, results }, null, 2));
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

  for (const arg of argv) {
    if (arg === "--dry-run") {
      dryRun = true;
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
