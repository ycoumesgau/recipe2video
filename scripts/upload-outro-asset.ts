/**
 * Upload (or refresh) the canonical Licorn outro video asset.
 *
 * Reads the MP4 mirrored in the agent workspace at
 * `assets/character/outro/LicornOutroVideo.mp4`, uploads it to the
 * `reference-images` bucket under
 * `library/character/outro/LicornOutroVideo.mp4`, then upserts the
 * `media_assets` row (find-or-create by storage_bucket+storage_path) and
 * links it to the `asset_library` row created by migration
 * `20260518190000_licorn_outro_video_asset.sql`.
 *
 * The script is idempotent: re-running it overwrites the storage object via
 * `upsert: true`, reuses the existing `media_assets` row when present, and
 * updates the `asset_library` row in place.
 *
 * Usage:
 *   tsx scripts/upload-outro-asset.ts
 *   OUTRO_VIDEO_PATH=/path/to/LicornOutroVideo.mp4 tsx scripts/upload-outro-asset.ts
 *
 * Optional env (override defaults probed from the file):
 *   OUTRO_VIDEO_DURATION_SECONDS  defaults to 3
 *   OUTRO_VIDEO_WIDTH             defaults to 1080
 *   OUTRO_VIDEO_HEIGHT            defaults to 1920
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../shared/supabase/database.types";

const REFERENCE_IMAGES_BUCKET = "reference-images";
const STORAGE_PATH = "library/character/outro/LicornOutroVideo.mp4";
const CANONICAL_NAME = "LicornOutroVideo";
const MIME_TYPE = "video/mp4";
const RUNWAY_MAX_REFERENCE_BYTES = 16 * 1024 * 1024;

function getSupabaseConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required.");
  }
  if (!secretKey) {
    throw new Error("SUPABASE_SECRET_KEY is required.");
  }

  return { url, secretKey };
}

function resolveOutroVideoPath() {
  if (process.env.OUTRO_VIDEO_PATH) {
    return path.resolve(process.env.OUTRO_VIDEO_PATH);
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  return path.resolve(
    repoRoot,
    "..",
    "recipe2video-agent-workspace",
    "assets",
    "character",
    "outro",
    "LicornOutroVideo.mp4",
  );
}

function parseNumberEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number; got "${raw}".`);
  }
  return parsed;
}

async function readVideoBuffer(filePath: string) {
  let stats;
  try {
    stats = await stat(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new Error(
        `Outro video not found at ${filePath}. Pass OUTRO_VIDEO_PATH or mirror the MP4 in the agent workspace.`,
      );
    }
    throw error;
  }

  if (stats.size > RUNWAY_MAX_REFERENCE_BYTES) {
    const sizeMb = (stats.size / (1024 * 1024)).toFixed(2);
    throw new Error(
      `Outro video at ${filePath} is ${sizeMb}MB but Runway caps each reference at 16MB. Re-encode (H.264 baseline/main, CRF 23+) before uploading.`,
    );
  }

  const buffer = await readFile(filePath);
  return { buffer, fileSizeBytes: stats.size };
}

async function findExistingMediaAssetId(
  supabase: ReturnType<typeof createClient<Database>>,
) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("storage_bucket", REFERENCE_IMAGES_BUCKET)
    .eq("storage_path", STORAGE_PATH)
    .is("video_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(
      `media_assets lookup failed for ${STORAGE_PATH}: ${error.message}`,
    );
  }

  return data?.id ?? null;
}

interface UploadInput {
  buffer: Buffer;
  fileSizeBytes: number;
  durationSeconds: number;
  width: number;
  height: number;
}

async function uploadStorageObject(
  supabase: ReturnType<typeof createClient<Database>>,
  buffer: Buffer,
) {
  const { error } = await supabase.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(STORAGE_PATH, buffer, {
      contentType: MIME_TYPE,
      upsert: true,
    });

  if (error) {
    throw new Error(`storage upload failed for ${CANONICAL_NAME}: ${error.message}`);
  }
}

async function upsertMediaAsset(
  supabase: ReturnType<typeof createClient<Database>>,
  input: UploadInput,
) {
  const existingId = await findExistingMediaAssetId(supabase);

  if (existingId) {
    const { error } = await supabase
      .from("media_assets")
      .update({
        mime_type: MIME_TYPE,
        file_size_bytes: input.fileSizeBytes,
        duration_seconds: input.durationSeconds,
        width: input.width,
        height: input.height,
        original_filename: "LicornOutroVideo.mp4",
        status: "stored",
      })
      .eq("id", existingId);

    if (error) {
      throw new Error(
        `media_assets refresh failed for ${CANONICAL_NAME}: ${error.message}`,
      );
    }

    return existingId;
  }

  const { data, error } = await supabase
    .from("media_assets")
    .insert({
      video_id: null,
      type: "reference_image",
      provider: "manual",
      storage_bucket: REFERENCE_IMAGES_BUCKET,
      storage_path: STORAGE_PATH,
      original_filename: "LicornOutroVideo.mp4",
      mime_type: MIME_TYPE,
      file_size_bytes: input.fileSizeBytes,
      duration_seconds: input.durationSeconds,
      width: input.width,
      height: input.height,
      status: "stored",
      metadata: {
        source: "outro_asset_upload",
        canonicalName: CANONICAL_NAME,
        category: "character",
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `media_assets insert failed for ${CANONICAL_NAME}: ${error?.message ?? "no data"}`,
    );
  }

  return data.id;
}

async function linkAssetLibrary(
  supabase: ReturnType<typeof createClient<Database>>,
  mediaAssetId: string,
) {
  // The asset_library row was created by the
  // `20260518190000_licorn_outro_video_asset.sql` migration without a
  // media_asset_id. We just refresh the link here.
  const { data, error } = await supabase
    .from("asset_library")
    .update({
      media_asset_id: mediaAssetId,
      status: "active",
    })
    .eq("canonical_name", CANONICAL_NAME)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      `asset_library update failed for ${CANONICAL_NAME}: ${error.message}`,
    );
  }

  if (!data) {
    throw new Error(
      `asset_library row for ${CANONICAL_NAME} not found. Run the 20260518190000_licorn_outro_video_asset migration first.`,
    );
  }
}

async function main() {
  const { url, secretKey } = getSupabaseConfig();
  const filePath = resolveOutroVideoPath();
  const durationSeconds = parseNumberEnv("OUTRO_VIDEO_DURATION_SECONDS", 3);
  const width = parseNumberEnv("OUTRO_VIDEO_WIDTH", 1080);
  const height = parseNumberEnv("OUTRO_VIDEO_HEIGHT", 1920);

  console.log(`Outro video source:    ${filePath}`);
  console.log(`Supabase URL:          ${url}`);
  console.log(`Storage destination:   ${REFERENCE_IMAGES_BUCKET}/${STORAGE_PATH}`);
  console.log();

  const supabase = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { buffer, fileSizeBytes } = await readVideoBuffer(filePath);
  console.log(`File size: ${(fileSizeBytes / (1024 * 1024)).toFixed(2)} MB`);

  await uploadStorageObject(supabase, buffer);
  const mediaAssetId = await upsertMediaAsset(supabase, {
    buffer,
    fileSizeBytes,
    durationSeconds,
    width,
    height,
  });
  await linkAssetLibrary(supabase, mediaAssetId);

  console.log();
  console.log(`Done. ${CANONICAL_NAME} is ready to be referenced from Seedance segments.`);
}

main().catch((error) => {
  console.error("Outro asset upload failed:", error);
  process.exit(1);
});
