import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { getReferenceImageMediaAssetByRunwayTaskId } from "@/modules/media-assets/repositories/media-asset.repository";
import { getRunwayTask } from "@/modules/generation/services/runway.service";

import {
  getReferenceAssetById,
  updateReferenceAssetMedia,
  updateReferenceAssetStatus,
} from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";
import { buildReferenceImagePrompt } from "./build-reference-image-prompt";
import { finalizeReferenceImageOutput } from "./finalize-reference-image-output";
import { resolveConditioningAnchors } from "./resolve-conditioning-anchors";

export interface ReconcileStuckReferenceImageInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  requestedByUserId: string;
  runwayTaskIdOverride?: string;
}

export interface ReconcileStuckReferenceImageResult {
  referenceId: string;
  reconciled: boolean;
  action?: string;
  reason?: string;
  reference?: ReferenceAsset;
}

/**
 * Unstick a recipe reference left in `generating` after Runway succeeded but
 * `persistReferenceOutput` failed (or never ran). Also clears poll fields and
 * points `media_asset_id` at the variant for the latest Runway task.
 */
export async function reconcileStuckReferenceImage(
  input: ReconcileStuckReferenceImageInput,
): Promise<ReconcileStuckReferenceImageResult> {
  const reference = await getReferenceAssetById(
    input.supabase,
    input.referenceId,
  );

  if (!reference) {
    throw new Error(`Reference ${input.referenceId} not found.`);
  }

  if (reference.status !== "generating") {
    return {
      referenceId: input.referenceId,
      reconciled: false,
      reason: `Reference status is ${reference.status}, not generating.`,
    };
  }

  const runwayTaskId =
    input.runwayTaskIdOverride ??
    reference.runwayTaskId ??
    undefined;

  if (!runwayTaskId) {
    await updateReferenceAssetStatus(input.supabase, {
      referenceId: input.referenceId,
      status: "failed",
    });
    return {
      referenceId: input.referenceId,
      reconciled: true,
      action: "marked_failed_missing_task_id",
    };
  }

  const pollShowsSucceeded = reference.runwayTaskStatus === "SUCCEEDED";
  const task = await getRunwayTask(runwayTaskId);
  const runwaySucceeded =
    task.status === "SUCCEEDED" || pollShowsSucceeded;

  if (!runwaySucceeded) {
    if (task.status === "FAILED" || task.status === "CANCELLED") {
      await updateReferenceAssetStatus(input.supabase, {
        referenceId: input.referenceId,
        status: "failed",
      });
      return {
        referenceId: input.referenceId,
        reconciled: true,
        action: "marked_failed_runway_terminal",
        reason: `Runway task is ${task.status}.`,
      };
    }

    return {
      referenceId: input.referenceId,
      reconciled: false,
      reason: `Runway task is still ${task.status}; nothing to reconcile yet.`,
    };
  }

  const existingMedia = await getReferenceImageMediaAssetByRunwayTaskId(
    input.supabase,
    {
      videoId: reference.videoId!,
      referenceId: input.referenceId,
      runwayTaskId,
    },
  );

  if (existingMedia) {
    const updated = await updateReferenceAssetMedia(input.supabase, {
      referenceId: input.referenceId,
      mediaAssetId: existingMedia.id,
      status: "generated",
      clearRunwayUri: true,
    });
    return {
      referenceId: input.referenceId,
      reconciled: true,
      action: "linked_existing_media_for_task",
      reference: updated,
    };
  }

  const outputUrl = task.output?.[0];
  if (!outputUrl) {
    return {
      referenceId: input.referenceId,
      reconciled: false,
      reason:
        "Runway reports success but no output URL; cannot finalize automatically.",
    };
  }

  const resolution = await resolveConditioningAnchors(
    input.supabase,
    reference.conditioningCanonicalNames ?? [],
  );
  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: reference.prompt ?? "",
    anchors: resolution.anchors,
  });

  const updated = await finalizeReferenceImageOutput({
    supabase: input.supabase,
    referenceId: input.referenceId,
    runwayTaskId,
    referenceVariantId: runwayTaskId,
    outputUrl,
    requestedByUserId: input.requestedByUserId,
    promptText,
    anchors: resolution.anchors,
    unresolvedAnchorNames: resolution.unresolvedNames,
    excludedAnchors: resolution.excludedAnchors,
    recovery: true,
  });

  return {
    referenceId: input.referenceId,
    reconciled: true,
    action: "finalized_from_runway_output",
    reference: updated,
  };
}
