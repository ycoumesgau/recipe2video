/**
 * Recover album cover / Spotify Canvas whose Runway tasks succeeded but
 * were never persisted (e.g. media_assets_type_check before migration).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/recover-song-cover-artifacts.ts \
 *     --video-id=4c1053b6-ecfd-4af3-89f2-f866aa2a295b
 *
 * Options:
 *   --kind=album_cover|spotify_canvas   Recover one artifact only
 *   --artifact-id=<uuid>              Recover one row by id
 *   --runway-task-id=<uuid>           Override task id on the row
 *   --requested-by-user-id=<uuid>      Cost log attribution
 *   --dry-run                         Print actions without writing
 */
import { readFileSync } from "node:fs";

import RunwayML from "@runwayml/sdk";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";

type RecoverySupabaseClient = SupabaseClient<Database>;
type SongCoverArtifactRow =
  Database["public"]["Tables"]["song_cover_artifacts"]["Row"];

const DEFAULT_VIDEO_ID = "4c1053b6-ecfd-4af3-89f2-f866aa2a295b";
const RUNWAY_API_VERSION = "2024-11-06";
const ALBUM_COVERS_BUCKET = "album-covers";
const SPOTIFY_CANVASES_BUCKET = "spotify-canvases";

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

  let query = supabase
    .from("song_cover_artifacts")
    .select("*")
    .eq("video_id", args.videoId);

  if (args.artifactId) {
    query = query.eq("id", args.artifactId);
  }
  if (args.kind) {
    query = query.eq("kind", args.kind);
  }

  const { data: artifacts, error } = await query.order("kind", {
    ascending: true,
  });

  if (error) {
    throw new Error(`list song_cover_artifacts failed: ${error.message}`);
  }

  const taskIdByArtifactId = await loadRunwayTaskIdsFromCostLogs(
    supabase,
    args.videoId,
  );

  const candidates = (artifacts ?? []).filter((artifact) => {
    if (artifact.active_media_asset_id) {
      return false;
    }
    const runwayTaskId =
      args.runwayTaskId ??
      artifact.runway_task_id ??
      taskIdByArtifactId.get(artifact.id);
    return Boolean(runwayTaskId);
  });

  if (candidates.length === 0) {
    console.log(
      JSON.stringify(
        {
          videoId: args.videoId,
          message: "No recoverable song_cover_artifacts matched this filter.",
        },
        null,
        2,
      ),
    );
    return;
  }

  const results = [];
  for (const artifact of candidates) {
    const runwayTaskId =
      args.runwayTaskId ??
      artifact.runway_task_id ??
      taskIdByArtifactId.get(artifact.id);

    if (!runwayTaskId) {
      results.push({
        artifactId: artifact.id,
        kind: artifact.kind,
        recovered: false,
        reason: "No runway_task_id on row or in cost_logs.",
      });
      continue;
    }

    results.push(
      await recoverSucceededRunwayTask({
        supabase,
        runway,
        artifact,
        runwayTaskId,
        requestedByUserId,
        dryRun: args.dryRun,
      }),
    );
  }

  console.log(JSON.stringify({ videoId: args.videoId, results }, null, 2));
}

async function recoverSucceededRunwayTask(input: {
  supabase: RecoverySupabaseClient;
  runway: RunwayML;
  artifact: SongCoverArtifactRow;
  runwayTaskId: string;
  requestedByUserId: string;
  dryRun: boolean;
}) {
  const mediaType =
    input.artifact.kind === "album_cover"
      ? "album_cover_image"
      : "spotify_canvas_video";
  const bucket =
    input.artifact.kind === "album_cover"
      ? ALBUM_COVERS_BUCKET
      : SPOTIFY_CANVASES_BUCKET;
  const model =
    input.artifact.kind === "album_cover" ? "gpt_image_2" : "seedance2";
  const operation =
    input.artifact.kind === "album_cover"
      ? "album_cover_generation_recovered"
      : "spotify_canvas_generation_recovered";

  const existingMedia = await findMediaForRunwayTask(
    input.supabase,
    input.artifact.video_id,
    input.artifact.id,
    input.runwayTaskId,
    mediaType,
  );

  if (existingMedia) {
    if (input.dryRun) {
      return {
        artifactId: input.artifact.id,
        kind: input.artifact.kind,
        recovered: false,
        reason: `dry_run: would link media ${existingMedia.id}.`,
      };
    }
    await linkArtifactToMedia(
      input.supabase,
      input.artifact.id,
      existingMedia.id,
    );
    return {
      artifactId: input.artifact.id,
      kind: input.artifact.kind,
      recovered: true,
      action: "linked_existing_media_for_task",
      mediaAssetId: existingMedia.id,
    };
  }

  const task = await input.runway.tasks.retrieve(input.runwayTaskId);
  if (task.status !== "SUCCEEDED") {
    return {
      artifactId: input.artifact.id,
      kind: input.artifact.kind,
      runwayTaskId: input.runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: `Runway task is ${task.status}, not SUCCEEDED.`,
    };
  }

  const outputUrl = task.output?.[0];
  if (!outputUrl) {
    return {
      artifactId: input.artifact.id,
      kind: input.artifact.kind,
      runwayTaskId: input.runwayTaskId,
      recovered: false,
      reason: "Runway task succeeded but returned no output URL.",
    };
  }

  if (input.dryRun) {
    return {
      artifactId: input.artifact.id,
      kind: input.artifact.kind,
      runwayTaskId: input.runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: "dry_run: would persist output.",
    };
  }

  const response = await fetch(outputUrl);
  if (!response.ok) {
    throw new Error(
      `Download failed for ${input.artifact.kind}: HTTP ${response.status}`,
    );
  }

  const body = Buffer.from(await response.arrayBuffer());
  const defaultMime =
    input.artifact.kind === "album_cover" ? "image/png" : "video/mp4";
  const mimeType = response.headers.get("content-type") ?? defaultMime;
  const extension = extensionForMimeType(mimeType, input.artifact.kind);
  const storagePath = `${input.artifact.video_id}/${input.artifact.id}/${input.runwayTaskId}.${extension}`;

  const uploadResult = await input.supabase.storage
    .from(bucket)
    .upload(storagePath, body, {
      contentType: mimeType,
      upsert: true,
    });
  if (uploadResult.error) {
    throw new Error(
      `Storage upload failed for ${input.artifact.kind}: ${uploadResult.error.message}`,
    );
  }

  const { data: mediaAsset, error: mediaError } = await input.supabase
    .from("media_assets")
    .insert({
      video_id: input.artifact.video_id,
      type: mediaType,
      provider: "runway",
      storage_bucket: bucket,
      storage_path: storagePath,
      runway_output_url: outputUrl,
      original_filename: `${input.artifact.id}.${extension}`,
      mime_type: mimeType,
      file_size_bytes: body.length,
      duration_seconds:
        input.artifact.kind === "spotify_canvas"
          ? input.artifact.duration_seconds
          : null,
      status: "stored",
      metadata: {
        source:
          input.artifact.kind === "album_cover"
            ? "runway_text_to_image_recovery"
            : "runway_text_to_video_recovery",
        recovery: true,
        songCoverArtifactId: input.artifact.id,
        songCoverArtifactKind: input.artifact.kind,
        songCoverVariantId: input.runwayTaskId,
        runwayTaskId: input.runwayTaskId,
        model,
        prompt: input.artifact.prompt,
      },
      created_by: input.requestedByUserId,
    })
    .select("*")
    .single();

  if (mediaError) {
    throw new Error(
      `media_assets insert failed for ${input.artifact.kind}: ${mediaError.message}`,
    );
  }

  await linkArtifactToMedia(
    input.supabase,
    input.artifact.id,
    mediaAsset.id,
  );

  await input.supabase.from("cost_logs").insert({
    video_id: input.artifact.video_id,
    segment_id: null,
    provider: "runway",
    model,
    operation,
    credits_used: null,
    metadata: {
      artifactId: input.artifact.id,
      artifactKind: input.artifact.kind,
      runwayTaskId: input.runwayTaskId,
      mediaAssetId: mediaAsset.id,
      recovery: true,
    },
    created_by: input.requestedByUserId,
  });

  return {
    artifactId: input.artifact.id,
    kind: input.artifact.kind,
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
  artifactId: string,
  runwayTaskId: string,
  mediaType: "album_cover_image" | "spotify_canvas_video",
) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_path, metadata")
    .eq("video_id", videoId)
    .eq("type", mediaType)
    .contains("metadata", { songCoverArtifactId: artifactId, runwayTaskId })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`media_assets lookup failed: ${error.message}`);
  }

  return data;
}

async function linkArtifactToMedia(
  supabase: RecoverySupabaseClient,
  artifactId: string,
  mediaAssetId: string,
) {
  const { error } = await supabase
    .from("song_cover_artifacts")
    .update({
      active_media_asset_id: mediaAssetId,
      status: "generated",
      runway_task_id: null,
      runway_task_status: "SUCCEEDED",
      runway_progress: 100,
    })
    .eq("id", artifactId);

  if (error) {
    throw new Error(`song_cover_artifacts update failed: ${error.message}`);
  }
}

async function loadRunwayTaskIdsFromCostLogs(
  supabase: RecoverySupabaseClient,
  videoId: string,
) {
  const operations = [
    "album_cover_generation_started",
    "spotify_canvas_generation_started",
  ] as const;

  const taskIdByArtifactId = new Map<string, string>();

  for (const operation of operations) {
    const { data, error } = await supabase
      .from("cost_logs")
      .select("metadata")
      .eq("video_id", videoId)
      .eq("operation", operation)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`cost_logs runway lookup failed: ${error.message}`);
    }

    for (const row of data ?? []) {
      const metadata = row.metadata as
        | { artifactId?: string; runwayTaskId?: string }
        | null;
      if (
        metadata?.artifactId &&
        metadata.runwayTaskId &&
        !taskIdByArtifactId.has(metadata.artifactId)
      ) {
        taskIdByArtifactId.set(metadata.artifactId, metadata.runwayTaskId);
      }
    }
  }

  return taskIdByArtifactId;
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
    throw new Error(`cost_logs user lookup failed: ${error.message}`);
  }

  if (!data?.created_by) {
    throw new Error(
      "No created_by in cost_logs for this video. Pass --requested-by-user-id.",
    );
  }

  return data.created_by;
}

function extensionForMimeType(
  mimeType: string,
  kind: SongCoverArtifactRow["kind"],
): string {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return "jpg";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("mp4")) return "mp4";
  if (mimeType.includes("webm")) return "webm";
  return kind === "album_cover" ? "png" : "mp4";
}

function parseArgs(argv: string[]) {
  const args: {
    videoId: string;
    kind?: "album_cover" | "spotify_canvas";
    artifactId?: string;
    runwayTaskId?: string;
    requestedByUserId?: string;
    dryRun: boolean;
  } = {
    videoId: DEFAULT_VIDEO_ID,
    dryRun: false,
  };

  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--video-id=")) {
      args.videoId = arg.slice("--video-id=".length);
    } else if (arg.startsWith("--kind=")) {
      const kind = arg.slice("--kind=".length);
      if (kind !== "album_cover" && kind !== "spotify_canvas") {
        throw new Error(`Invalid --kind=${kind}`);
      }
      args.kind = kind;
    } else if (arg.startsWith("--artifact-id=")) {
      args.artifactId = arg.slice("--artifact-id=".length);
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
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
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

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
