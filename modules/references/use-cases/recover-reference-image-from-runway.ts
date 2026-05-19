import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getRunwayTask,
} from "@/modules/generation/services/runway.service";

import { getReferenceAssetById } from "../repositories/reference.repository";
import type { ReferenceAsset } from "../reference.types";
import { buildReferenceImagePrompt } from "./build-reference-image-prompt";
import { finalizeReferenceImageOutput } from "./finalize-reference-image-output";
import {
  resolveConditioningAnchors,
} from "./resolve-conditioning-anchors";

export interface RecoverReferenceImageFromRunwayInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  requestedByUserId: string;
  /**
   * When set, poll this Runway task instead of `reference.runwayTaskId`.
   * Useful when the DB row lost the task id but cost_logs still have it.
   */
  runwayTaskIdOverride?: string;
  dryRun?: boolean;
}

export interface RecoverReferenceImageFromRunwayResult {
  referenceId: string;
  runwayTaskId: string;
  runwayStatus: string;
  recovered: boolean;
  reason?: string;
  reference?: ReferenceAsset;
}

/**
 * Finalize a reference whose Runway `text_to_image` task already succeeded
 * but was never persisted (timeout, crashed worker, etc.).
 */
export async function recoverReferenceImageFromRunway(
  input: RecoverReferenceImageFromRunwayInput,
): Promise<RecoverReferenceImageFromRunwayResult> {
  const reference = await getReferenceAssetById(
    input.supabase,
    input.referenceId,
  );

  if (!reference) {
    throw new Error(`Reference ${input.referenceId} not found.`);
  }

  const runwayTaskId =
    input.runwayTaskIdOverride ?? reference.runwayTaskId ?? undefined;

  if (!runwayTaskId) {
    return {
      referenceId: input.referenceId,
      runwayTaskId: "",
      runwayStatus: "missing_task_id",
      recovered: false,
      reason: "No runway_task_id on the reference row.",
    };
  }

  if (reference.mediaAssetId) {
    return {
      referenceId: input.referenceId,
      runwayTaskId,
      runwayStatus: "already_persisted",
      recovered: false,
      reason: `Reference already has media_asset_id ${reference.mediaAssetId}.`,
    };
  }

  const task = await getRunwayTask(runwayTaskId);

  if (task.status !== "SUCCEEDED") {
    return {
      referenceId: input.referenceId,
      runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: `Runway task is ${task.status}, not SUCCEEDED.`,
    };
  }

  const outputUrl = task.output?.[0];
  if (!outputUrl) {
    return {
      referenceId: input.referenceId,
      runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: "Runway task succeeded but returned no output URL.",
    };
  }

  if (input.dryRun) {
    return {
      referenceId: input.referenceId,
      runwayTaskId,
      runwayStatus: task.status,
      recovered: false,
      reason: "dry_run: would persist output.",
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
    runwayTaskId,
    runwayStatus: task.status,
    recovered: true,
    reference: updated,
  };
}
