import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import {
  replaceSegmentReferencesForSegments,
  type SegmentReferenceMapping,
} from "@/modules/references/repositories/segment-references.repository";
import {
  buildOutroPrompt,
  buildOutroReferences,
  LICORN_OUTRO_ARC,
  LICORN_OUTRO_DURATION_SECONDS,
  LICORN_OUTRO_REFERENCE_NAMES,
} from "../services/seedance-outro-template";
import {
  getSegmentById,
  listSegmentsByVideoId,
  rewriteSegmentForOutroOverride,
} from "../repositories/segment.repository";
import type { SeedanceSegment } from "../storyboard.types";

const REQUIRED_LIBRARY_REFERENCES: ReadonlyArray<{ canonicalName: string; role: string }> = [
  {
    canonicalName: LICORN_OUTRO_REFERENCE_NAMES.kitchenLayoutContextWide,
    role: "structural kitchen context",
  },
  {
    canonicalName: LICORN_OUTRO_REFERENCE_NAMES.kitchenIslandDefault,
    role: "active hero island view",
  },
  {
    canonicalName: LICORN_OUTRO_REFERENCE_NAMES.licornOutroVideo,
    role: "Licorn celebration motion reference",
  },
  {
    canonicalName: LICORN_OUTRO_REFERENCE_NAMES.characterSheet,
    role: "Licorn character identity lock",
  },
];

export interface ApplyStandardOutroResult {
  segment: SeedanceSegment;
  finalDishDescription: string;
}

/**
 * Backfill the standardized Licorn outro on an existing segment.
 *
 * Validates that the target segment is the highest-positioned segment
 * of its video (so we never accidentally rewrite a creative middle
 * segment), resolves the 4 library references and the recipe-specific
 * `FinalDishVisual` row, then rewrites the segment's prompt, references,
 * duration, arc, and status. The segment's status is reset to
 * `pending` so the operator decides explicitly when to spend the ~200
 * Runway credits required to regenerate.
 *
 * Throws an actionable error when:
 *   - the segment is not the last segment of its video;
 *   - any of the 4 library references is missing or has no media;
 *   - the recipe-specific `FinalDishVisual` reference is missing or has
 *     no `prompt` field describing the dish.
 */
export async function applyStandardOutroToSegment(
  supabase: SupabaseDataClient,
  input: { segmentId: string },
): Promise<ApplyStandardOutroResult> {
  const segment = await getSegmentById(supabase, input.segmentId);
  if (!segment) {
    throw new Error(`Segment ${input.segmentId} was not found.`);
  }

  const allSegments = await listSegmentsByVideoId(supabase, segment.videoId);
  const lastSegment = [...allSegments].sort((a, b) => b.position - a.position)[0];
  if (!lastSegment || lastSegment.id !== segment.id) {
    throw new Error(
      `Apply standard outro is only available on the last segment of a video (highest position). This segment is at position ${segment.position}; the last is at position ${lastSegment?.position ?? "unknown"}.`,
    );
  }

  const finalDishReference = await findFinalDishReference(supabase, segment.videoId);
  if (!finalDishReference) {
    throw new Error(
      `Cannot apply the standard outro: no recipe-specific 'FinalDishVisual' reference is registered for this video. Add a FinalDishVisual reference (with a single-sentence dish description in its prompt) on the references page first.`,
    );
  }
  if (!finalDishReference.prompt || finalDishReference.prompt.trim().length === 0) {
    throw new Error(
      `Cannot apply the standard outro: the FinalDishVisual reference has no description. Open the reference and fill in a single-sentence prompt describing the finished dish, then retry.`,
    );
  }

  const libraryByName = await findAssetLibraryByCanonicalNames(
    supabase,
    REQUIRED_LIBRARY_REFERENCES.map((entry) => entry.canonicalName),
  );

  const missingLibrary: string[] = [];
  const libraryMappings: SegmentReferenceMapping[] = [];
  let position = 0;
  for (const entry of REQUIRED_LIBRARY_REFERENCES) {
    const libraryEntry = libraryByName.get(entry.canonicalName);
    if (!libraryEntry || !libraryEntry.mediaAssetId) {
      missingLibrary.push(entry.canonicalName);
      continue;
    }
    libraryMappings.push({
      segmentId: segment.id,
      libraryAssetId: libraryEntry.id,
      recipeReferenceId: null,
      role: entry.role,
      position,
      required: true,
    });
    position += 1;
  }

  if (missingLibrary.length > 0) {
    throw new Error(
      `Cannot apply the standard outro: the following library references are missing or unlinked to a media_asset: ${missingLibrary.join(", ")}. Run scripts/seed-asset-library.ts and scripts/upload-outro-asset.ts before retrying.`,
    );
  }

  const finalDishDescription = finalDishReference.prompt.trim();
  const prompt = buildOutroPrompt({ finalDishDescription });
  const references = buildOutroReferences();

  const outroMappings: SegmentReferenceMapping[] = [
    ...libraryMappings,
    {
      segmentId: segment.id,
      libraryAssetId: null,
      recipeReferenceId: finalDishReference.id,
      role: "finished dish identity",
      position,
      required: true,
    },
  ];

  await replaceSegmentReferencesForSegments(supabase, {
    segmentIds: [segment.id],
    mappings: outroMappings,
  });

  const updatedSegment = await rewriteSegmentForOutroOverride(supabase, segment.id, {
    prompt,
    promptInitial: prompt,
    references,
    durationTarget: LICORN_OUTRO_DURATION_SECONDS,
    arc: LICORN_OUTRO_ARC,
    status: "pending",
  });

  return { segment: updatedSegment, finalDishDescription };
}

async function findFinalDishReference(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<{ id: string; prompt: string | null } | null> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("id, prompt")
    .eq("video_id", videoId)
    .eq("canonical_name", LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual)
    .maybeSingle();

  if (error) {
    throw new Error(
      `findFinalDishReference failed for video ${videoId}: ${error.message}`,
    );
  }
  return data ?? null;
}
