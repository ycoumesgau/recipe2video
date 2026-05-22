import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  listSegmentsByVideoId,
  updateSegmentPrompts,
  updateSegmentReferences,
} from "@/modules/storyboard/repositories/segment.repository";

import {
  getAssetLibraryById,
  type AssetLibraryEntry,
} from "../repositories/asset-library.repository";
import type { ReferenceAsset } from "../reference.types";
import {
  deleteReferenceAsset,
  getReferenceAssetById,
  listReferenceAssetsForVideo,
  updateReferenceAssetConditioning,
} from "../repositories/reference.repository";
import {
  listSegmentReferencesForVideo,
  replaceSegmentReferencesForSegments,
  type SegmentReferenceLink,
} from "../repositories/segment-references.repository";
import {
  buildSourceMatchable,
  buildSubstituteTargetIdentity,
  collectPromptReplacementTags,
  parseSubstituteTargetPickerKey,
  replaceReferenceTokensInPrompt,
  segmentDeclaresSourceReference,
  substituteConditioningNames,
  transformDeclaredSegmentReferences,
  transformSegmentReferenceMappings,
} from "./substitute-reference-asset.logic";

export type {
  SubstituteTargetIdentity,
} from "./substitute-reference-asset.logic";
export {
  buildSourceMatchable,
  buildSubstituteTargetIdentity,
  collectPromptReplacementTags,
  parseSubstituteTargetPickerKey,
  replaceReferenceTokensInPrompt,
  segmentDeclaresSourceReference,
  substituteConditioningNames,
  transformDeclaredSegmentReferences,
  transformSegmentReferenceMappings,
} from "./substitute-reference-asset.logic";

export interface SubstituteReferenceAssetInput {
  videoId: string;
  sourceReferenceId: string;
  targetPickerKey: string;
}

export interface SubstituteReferenceAssetResult {
  sourceCanonicalName: string;
  targetLabel: string;
  segmentsUpdated: number;
  linksRewired: number;
  linksRemovedAsDuplicate: number;
  conditioningRowsUpdated: number;
}

/**
 * Replace a recipe-specific reference with a library global or another
 * recipe reference. Rewires `segment_references`, updates declared
 * `segments.references`, rewrites Seedance prompts, refreshes conditioning
 * lists on sibling references, then deletes the source row (no duplicate
 * when the target was already wired).
 */
export async function substituteReferenceAsset(
  supabase: SupabaseDataClient,
  input: SubstituteReferenceAssetInput,
): Promise<SubstituteReferenceAssetResult> {
  const source = await getReferenceAssetById(supabase, input.sourceReferenceId);
  if (!source || source.videoId !== input.videoId) {
    throw new Error("Source reference was not found for this project.");
  }

  const { libraryAssetId, recipeReferenceId } = parseSubstituteTargetPickerKey(
    input.targetPickerKey,
  );

  if (recipeReferenceId === source.id) {
    throw new Error("Cannot substitute a reference with itself.");
  }

  const target =
    libraryAssetId != null
      ? await resolveLibraryTarget(supabase, libraryAssetId)
      : await resolveRecipeTarget(supabase, input.videoId, recipeReferenceId!);

  const sourceMatchable = buildSourceMatchable(source);
  const targetIdentity = buildSubstituteTargetIdentity(target);
  const promptReplacements = collectPromptReplacementTags(
    sourceMatchable,
    targetIdentity.runwayTag,
  );

  const [segments, segmentLinks, recipeReferences] = await Promise.all([
    listSegmentsByVideoId(supabase, input.videoId),
    listSegmentReferencesForVideo(supabase, input.videoId),
    listReferenceAssetsForVideo(supabase, input.videoId),
  ]);

  const linksBySegment = groupLinksBySegment(segmentLinks);
  const affectedSegmentIds = new Set<string>();

  for (const link of segmentLinks) {
    if (link.recipeReferenceId === source.id) {
      affectedSegmentIds.add(link.segmentId);
    }
  }

  for (const segment of segments) {
    if (segmentDeclaresSourceReference(segment.references, sourceMatchable)) {
      affectedSegmentIds.add(segment.id);
    }
  }

  let linksRewired = 0;
  let linksRemovedAsDuplicate = 0;
  let segmentsUpdated = 0;

  for (const segmentId of affectedSegmentIds) {
    const segment = segments.find((candidate) => candidate.id === segmentId);
    if (!segment) {
      continue;
    }

    const segmentLinksForSegment = linksBySegment.get(segmentId) ?? [];
    const ensureTargetLink = segmentDeclaresSourceReference(
      segment.references,
      sourceMatchable,
    );

    const { mappings, linksRewired: rewired, linksRemovedAsDuplicate: removed } =
      transformSegmentReferenceMappings({
        links: segmentLinksForSegment,
        sourceReferenceId: source.id,
        target: targetIdentity,
        ensureTargetLink,
      });

    linksRewired += rewired;
    linksRemovedAsDuplicate += removed;

    const declaredReferences = transformDeclaredSegmentReferences(
      segment.references,
      sourceMatchable,
      targetIdentity,
    );

    const nextPrompt = replaceReferenceTokensInPrompt(
      segment.prompt,
      promptReplacements,
    );
    const nextPromptInitial = replaceReferenceTokensInPrompt(
      segment.promptInitial,
      promptReplacements,
    );

    if (mappings.length > 0) {
      await replaceSegmentReferencesForSegments(supabase, {
        segmentIds: [segmentId],
        mappings,
      });
    } else if (segmentLinksForSegment.some((link) => link.recipeReferenceId === source.id)) {
      await replaceSegmentReferencesForSegments(supabase, {
        segmentIds: [segmentId],
        mappings: [],
      });
    }

    const referencesChanged =
      JSON.stringify(declaredReferences) !== JSON.stringify(segment.references);
    const promptChanged =
      nextPrompt !== segment.prompt || nextPromptInitial !== segment.promptInitial;

    if (referencesChanged) {
      await updateSegmentReferences(supabase, segmentId, declaredReferences);
    }

    if (promptChanged) {
      await updateSegmentPrompts(supabase, segmentId, {
        prompt: nextPrompt,
        promptInitial: nextPromptInitial,
      });
    }

    if (referencesChanged || promptChanged || mappings.length > 0) {
      segmentsUpdated += 1;
    }
  }

  let conditioningRowsUpdated = 0;
  for (const reference of recipeReferences) {
    if (reference.id === source.id) {
      continue;
    }
    const requested = reference.conditioningCanonicalNames ?? [];
    const nextNames = substituteConditioningNames(
      requested,
      sourceMatchable,
      targetIdentity,
    );
    if (arraysEqual(requested, nextNames)) {
      continue;
    }
    await updateReferenceAssetConditioning(supabase, {
      referenceId: reference.id,
      conditioningCanonicalNames: nextNames,
    });
    conditioningRowsUpdated += 1;
  }

  await deleteReferenceAsset(supabase, source.id);

  return {
    sourceCanonicalName: source.canonicalName,
    targetLabel: targetIdentity.label,
    segmentsUpdated,
    linksRewired,
    linksRemovedAsDuplicate,
    conditioningRowsUpdated,
  };
}

async function resolveLibraryTarget(
  supabase: SupabaseDataClient,
  libraryAssetId: string,
): Promise<{ kind: "library"; entry: AssetLibraryEntry }> {
  const entry = await getAssetLibraryById(supabase, libraryAssetId);
  if (!entry) {
    throw new Error("Library reference was not found or is deprecated.");
  }
  if (!entry.mediaAssetId) {
    throw new Error(
      `Library reference '${entry.canonicalName}' has no media yet. Upload it on /library before substituting.`,
    );
  }
  return { kind: "library", entry };
}

async function resolveRecipeTarget(
  supabase: SupabaseDataClient,
  videoId: string,
  recipeReferenceId: string,
): Promise<{ kind: "recipe"; entry: ReferenceAsset }> {
  const entry = await getReferenceAssetById(supabase, recipeReferenceId);
  if (!entry || entry.videoId !== videoId) {
    throw new Error("Target recipe reference was not found for this project.");
  }
  if (entry.status === "rejected") {
    throw new Error("Cannot substitute with a rejected reference.");
  }
  return { kind: "recipe", entry };
}

function groupLinksBySegment(
  links: SegmentReferenceLink[],
): Map<string, SegmentReferenceLink[]> {
  const map = new Map<string, SegmentReferenceLink[]>();
  for (const link of links) {
    if (!map.has(link.segmentId)) {
      map.set(link.segmentId, []);
    }
    map.get(link.segmentId)!.push(link);
  }
  return map;
}

function arraysEqual(left: string[], right: string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}
