/**
 * Upload stored Supabase runway outputs to Mux, one segment at a time.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/upload-mux-for-positions.ts --video-id=UUID --from=3 --to=8
 *   npx tsx --env-file=.env.local scripts/upload-mux-for-positions.ts --video-id=UUID --position=3
 */
import { readFileSync } from "node:fs";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/shared/supabase/database.types";

type Db = SupabaseClient<Database>;

const MUX_VIDEO_API_BASE_URL = "https://api.mux.com/video/v1";
const MUX_SIGNED_URL_TTL_SECONDS = 60 * 60;
const MUX_BASIC_ESTIMATED_USD_PER_SECOND = 0.005;

loadDotenvLocal();

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SECRET_KEY"),
    { auth: { persistSession: false } },
  );

  const rows = await query(
    supabase
      .from("segments")
      .select(
        "position, id, selected_generation_id, generations!segments_selected_generation_id_fkey(id, media_asset_id, media_assets!generations_media_asset_id_fkey(id, storage_bucket, storage_path, mux_playback_id, mime_type, original_filename, duration_seconds, segment_id, video_id, created_by))",
      )
      .eq("video_id", args.videoId)
      .gte("position", args.from)
      .lte("position", args.to)
      .order("position"),
    "load segments failed",
  );

  for (const row of rows) {
    const position = row.position;
    const generation = row.generations;
    const asset = generation?.media_assets;

    console.log(`\n[seg ${position}] --- start ${new Date().toISOString()} ---`);

    if (!generation?.media_asset_id || !asset) {
      console.log(`[seg ${position}] skip: no media asset`);
      continue;
    }
    if (asset.mux_playback_id) {
      console.log(`[seg ${position}] skip: already has mux ${asset.mux_playback_id}`);
      continue;
    }
    if (!asset.storage_bucket || !asset.storage_path) {
      console.log(`[seg ${position}] error: missing storage path`);
      continue;
    }

    try {
      const mux = await uploadAssetToMux({ supabase, asset });
      console.log(
        `[seg ${position}] ok muxPlaybackId=${mux.muxPlaybackId} muxAssetId=${mux.muxAssetId}`,
      );
    } catch (error) {
      console.error(
        `[seg ${position}] failed:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  console.log("\nDone.");
}

async function uploadAssetToMux(input: {
  supabase: Db;
  asset: {
    id: string;
    storage_bucket: string;
    storage_path: string;
    segment_id: string | null;
    video_id: string | null;
    duration_seconds: number | null;
    created_by: string | null;
  };
}) {
  const signed = await input.supabase.storage
    .from(input.asset.storage_bucket)
    .createSignedUrl(input.asset.storage_path, MUX_SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(
      `signed URL failed: ${signed.error?.message ?? "unknown"}`,
    );
  }

  console.log(`[asset ${input.asset.id}] POST Mux /assets ...`);
  const muxResponse = await fetch(`${MUX_VIDEO_API_BASE_URL}/assets`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${getMuxBasicAuthToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      inputs: [{ url: signed.data.signedUrl }],
      playback_policies: ["public"],
      passthrough: input.asset.id,
      video_quality: "basic",
    }),
  });

  const payload = (await muxResponse.json().catch(() => null)) as {
    data?: { id?: string; playback_ids?: Array<{ id?: string }> };
    error?: { messages?: string[] };
  } | null;

  if (!muxResponse.ok) {
    throw new Error(
      `Mux ${muxResponse.status}: ${JSON.stringify(payload?.error ?? payload)}`,
    );
  }

  const muxAssetId = payload?.data?.id;
  const muxPlaybackId = payload?.data?.playback_ids?.[0]?.id;
  if (!muxAssetId || !muxPlaybackId) {
    throw new Error(`Mux response missing ids: ${JSON.stringify(payload)}`);
  }

  await queryWrite(
    input.supabase
      .from("media_assets")
      .update({
        mux_asset_id: muxAssetId,
        mux_playback_id: muxPlaybackId,
        status: "uploaded_to_mux",
      })
      .eq("id", input.asset.id),
    "update media_assets failed",
  );

  const estimatedDollars =
    typeof input.asset.duration_seconds === "number" &&
    input.asset.duration_seconds > 0
      ? Number(
          (input.asset.duration_seconds * MUX_BASIC_ESTIMATED_USD_PER_SECOND).toFixed(
            4,
          ),
        )
      : null;

  await queryWrite(
    input.supabase.from("cost_logs").insert({
      video_id: input.asset.video_id,
      segment_id: input.asset.segment_id,
      provider: "mux",
      model: "basic-on-demand",
      operation: "media_asset_uploaded_to_mux",
      cost_dollars: estimatedDollars,
      metadata: {
        estimated: true,
        mediaAssetId: input.asset.id,
        muxAssetId,
        muxPlaybackId,
        recoveryMuxBackfill: true,
      },
      created_by: input.asset.created_by,
    }),
    "insert cost log failed",
  );

  return { muxAssetId, muxPlaybackId };
}

function parseArgs(argv: string[]) {
  let videoId = "4c1053b6-ecfd-4af3-89f2-f866aa2a295b";
  let from = 3;
  let to = 8;

  for (const arg of argv) {
    if (arg.startsWith("--video-id=")) {
      videoId = arg.slice("--video-id=".length);
    } else if (arg.startsWith("--from=")) {
      from = Number(arg.slice("--from=".length));
    } else if (arg.startsWith("--to=")) {
      to = Number(arg.slice("--to=".length));
    } else if (arg.startsWith("--position=")) {
      const p = Number(arg.slice("--position=".length));
      from = p;
      to = p;
    }
  }

  return { videoId, from, to };
}

function loadDotenvLocal() {
  try {
    const envContent = readFileSync(".env.local", "utf8");
    for (const line of envContent.split(/\r?\n/)) {
      if (!line || line.startsWith("#")) continue;
      const i = line.indexOf("=");
      if (i <= 0) continue;
      const key = line.slice(0, i);
      const value = line.slice(i + 1);
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // --env-file may have loaded vars
  }
}

function requireEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key}`);
  return value;
}

function getMuxBasicAuthToken() {
  return Buffer.from(
    `${requireEnv("MUX_TOKEN_ID")}:${requireEnv("MUX_TOKEN_SECRET")}`,
  ).toString("base64");
}

async function query<T>(
  promise: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string,
) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return (data ?? []) as Exclude<T, null>;
}

async function queryWrite(
  promise: PromiseLike<{ error: { message: string } | null }>,
  label: string,
) {
  const { error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
