import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getSegmentById,
  updateSegmentReferences,
} from "@/modules/storyboard/repositories/segment.repository";
import type { SegmentReference, SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import { getAssetLibraryById } from "../repositories/asset-library.repository";
import { getReferenceAssetById } from "../repositories/reference.repository";
import {
  replaceSegmentReferencesForSegments,
  type SegmentReferenceMapping,
} from "../repositories/segment-references.repository";
import {
  assertSegmentReferenceDraftsAreValid,
  normalizeSegmentReferenceDraft,
  type SegmentReferenceDraftInput,
} from "./segment-reference-drafts";

export type { SegmentReferenceDraftInput } from "./segment-reference-drafts";
export { parseSegmentReferenceDraftsJson } from "./segment-reference-drafts";

export interface UpdateSegmentReferencesInput {
  videoId: string;
  segmentId: string;
  references: SegmentReferenceDraftInput[];
}

/**
 * Replace the segment's Runway/Seedance reference wiring (`segment_references`
 * rows and the parallel `segments.references` JSON declaration). Used by the
 * segment review page so operators can fix links without re-running the agent.
 */
export async function updateSegmentReferencesForSegment(
  supabase: SupabaseDataClient,
  input: UpdateSegmentReferencesInput,
): Promise<SeedanceSegment> {
  const segment = await getSegmentById(supabase, input.segmentId);
  if (!segment || segment.videoId !== input.videoId) {
    throw new Error("Segment was not found for this project.");
  }

  const drafts = input.references.map(normalizeSegmentReferenceDraft);
  assertSegmentReferenceDraftsAreValid(drafts);

  const libraryIds = unique(
    drafts
      .map((draft) => draft.libraryAssetId)
      .filter((id): id is string => Boolean(id)),
  );
  const recipeIds = unique(
    drafts
      .map((draft) => draft.recipeReferenceId)
      .filter((id): id is string => Boolean(id)),
  );

  const [libraryEntries, recipeEntries] = await Promise.all([
    Promise.all(libraryIds.map((id) => getAssetLibraryById(supabase, id))),
    Promise.all(recipeIds.map((id) => getReferenceAssetById(supabase, id))),
  ]);

  const libraryById = new Map(
    libraryEntries
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => [entry.id, entry]),
  );
  const recipeById = new Map(
    recipeEntries
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      .map((entry) => [entry.id, entry]),
  );

  for (const draft of drafts) {
    if (draft.libraryAssetId) {
      const entry = libraryById.get(draft.libraryAssetId);
      if (!entry) {
        throw new Error(
          `Library reference ${draft.libraryAssetId} was not found or is deprecated.`,
        );
      }
      if (!entry.mediaAssetId) {
        throw new Error(
          `Library reference '${entry.canonicalName}' has no media yet. Upload it on /library before wiring it to a segment.`,
        );
      }
      continue;
    }

    const recipe = recipeById.get(draft.recipeReferenceId!);
    if (!recipe) {
      throw new Error(`Recipe reference ${draft.recipeReferenceId} was not found.`);
    }
    if (recipe.videoId !== input.videoId) {
      throw new Error(
        `Recipe reference '${recipe.canonicalName}' does not belong to this project.`,
      );
    }
  }

  const declaredReferences: SegmentReference[] = [];
  const mappings: SegmentReferenceMapping[] = [];

  drafts.forEach((draft, position) => {
    if (draft.libraryAssetId) {
      const entry = libraryById.get(draft.libraryAssetId)!;
      const label = entry.aliases[0] ?? entry.canonicalName;
      declaredReferences.push({
        role: draft.role,
        name: entry.canonicalName,
        label,
        required: draft.required,
        runwayUri: null,
        mediaAssetId: null,
      });
      mappings.push({
        segmentId: segment.id,
        libraryAssetId: entry.id,
        recipeReferenceId: null,
        role: draft.role,
        position,
        required: draft.required,
      });
      return;
    }

    const recipe = recipeById.get(draft.recipeReferenceId!)!;
    declaredReferences.push({
      role: draft.role,
      name: recipe.canonicalName,
      label: recipe.canonicalName,
      required: draft.required,
      runwayUri: null,
      mediaAssetId: null,
    });
    mappings.push({
      segmentId: segment.id,
      libraryAssetId: null,
      recipeReferenceId: recipe.id,
      role: draft.role,
      position,
      required: draft.required,
    });
  });

  await replaceSegmentReferencesForSegments(supabase, {
    segmentIds: [segment.id],
    mappings,
  });

  return updateSegmentReferences(supabase, segment.id, declaredReferences);
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}
