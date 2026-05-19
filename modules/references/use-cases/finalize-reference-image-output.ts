import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  downloadRunwayOutput,
} from "@/modules/generation/services/runway.service";
import {
  RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
} from "@/modules/generation/runway.constants";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";

import {
  getReferenceAssetById,
  updateReferenceAssetMedia,
} from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";
import type { ConditioningAnchor } from "./resolve-conditioning-anchors";

const REFERENCE_IMAGE_MODEL = "gpt_image_2";

export interface FinalizeReferenceImageOutputInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  runwayTaskId: string;
  outputUrl: string;
  requestedByUserId: string;
  promptText: string;
  anchors?: ConditioningAnchor[];
  unresolvedAnchorNames?: string[];
  excludedAnchors?: Array<{
    canonicalName: string;
    requestedName: string;
    category: string;
  }>;
  recovery?: boolean;
}

/**
 * Download a succeeded Runway `text_to_image` output, persist it to Supabase
 * Storage, link the `reference_assets` row, and log the success cost entry.
 * Shared by the Inngest persist workflow and one-off recovery scripts.
 */
export async function finalizeReferenceImageOutput(
  input: FinalizeReferenceImageOutputInput,
): Promise<ReferenceAsset> {
  const reference = await getReferenceAssetById(
    input.supabase,
    input.referenceId,
  );

  if (!reference) {
    throw new Error(`Reference ${input.referenceId} not found.`);
  }

  if (!reference.videoId) {
    throw new Error(
      `Reference ${input.referenceId} is not bound to a video; cannot persist its media asset.`,
    );
  }

  const anchors = input.anchors ?? [];
  const blob = await downloadRunwayOutput(input.outputUrl);
  const referenceVariantId = crypto.randomUUID();

  const mediaAsset = await persistMediaAssetFile({
    supabase: input.supabase,
    type: "reference_image",
    provider: "runway",
    body: blob,
    videoId: reference.videoId,
    referenceId: input.referenceId,
    referenceVariantId,
    mimeType: blob.type || "image/png",
    fileSizeBytes: blob.size,
    runwayOutputUrl: input.outputUrl,
    metadata: {
      source: input.recovery
        ? "runway_text_to_image_recovery"
        : "runway_text_to_image",
      referenceId: input.referenceId,
      referenceVariantId,
      recovery: input.recovery ?? false,
      runwayTaskId: input.runwayTaskId,
      model: REFERENCE_IMAGE_MODEL,
      ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
      prompt: input.promptText,
      conditioningAnchors: anchors.map((anchor) => ({
        canonicalName: anchor.canonicalName,
        tag: anchor.tag,
        requestedName: anchor.requestedName,
      })),
      conditioningUnresolved: input.unresolvedAnchorNames ?? [],
      conditioningExcluded: input.excludedAnchors ?? [],
    },
    createdBy: input.requestedByUserId,
  });

  const updated = await updateReferenceAssetMedia(input.supabase, {
    referenceId: input.referenceId,
    mediaAssetId: mediaAsset.id,
    status: "generated",
    clearRunwayUri: true,
  });

  await logCost(input.supabase, {
    videoId: reference.videoId,
    segmentId: null,
    provider: "runway",
    model: REFERENCE_IMAGE_MODEL,
    operation: input.recovery
      ? "reference_image_generation_recovered"
      : "reference_image_generation_succeeded",
    creditsUsed: null,
    metadata: {
      referenceId: input.referenceId,
      runwayTaskId: input.runwayTaskId,
      mediaAssetId: mediaAsset.id,
      conditioningAnchorCount: anchors.length,
      recovery: input.recovery ?? false,
    },
    createdBy: input.requestedByUserId,
  });

  return updated;
}
