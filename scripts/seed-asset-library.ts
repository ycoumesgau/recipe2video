/**
 * Seed the asset library from the local agent workspace assets folder.
 *
 * Reads PNG files under <LIBRARY_SOURCE_DIR>/{character,kitchen,ustensils}/,
 * uploads each one to the `reference-images` bucket under
 * `library/<category>/<canonical_name>.png`, then upserts the corresponding
 * rows in `media_assets` (find-or-create by storage_bucket+storage_path,
 * with video_id NULL) and `asset_library` (upsert by canonical_name).
 *
 * The script is idempotent: re-running it overwrites the storage object via
 * upsert: true, reuses the existing media_assets row when present, and
 * updates the asset_library row in place.
 *
 * Usage:
 *   tsx scripts/seed-asset-library.ts
 *   LIBRARY_SOURCE_DIR=/path/to/videos/assets tsx scripts/seed-asset-library.ts
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../shared/supabase/database.types";

const REFERENCE_IMAGES_BUCKET = "reference-images";

/**
 * Top-level folders inside the asset library, mapped to the default category.
 * `character/` is special: it mixes the master sheet, the facial expression
 * board, and several pose boards, so we resolve the category per-file.
 */
const SOURCE_FOLDERS = [
  { folder: "character", defaultCategory: "character" },
  { folder: "kitchen", defaultCategory: "kitchen" },
  { folder: "ustensils", defaultCategory: "utensil" },
] as const;

type AssetCategory = Database["public"]["Tables"]["asset_library"]["Row"]["category"];

interface SeedItem {
  filename: string;
  absolutePath: string;
  canonicalName: string;
  category: AssetCategory;
  storagePath: string;
  buffer: Buffer;
  fileSizeBytes: number;
  description: string | null;
}

interface SeedSummary {
  uploaded: number;
  refreshed: number;
  failures: { canonicalName: string; error: string }[];
}

/**
 * Friendly @handles exposed to the agent in the generated SKILL.md.
 * Keep this map minimal and intentional: only entries that need stable,
 * human-readable aliases beyond their snake_case canonical filename.
 */
const DEFAULT_LIBRARY_ALIASES: Record<string, string[]> = {
  island_default: ["KitchenIslandDefault"],
  island_overhead: ["KitchenIslandOverhead"],
  island_overview_wide: ["KitchenIslandWide"],
  kitchen_wide: ["KitchenLayoutContextWide"],
  induction_left_closeup: ["InductionCloseup"],
  induction_wide: ["InductionWide"],
  oven_opened_wide: ["OvenWide"],
  oven_opened_closeup: ["OvenCloseup"],
  silicone_spatula: ["SiliconeSpatula", "Maryse", "RubberSpatula", "Spatula"],
  turning_spatula: ["TurningSpatula", "FishSpatula"],
  offset_spatula: ["OffsetSpatula"],
  spider_skimmer: ["SpiderSkimmer"],
  tongs: ["Tongs"],
};

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

function resolveLibrarySourceDir() {
  if (process.env.LIBRARY_SOURCE_DIR) {
    return path.resolve(process.env.LIBRARY_SOURCE_DIR);
  }

  // Default to the public agent workspace mirror which already tracks the
  // canonical library and is referenced by the Cursor SDK agents.
  const here = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(here, "..");
  return path.resolve(repoRoot, "..", "recipe2video-agent-workspace", "assets");
}

function resolveCategoryForCharacterFile(filename: string): AssetCategory {
  const stem = path.basename(filename, path.extname(filename));
  if (/-pose$/i.test(stem) || /pose$/i.test(stem.toLowerCase())) {
    return "character_pose";
  }
  if (/^Facial-expressions$/i.test(stem)) {
    return "character_expression";
  }
  return "character";
}

function buildDescription(category: AssetCategory, canonicalName: string): string | null {
  // Concise default descriptions sourced from the asset-reference-system
  // skill in the agent workspace. The Library admin page lets operators edit
  // these later without re-running the seed.
  switch (category) {
    case "character":
      return `Master character sheet (${canonicalName}). Global Licorn mascot reference; never re-describe the character in prompts.`;
    case "character_expression":
      return `Facial expressions board (${canonicalName}). Authorized expressions: neutral, focused, enthusiastic, surprised, satisfied, hungry, comic_fail.`;
    case "character_pose":
      return `Character pose reference (${canonicalName}). Use as a pose hint; do not invent unlisted poses.`;
    case "kitchen":
      if (canonicalName === "kitchen_wide") {
        return "Wide structural kitchen context. Use in every segment to lock layout/material continuity; do not force wide framing.";
      }
      return `Canonical kitchen background (${canonicalName}). Choose by what the image actually frames, not by historical aliases.`;
    case "utensil":
      if (canonicalName === "silicone_spatula") {
        return "Flexible silicone spatula (French: maryse) for folding batters, scraping mixing bowls, stand-mixer bowls, and sauces in pans. Not for serving portions from baking dishes (@TurningSpatula) or lifting fragile pastry layers (@OffsetSpatula).";
      }
      if (canonicalName === "turning_spatula") {
        return "Rigid turning spatula for sliding under lasagna, gratin, sheet cakes, or fish and lifting a supported serving.";
      }
      if (canonicalName === "offset_spatula") {
        return "Offset pastry spatula for sliding under tart shells, cookies, or entremets and lifting delicate baked layers.";
      }
      return `Canonical utensil (${canonicalName}). Attach only the exact variant identifier; never use generic family names.`;
    default:
      return null;
  }
}

async function collectSeedItems(sourceDir: string): Promise<SeedItem[]> {
  const items: SeedItem[] = [];

  for (const { folder, defaultCategory } of SOURCE_FOLDERS) {
    const folderPath = path.join(sourceDir, folder);
    let entries: string[];
    try {
      entries = await readdir(folderPath);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") {
        console.warn(`Skipping missing folder: ${folderPath}`);
        continue;
      }
      throw error;
    }

    for (const filename of entries) {
      if (!/\.png$/i.test(filename)) continue;

      const absolutePath = path.join(folderPath, filename);
      const canonicalName = path.basename(filename, path.extname(filename));
      const category =
        folder === "character"
          ? resolveCategoryForCharacterFile(filename)
          : (defaultCategory satisfies AssetCategory);
      const buffer = await readFile(absolutePath);

      items.push({
        filename,
        absolutePath,
        canonicalName,
        category,
        storagePath: `library/${category}/${canonicalName}.png`,
        buffer,
        fileSizeBytes: buffer.byteLength,
        description: buildDescription(category, canonicalName),
      });
    }
  }

  return items;
}

async function findExistingLibraryMediaAssetId(
  supabase: ReturnType<typeof createClient<Database>>,
  storagePath: string,
) {
  const { data, error } = await supabase
    .from("media_assets")
    .select("id")
    .eq("storage_bucket", REFERENCE_IMAGES_BUCKET)
    .eq("storage_path", storagePath)
    .is("video_id", null)
    .maybeSingle();

  if (error) {
    throw new Error(`media_assets lookup failed for ${storagePath}: ${error.message}`);
  }

  return data?.id ?? null;
}

async function upsertLibraryMediaAsset(
  supabase: ReturnType<typeof createClient<Database>>,
  item: SeedItem,
) {
  const existingId = await findExistingLibraryMediaAssetId(supabase, item.storagePath);

  if (existingId) {
    const { error } = await supabase
      .from("media_assets")
      .update({
        mime_type: "image/png",
        file_size_bytes: item.fileSizeBytes,
        original_filename: item.filename,
        status: "stored",
      })
      .eq("id", existingId);

    if (error) {
      throw new Error(`media_assets refresh failed for ${item.canonicalName}: ${error.message}`);
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
      storage_path: item.storagePath,
      original_filename: item.filename,
      mime_type: "image/png",
      file_size_bytes: item.fileSizeBytes,
      status: "stored",
      metadata: {
        source: "asset_library_seed",
        canonicalName: item.canonicalName,
        category: item.category,
      },
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(
      `media_assets insert failed for ${item.canonicalName}: ${error?.message ?? "no data"}`,
    );
  }

  return data.id;
}

async function upsertAssetLibraryRow(
  supabase: ReturnType<typeof createClient<Database>>,
  item: SeedItem,
  mediaAssetId: string,
) {
  const aliases = DEFAULT_LIBRARY_ALIASES[item.canonicalName];
  const { error } = await supabase
    .from("asset_library")
    .upsert(
      {
        canonical_name: item.canonicalName,
        category: item.category,
        media_asset_id: mediaAssetId,
        description: item.description,
        ...(aliases ? { aliases } : {}),
        status: "active",
      },
      { onConflict: "canonical_name" },
    );

  if (error) {
    throw new Error(`asset_library upsert failed for ${item.canonicalName}: ${error.message}`);
  }
}

async function uploadStorageObject(
  supabase: ReturnType<typeof createClient<Database>>,
  item: SeedItem,
) {
  const { error } = await supabase.storage
    .from(REFERENCE_IMAGES_BUCKET)
    .upload(item.storagePath, item.buffer, {
      contentType: "image/png",
      upsert: true,
    });

  if (error) {
    throw new Error(
      `storage upload failed for ${item.canonicalName}: ${error.message}`,
    );
  }
}

async function seedOne(
  supabase: ReturnType<typeof createClient<Database>>,
  item: SeedItem,
  summary: SeedSummary,
) {
  try {
    const wasExisting = Boolean(
      await findExistingLibraryMediaAssetId(supabase, item.storagePath),
    );

    await uploadStorageObject(supabase, item);
    const mediaAssetId = await upsertLibraryMediaAsset(supabase, item);
    await upsertAssetLibraryRow(supabase, item, mediaAssetId);

    if (wasExisting) {
      summary.refreshed += 1;
    } else {
      summary.uploaded += 1;
    }
    console.log(
      `  ${wasExisting ? "↻" : "+"} ${item.category.padEnd(22)} ${item.canonicalName}`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    summary.failures.push({ canonicalName: item.canonicalName, error: message });
    console.error(`  ✗ ${item.canonicalName}: ${message}`);
  }
}

async function main() {
  const { url, secretKey } = getSupabaseConfig();
  const sourceDir = resolveLibrarySourceDir();

  console.log(`Asset library source: ${sourceDir}`);
  console.log(`Supabase URL:         ${url}`);
  console.log();

  const supabase = createClient<Database>(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const items = await collectSeedItems(sourceDir);
  if (items.length === 0) {
    console.warn("No PNG files found under the source directory. Nothing to seed.");
    process.exit(1);
  }

  console.log(`Found ${items.length} asset${items.length === 1 ? "" : "s"} to upsert.`);
  console.log();

  const summary: SeedSummary = { uploaded: 0, refreshed: 0, failures: [] };
  for (const item of items) {
    await seedOne(supabase, item, summary);
  }

  console.log();
  console.log("Summary:");
  console.log(`  uploaded:  ${summary.uploaded}`);
  console.log(`  refreshed: ${summary.refreshed}`);
  console.log(`  failures:  ${summary.failures.length}`);
  if (summary.failures.length > 0) {
    for (const failure of summary.failures) {
      console.log(`    - ${failure.canonicalName}: ${failure.error}`);
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error("Seed failed:", error);
  process.exit(1);
});
