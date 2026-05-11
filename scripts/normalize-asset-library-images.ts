/**
 * Normalize oversize asset_library images so they fit Runway's 16 MB-per-asset
 * cap (`Asset size exceeds 16.0MB.` 400 error).
 *
 * Two modes:
 *
 *   1. Storage mode (default): scan `asset_library` rows whose linked
 *      `media_assets.file_size_bytes` is above THRESHOLD_MB (default: 12 MB
 *      to leave headroom under Runway's 16 MB cap), download each object,
 *      re-encode it, re-upload IN PLACE (same canonical_name; extension may
 *      change PNG→JPG when opaque), and update media_assets. Useful when
 *      the only available copy is the one already in Storage.
 *
 *   2. Source mode (`--from-source <DIR>`): walk the local agent workspace
 *      assets folder (same layout as `seed-asset-library.ts` expects) and
 *      re-encode every PNG that maps to an existing asset_library row.
 *      Use this to RESTORE the native resolution of assets that were
 *      previously downscaled by an over-aggressive run, without dragging
 *      degraded copies forward through Storage.
 *
 * Re-encoding strategy:
 *   - **No resize by default.** Sharp keeps the source resolution. Set
 *     MAX_DIMENSION env var only if a specific asset needs to be capped.
 *     For Seedance 2 references, native resolution is fine: the model's
 *     visual encoder downscales internally to its inference resolution.
 *   - Opaque images → JPEG quality 92 with mozjpeg (visually identical to
 *     PNG, ~10–80× smaller). This is the dominant gain.
 *   - Images with a real alpha channel → keep PNG. (PNG with a fully-opaque
 *     alpha channel still re-encodes as JPEG via the alpha-flatness check.)
 *   - Strip EXIF/metadata to shave the last few KB.
 *
 * Idempotent in either mode: re-running on already-normalized assets is a
 * no-op (storage mode short-circuits via threshold; source mode re-encodes
 * but writes the same bytes).
 *
 * Usage:
 *   npm run normalize:asset-library
 *   npm run normalize:asset-library -- --dry-run
 *   npm run normalize:asset-library -- --from-source ../recipe2video-agent-workspace/assets
 *   THRESHOLD_MB=14 MAX_DIMENSION=3072 npm run normalize:asset-library
 *
 * Required env (loaded from .env.local by the npm script):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

import type { Database } from "../shared/supabase/database.types";

const RUNWAY_MAX_REFERENCE_BYTES = 16 * 1024 * 1024;
const DEFAULT_THRESHOLD_BYTES = 12 * 1024 * 1024;
const REFERENCE_IMAGES_BUCKET = "reference-images";
const JPEG_QUALITY = 92;

interface OversizeAsset {
  assetLibraryId: string;
  canonicalName: string;
  category: string;
  mediaAssetId: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string | null;
  fileSizeBytes: number;
}

interface SourceFile {
  absolutePath: string;
  filename: string;
  canonicalName: string;
}

interface NormalizeResult {
  beforeBytes: number;
  afterBytes: number;
  beforeMime: string | null;
  afterMime: string;
  width: number;
  height: number;
  storagePathChanged: boolean;
  newStoragePath: string;
}

interface RunSummary {
  scanned: number;
  normalized: number;
  skipped: number;
  failures: { canonicalName: string; error: string }[];
  bytesSaved: number;
}

function parseArgs() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const fromSourceFlagIndex = argv.indexOf("--from-source");
  const fromSource = fromSourceFlagIndex !== -1
    ? argv[fromSourceFlagIndex + 1]
    : null;

  if (fromSourceFlagIndex !== -1 && !fromSource) {
    throw new Error("--from-source requires a directory argument.");
  }

  const thresholdMb = Number(process.env.THRESHOLD_MB ?? "");
  const thresholdBytes = Number.isFinite(thresholdMb) && thresholdMb > 0
    ? Math.round(thresholdMb * 1024 * 1024)
    : DEFAULT_THRESHOLD_BYTES;

  // No default cap. Sharp's `withoutEnlargement` makes the resize a no-op
  // when the source is smaller than the cap, so we only opt in when the
  // operator explicitly sets MAX_DIMENSION.
  const maxDimension = Number(process.env.MAX_DIMENSION ?? "");
  const longestSide = Number.isFinite(maxDimension) && maxDimension > 0
    ? Math.round(maxDimension)
    : null;

  return {
    dryRun,
    thresholdBytes,
    longestSide,
    fromSource: fromSource ? path.resolve(fromSource) : null,
  };
}

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

async function listOversizeAssets(
  supabase: ReturnType<typeof createClient<Database>>,
  thresholdBytes: number,
): Promise<OversizeAsset[]> {
  // The generated `Database["public"]["Tables"].asset_library.Relationships`
  // array is empty (we don't have FK metadata in our types yet), so a
  // PostgREST join can't be typed. Two narrow queries are clearer and avoid
  // an `as unknown` cast just to satisfy the inferred SelectQueryError.
  const { data: libraryRows, error: libraryError } = await supabase
    .from("asset_library")
    .select("id, canonical_name, category, media_asset_id")
    .order("canonical_name");

  if (libraryError) {
    throw new Error(`asset_library scan failed: ${libraryError.message}`);
  }

  const mediaAssetIds = Array.from(
    new Set(
      (libraryRows ?? [])
        .map((row) => row.media_asset_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );
  if (mediaAssetIds.length === 0) {
    return [];
  }

  const { data: mediaRows, error: mediaError } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path, mime_type, file_size_bytes")
    .in("id", mediaAssetIds)
    .gt("file_size_bytes", thresholdBytes);

  if (mediaError) {
    throw new Error(`media_assets scan failed: ${mediaError.message}`);
  }

  const mediaById = new Map(
    (mediaRows ?? []).map((row) => [row.id, row] as const),
  );

  const oversize: OversizeAsset[] = [];
  for (const row of libraryRows ?? []) {
    if (!row.media_asset_id) continue;
    const media = mediaById.get(row.media_asset_id);
    if (!media || !media.storage_bucket || !media.storage_path) continue;

    oversize.push({
      assetLibraryId: row.id,
      canonicalName: row.canonical_name,
      category: row.category,
      mediaAssetId: media.id,
      storageBucket: media.storage_bucket,
      storagePath: media.storage_path,
      mimeType: media.mime_type,
      fileSizeBytes: media.file_size_bytes ?? 0,
    });
  }

  return oversize;
}

async function downloadObject(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(asset.storageBucket)
    .download(asset.storagePath);
  if (error || !data) {
    throw new Error(
      `download failed for ${asset.canonicalName} (${asset.storagePath}): ${error?.message ?? "no data"}`,
    );
  }
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Re-encode the buffer:
 *   - Resize ONLY when `longestSide` is provided. Sharp's `withoutEnlargement`
 *     makes the resize a no-op for smaller sources, so passing a cap is
 *     always safe; not passing one preserves native resolution (the right
 *     default — Seedance downscales internally and we don't want to throw
 *     pixels away pre-emptively).
 *   - Decide PNG-vs-JPEG by checking whether the alpha channel is actually
 *     used. Many of our renders ship as PNG-32 by habit but their alpha
 *     channel is fully opaque (min = max = 255); those are flattened and
 *     re-encoded as JPEG q92 (mozjpeg), visually identical to PNG and
 *     ~10–80× lighter. Images with real transparency keep PNG.
 *   - Strip metadata to gain a few extra KB and avoid leaking EXIF.
 */
async function reencode(
  buffer: Buffer,
  longestSide: number | null,
): Promise<{ buffer: Buffer; mime: string; extension: string; width: number; height: number }> {
  const inputPipeline = sharp(buffer, { failOn: "none" }).rotate();
  const metadata = await inputPipeline.metadata();
  const declaresAlpha = Boolean(metadata.hasAlpha);
  const hasRealAlpha = declaresAlpha
    ? await isAlphaChannelTransparent(buffer)
    : false;

  // sharp() pipelines aren't reusable after a `.toBuffer()` and `.stats()`
  // already consumed the previous one to inspect alpha. Build a fresh one
  // for the actual re-encode.
  const pipeline = sharp(buffer, { failOn: "none" }).rotate();
  const resized = longestSide
    ? pipeline.resize({
        width: longestSide,
        height: longestSide,
        fit: "inside",
        withoutEnlargement: true,
      })
    : pipeline;
  const stripped = resized.withMetadata({});

  if (hasRealAlpha) {
    const png = stripped.png({ compressionLevel: 9, palette: false });
    const out = await png.toBuffer({ resolveWithObject: true });
    return {
      buffer: out.data,
      mime: "image/png",
      extension: ".png",
      width: out.info.width,
      height: out.info.height,
    };
  }

  // Flatten any opaque alpha onto white before JPEG encoding so the result
  // doesn't have a mid-gray fringe where alpha pixels were not exactly 255.
  const flattened = declaresAlpha ? stripped.flatten({ background: "#ffffff" }) : stripped;
  const jpeg = flattened.jpeg({ quality: JPEG_QUALITY, mozjpeg: true });
  const out = await jpeg.toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    mime: "image/jpeg",
    extension: ".jpg",
    width: out.info.width,
    height: out.info.height,
  };
}

/**
 * True when the image's alpha channel actually carries transparency. PNG-32s
 * authored without transparency expose a flat alpha=255 channel, which we
 * want to treat as "opaque" so we can re-encode them as JPEG.
 */
async function isAlphaChannelTransparent(buffer: Buffer): Promise<boolean> {
  const stats = await sharp(buffer, { failOn: "none" }).stats();
  const lastChannel = stats.channels.at(-1);
  if (!lastChannel) return false;
  return lastChannel.min < 255;
}

/**
 * Walk the local agent workspace assets folder (same layout as
 * `seed-asset-library.ts` expects) and yield every PNG with its derived
 * canonical_name. We don't try to match against the seed's category
 * resolver here — categories live in `asset_library` already and we simply
 * key by `canonical_name` to find the existing row.
 */
async function collectSourceFiles(sourceDir: string): Promise<SourceFile[]> {
  const files: SourceFile[] = [];
  const subfolders = await readdir(sourceDir, { withFileTypes: true }).catch(
    (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new Error(`--from-source directory not found: ${sourceDir}`);
      }
      throw error;
    },
  );

  for (const sub of subfolders) {
    if (!sub.isDirectory()) continue;
    const folder = path.join(sourceDir, sub.name);
    const entries = await readdir(folder);
    for (const filename of entries) {
      if (!/\.png$/i.test(filename)) continue;
      const canonicalName = path.basename(filename, path.extname(filename));
      files.push({
        absolutePath: path.join(folder, filename),
        filename,
        canonicalName,
      });
    }
  }

  return files;
}

async function lookupAssetByCanonicalName(
  supabase: ReturnType<typeof createClient<Database>>,
  canonicalName: string,
): Promise<OversizeAsset | null> {
  const { data: row, error } = await supabase
    .from("asset_library")
    .select("id, canonical_name, category, media_asset_id")
    .eq("canonical_name", canonicalName)
    .maybeSingle();

  if (error) {
    throw new Error(`asset_library lookup failed for ${canonicalName}: ${error.message}`);
  }
  if (!row || !row.media_asset_id) {
    return null;
  }

  const { data: media, error: mediaError } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path, mime_type, file_size_bytes")
    .eq("id", row.media_asset_id)
    .maybeSingle();

  if (mediaError) {
    throw new Error(
      `media_assets lookup failed for ${canonicalName}: ${mediaError.message}`,
    );
  }
  if (!media || !media.storage_bucket) {
    return null;
  }

  return {
    assetLibraryId: row.id,
    canonicalName: row.canonical_name,
    category: row.category,
    mediaAssetId: media.id,
    storageBucket: media.storage_bucket,
    storagePath:
      media.storage_path ?? `library/${row.category}/${row.canonical_name}.png`,
    mimeType: media.mime_type,
    fileSizeBytes: media.file_size_bytes ?? 0,
  };
}

function swapExtension(storagePath: string, newExtension: string): string {
  const lastDot = storagePath.lastIndexOf(".");
  const lastSlash = storagePath.lastIndexOf("/");
  if (lastDot <= lastSlash) {
    return `${storagePath}${newExtension}`;
  }
  return `${storagePath.slice(0, lastDot)}${newExtension}`;
}

async function uploadObject(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
  newStoragePath: string,
  buffer: Buffer,
  mime: string,
) {
  const { error } = await supabase.storage
    .from(asset.storageBucket)
    .upload(newStoragePath, buffer, {
      contentType: mime,
      upsert: true,
    });
  if (error) {
    throw new Error(
      `upload failed for ${asset.canonicalName} (${newStoragePath}): ${error.message}`,
    );
  }
}

async function deleteOldObject(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
) {
  const { error } = await supabase.storage
    .from(asset.storageBucket)
    .remove([asset.storagePath]);
  if (error) {
    // Removing the previous object is a best-effort cleanup. We log but do
    // not fail: the new object is uploaded and media_assets points to it.
    console.warn(
      `  ⚠️  could not delete old object ${asset.storagePath}: ${error.message}`,
    );
  }
}

async function updateMediaAssetRow(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
  result: NormalizeResult,
  newOriginalFilename: string,
) {
  const { error } = await supabase
    .from("media_assets")
    .update({
      storage_path: result.newStoragePath,
      mime_type: result.afterMime,
      file_size_bytes: result.afterBytes,
      original_filename: newOriginalFilename,
      width: result.width,
      height: result.height,
    })
    .eq("id", asset.mediaAssetId);

  if (error) {
    throw new Error(
      `media_assets update failed for ${asset.canonicalName}: ${error.message}`,
    );
  }
}

async function normalizeOne(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
  dryRun: boolean,
  reencoded: Awaited<ReturnType<typeof reencode>>,
): Promise<NormalizeResult> {
  // When the encoded MIME differs from what's currently stored, swap the
  // extension so the path stays consistent (`.png` → `.jpg`). The bucket
  // contract treats canonical_name as the stable identity, not the path.
  const newStoragePath = swapExtension(asset.storagePath, reencoded.extension);
  const storagePathChanged = newStoragePath !== asset.storagePath;
  const newOriginalFilename = newStoragePath.split("/").pop() ?? asset.canonicalName;

  if (!dryRun) {
    await uploadObject(supabase, asset, newStoragePath, reencoded.buffer, reencoded.mime);
    if (storagePathChanged) {
      await deleteOldObject(supabase, asset);
    }
    await updateMediaAssetRow(
      supabase,
      asset,
      {
        beforeBytes: asset.fileSizeBytes,
        afterBytes: reencoded.buffer.byteLength,
        beforeMime: asset.mimeType,
        afterMime: reencoded.mime,
        width: reencoded.width,
        height: reencoded.height,
        storagePathChanged,
        newStoragePath,
      },
      newOriginalFilename,
    );
  }

  return {
    beforeBytes: asset.fileSizeBytes,
    afterBytes: reencoded.buffer.byteLength,
    beforeMime: asset.mimeType,
    afterMime: reencoded.mime,
    width: reencoded.width,
    height: reencoded.height,
    storagePathChanged,
    newStoragePath,
  };
}

function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

async function main() {
  const { dryRun, thresholdBytes, longestSide, fromSource } = parseArgs();
  const { url, secretKey } = getSupabaseConfig();

  console.log(`Asset library normalize${dryRun ? " (dry-run)" : ""}`);
  console.log(`  Supabase:        ${url}`);
  console.log(`  Mode:            ${fromSource ? `from-source (${fromSource})` : "from-storage"}`);
  if (!fromSource) {
    console.log(`  Threshold:       ${formatMb(thresholdBytes)}`);
  }
  console.log(`  Runway hard cap: ${formatMb(RUNWAY_MAX_REFERENCE_BYTES)}`);
  console.log(`  Longest side:    ${longestSide ? `${longestSide}px` : "native (no resize)"}`);
  console.log();

  const supabase = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const summary: RunSummary = {
    scanned: 0,
    normalized: 0,
    skipped: 0,
    failures: [],
    bytesSaved: 0,
  };

  if (fromSource) {
    await runFromSource(supabase, fromSource, longestSide, dryRun, summary);
  } else {
    await runFromStorage(supabase, thresholdBytes, longestSide, dryRun, summary);
  }

  console.log();
  console.log("Summary:");
  console.log(`  scanned:     ${summary.scanned}`);
  console.log(`  normalized:  ${summary.normalized}${dryRun ? " (dry-run)" : ""}`);
  console.log(`  skipped:     ${summary.skipped}`);
  console.log(`  failures:    ${summary.failures.length}`);
  console.log(`  bytes saved: ${formatMb(summary.bytesSaved)}`);

  if (summary.failures.length > 0) {
    process.exit(1);
  }
}

async function runFromStorage(
  supabase: ReturnType<typeof createClient<Database>>,
  thresholdBytes: number,
  longestSide: number | null,
  dryRun: boolean,
  summary: RunSummary,
) {
  const oversize = await listOversizeAssets(supabase, thresholdBytes);
  summary.scanned = oversize.length;

  if (oversize.length === 0) {
    console.log("No assets above threshold. Nothing to do.");
    return;
  }

  console.log(`Found ${oversize.length} oversize asset(s):`);
  for (const asset of oversize) {
    console.log(
      `  - ${asset.canonicalName.padEnd(28)} ${asset.category.padEnd(18)} ${formatMb(asset.fileSizeBytes)}`,
    );
  }
  console.log();

  for (const asset of oversize) {
    await tryNormalize(supabase, asset, longestSide, dryRun, null, summary);
  }
}

async function runFromSource(
  supabase: ReturnType<typeof createClient<Database>>,
  sourceDir: string,
  longestSide: number | null,
  dryRun: boolean,
  summary: RunSummary,
) {
  const sources = await collectSourceFiles(sourceDir);
  summary.scanned = sources.length;

  if (sources.length === 0) {
    console.log(`No PNG files found under ${sourceDir}. Nothing to do.`);
    return;
  }

  console.log(`Re-encoding ${sources.length} source file(s) into Storage...`);
  console.log();

  for (const source of sources) {
    const asset = await lookupAssetByCanonicalName(supabase, source.canonicalName);
    if (!asset) {
      summary.skipped += 1;
      console.log(
        `  · ${source.canonicalName}: no asset_library row, skipping (run npm run seed:asset-library first).`,
      );
      continue;
    }

    let buffer: Buffer;
    try {
      buffer = await readFile(source.absolutePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failures.push({ canonicalName: source.canonicalName, error: message });
      console.error(`  ✗ ${source.canonicalName}: ${message}`);
      continue;
    }

    // Treat the source-mode "before" size as the local PNG size: the local
    // file is what the operator actually has and what we're about to push,
    // so the byte-savings number reflects the value of running in this mode.
    asset.fileSizeBytes = buffer.byteLength;
    asset.mimeType = "image/png";
    asset.storageBucket = asset.storageBucket || REFERENCE_IMAGES_BUCKET;

    await tryNormalize(supabase, asset, longestSide, dryRun, buffer, summary);
  }
}

async function tryNormalize(
  supabase: ReturnType<typeof createClient<Database>>,
  asset: OversizeAsset,
  longestSide: number | null,
  dryRun: boolean,
  sourceBuffer: Buffer | null,
  summary: RunSummary,
) {
  try {
    // Pre-encode in-memory to check whether the result would actually be an
    // improvement. If sharp's encode is the same size or larger than the
    // existing object (common on PNGs that already went through pngquant or
    // on tiny utensils that are already optimal), we leave it alone instead
    // of replacing a smaller original with a slightly larger re-encode.
    const probeBuffer = sourceBuffer ?? (await downloadObject(supabase, asset));
    const reencoded = await reencode(probeBuffer, longestSide);

    if (reencoded.buffer.byteLength >= asset.fileSizeBytes) {
      console.log(
        `  · ${asset.canonicalName}: skip (re-encoded ${formatMb(reencoded.buffer.byteLength)} ≥ stored ${formatMb(asset.fileSizeBytes)}; already optimal).`,
      );
      summary.skipped += 1;
      return;
    }

    const result = await normalizeOne(supabase, asset, dryRun, reencoded);
    const verb = dryRun ? "would write" : "wrote";
    const arrow = result.storagePathChanged
      ? ` (path ${asset.storagePath} → ${result.newStoragePath})`
      : "";
    console.log(
      `  ✓ ${asset.canonicalName}: ${verb} ${formatMb(result.beforeBytes)} → ${formatMb(result.afterBytes)} as ${result.afterMime} ${result.width}×${result.height}${arrow}`,
    );
    summary.normalized += 1;
    summary.bytesSaved += result.beforeBytes - result.afterBytes;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`  ✗ ${asset.canonicalName}: ${message}`);
    summary.failures.push({ canonicalName: asset.canonicalName, error: message });
  }
}

main().catch((error) => {
  console.error("Normalize failed:", error);
  process.exit(1);
});
