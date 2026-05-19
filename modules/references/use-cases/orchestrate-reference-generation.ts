import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  RUNWAY_MAX_REFERENCE_BYTES,
  RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
} from "@/modules/generation/runway.constants";
import { startReferenceImageGeneration } from "@/modules/generation/services/runway.service";

import { getReferenceAssetById } from "../repositories/reference.repository";
import type { ReferenceStatus } from "../reference-status";
import { buildReferenceImagePrompt } from "./build-reference-image-prompt";
import { finalizeReferenceImageOutput } from "./finalize-reference-image-output";
import {
  resolveConditioningAnchors,
  type ConditioningAnchor,
} from "./resolve-conditioning-anchors";

export type { ReferenceGenerationPollRequestedData } from "./reference-image-poll-workflow";
export { pollReferenceImageGenerationWorkflow } from "./reference-image-poll-workflow";

const REFERENCE_IMAGE_MODEL = "gpt_image_2";
const DEFAULT_POLL_DELAY_SECONDS = 6;

interface WorkflowAuthData {
  requestedByUserId: string;
  isAllowlisted?: boolean;
}

export interface ReferenceGenerationRequestedData extends WorkflowAuthData {
  referenceId: string;
  videoId: string;
  /**
   * When true, the persist step emits `reference.generation.completed` so a
   * batch workflow can `waitForEvent` before starting the next reference or
   * flipping project status.
   */
  awaitCompletionEvent?: boolean;
}

export interface ReferenceOutputPersistRequestedData extends WorkflowAuthData {
  referenceId: string;
  taskId: string;
  outputUrl: string;
  videoId: string;
  awaitCompletionEvent?: boolean;
}

export interface ReferenceGenerationCompletedData {
  referenceId: string;
  videoId: string;
  status: "generated" | "failed";
}

interface ReferenceWorkflowBaseDeps {
  sendEvent(event: {
    name: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

export interface RequestReferenceGenerationDeps
  extends ReferenceWorkflowBaseDeps {
  prepareReferenceGeneration(
    referenceId: string,
  ): Promise<PreparedReferenceGeneration>;
  updateReferenceAssetStatus(
    referenceId: string,
    status: ReferenceStatus,
  ): Promise<void>;
  logCost(input: Parameters<typeof logCost>[1]): Promise<unknown>;
}

export interface PersistReferenceOutputDeps {
  prepareReferenceGeneration(
    referenceId: string,
  ): Promise<PreparedReferenceGeneration>;
  finalizeReferenceOutput(
    input: Parameters<typeof finalizeReferenceImageOutput>[0],
  ): Promise<Awaited<ReturnType<typeof finalizeReferenceImageOutput>>>;
  sendEvent?(event: {
    name: string;
    data: Record<string, unknown>;
  }): Promise<void>;
}

export interface PreparedReferenceGeneration {
  referenceId: string;
  videoId: string;
  promptText: string;
  anchors: ConditioningAnchor[];
  unresolvedAnchorNames: string[];
  excludedAnchors: Array<{
    canonicalName: string;
    requestedName: string;
    category: string;
  }>;
}

export async function prepareReferenceImageGeneration(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<PreparedReferenceGeneration> {
  const reference = await getReferenceAssetById(supabase, referenceId);

  if (!reference) {
    throw new Error(`Reference ${referenceId} not found.`);
  }

  if (!reference.prompt || reference.prompt.trim().length === 0) {
    throw new Error(
      `Reference ${referenceId} has no prompt; manual upload is required.`,
    );
  }

  if (!reference.videoId) {
    throw new Error(
      `Reference ${referenceId} is not bound to a video; cannot persist its media asset.`,
    );
  }

  const resolution = await resolveConditioningAnchors(
    supabase,
    reference.conditioningCanonicalNames ?? [],
  );
  assertConditioningAnchorsUnderRunwaySizeLimit(
    referenceId,
    resolution.anchors,
  );

  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: reference.prompt,
    anchors: resolution.anchors,
  });

  return {
    referenceId,
    videoId: reference.videoId,
    promptText,
    anchors: resolution.anchors,
    unresolvedAnchorNames: resolution.unresolvedNames,
    excludedAnchors: resolution.excludedAnchors,
  };
}

export async function requestReferenceImageGenerationWorkflow(
  data: ReferenceGenerationRequestedData,
  deps: RequestReferenceGenerationDeps,
): Promise<{ runwayTaskId: string }> {
  const prepared = await deps.prepareReferenceGeneration(data.referenceId);

  if (prepared.videoId !== data.videoId) {
    throw new Error(
      `Reference ${data.referenceId} belongs to video ${prepared.videoId}, not ${data.videoId}.`,
    );
  }

  await deps.updateReferenceAssetStatus(data.referenceId, "generating");

  const task = await startReferenceImageGeneration({
    promptText: prepared.promptText,
    ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
    model: REFERENCE_IMAGE_MODEL,
    referenceImages:
      prepared.anchors.length > 0
        ? prepared.anchors.map((anchor) => ({
            uri: anchor.uri,
            tag: anchor.tag,
          }))
        : undefined,
  });

  await deps.logCost({
    videoId: prepared.videoId,
    segmentId: null,
    provider: "runway",
    model: REFERENCE_IMAGE_MODEL,
    operation: "reference_image_generation_started",
    creditsUsed: null,
    metadata: {
      referenceId: data.referenceId,
      runwayTaskId: task.id,
      endpoint: task.endpoint,
      estimated: true,
      ratio: RUNWAY_RECIPE_REFERENCE_IMAGE_RATIO,
      conditioningResolvedTags: prepared.anchors.map((anchor) => anchor.tag),
      conditioningUnresolved: prepared.unresolvedAnchorNames,
      conditioningExcluded: prepared.excludedAnchors,
    },
    createdBy: data.requestedByUserId,
  });

  const pollStartedAt = new Date().toISOString();
  await deps.sendEvent({
    name: "reference.generation.poll.requested",
    data: {
      referenceId: data.referenceId,
      taskId: task.id,
      videoId: data.videoId,
      requestedByUserId: data.requestedByUserId,
      isAllowlisted: true,
      nextPollDelaySeconds: DEFAULT_POLL_DELAY_SECONDS,
      pollStartedAt,
      awaitCompletionEvent: data.awaitCompletionEvent ?? false,
    },
  });

  return { runwayTaskId: task.id };
}

export async function persistReferenceImageOutputWorkflow(
  data: ReferenceOutputPersistRequestedData,
  deps: PersistReferenceOutputDeps,
): Promise<{ referenceId: string }> {
  const prepared = await deps.prepareReferenceGeneration(data.referenceId);

  if (prepared.videoId !== data.videoId) {
    throw new Error(
      `Reference ${data.referenceId} belongs to video ${prepared.videoId}, not ${data.videoId}.`,
    );
  }

  await deps.finalizeReferenceOutput({
    referenceId: data.referenceId,
    runwayTaskId: data.taskId,
    outputUrl: data.outputUrl,
    requestedByUserId: data.requestedByUserId,
    promptText: prepared.promptText,
    anchors: prepared.anchors,
    unresolvedAnchorNames: prepared.unresolvedAnchorNames,
    excludedAnchors: prepared.excludedAnchors,
  });

  if (deps.sendEvent && data.awaitCompletionEvent) {
    await deps.sendEvent({
      name: "reference.generation.completed",
      data: {
        referenceId: data.referenceId,
        videoId: data.videoId,
        status: "generated",
      },
    });
  }

  return { referenceId: data.referenceId };
}

function assertConditioningAnchorsUnderRunwaySizeLimit(
  referenceId: string,
  anchors: ConditioningAnchor[],
) {
  const oversize = anchors.filter(
    (anchor) => anchor.fileSizeBytes > RUNWAY_MAX_REFERENCE_BYTES,
  );

  if (oversize.length === 0) {
    return;
  }

  const limitMb = (RUNWAY_MAX_REFERENCE_BYTES / (1024 * 1024)).toFixed(1);
  const details = oversize
    .map((anchor) => {
      const sizeMb = (anchor.fileSizeBytes / (1024 * 1024)).toFixed(2);
      const mime = anchor.mimeType ? ` ${anchor.mimeType}` : "";
      return `${anchor.canonicalName} (@${anchor.tag}, ${sizeMb}MB${mime})`;
    })
    .join(", ");

  throw new Error(
    `Reference ${referenceId} has conditioning anchor(s) above Runway's ${limitMb}MB-per-asset limit: ${details}. Re-encode the library asset(s) before regenerating.`,
  );
}
