import type { CreateCostLogInput } from "@/modules/costs/cost.types";
import { refundRunwayReferenceImageCost } from "@/modules/costs/refund-runway-generation-cost";
import { normalizeRunwayProgress } from "@/modules/generation/runway-progress-normalize";
import type { RunwayTaskStatus } from "@/modules/generation/runway.types";

import type { ReferenceStatus } from "../reference-status";

/** Wall-clock budget for polling a single reference image task. */
export const REFERENCE_IMAGE_MAX_POLL_DURATION_MS = 15 * 60 * 1000;

export interface ReferenceGenerationPollRequestedData {
  referenceId: string;
  taskId: string;
  videoId: string;
  requestedByUserId: string;
  isAllowlisted?: boolean;
  nextPollDelaySeconds?: number;
  pollStartedAt: string;
  awaitCompletionEvent?: boolean;
}

export interface ReferenceWorkflowEvent {
  name:
    | "reference.generation.poll.requested"
    | "reference.output.persist.requested"
    | "reference.generation.completed";
  data: Record<string, unknown>;
}

export interface PollReferenceGenerationDeps {
  getReferenceAssetById(referenceId: string): Promise<{
    id: string;
    videoId: string | null;
  } | null>;
  getRunwayTask(taskId: string): Promise<RunwayTaskStatus>;
  updateReferenceAssetRunwayPollState(input: {
    referenceId: string;
    runwayTaskId: string;
    runwayTaskStatus: string;
    runwayProgress: number | null;
  }): Promise<void>;
  updateReferenceAssetStatus(
    referenceId: string,
    status: ReferenceStatus,
  ): Promise<void>;
  sendEvent(event: ReferenceWorkflowEvent): Promise<void>;
  findReferenceStartCredits?(
    referenceId: string,
    runwayTaskId: string,
  ): Promise<number>;
  logCost?(input: CreateCostLogInput): Promise<unknown>;
}

export async function pollReferenceImageGenerationWorkflow(
  data: ReferenceGenerationPollRequestedData,
  deps: PollReferenceGenerationDeps,
): Promise<{ terminal: boolean; status: RunwayTaskStatus["status"] }> {
  const reference = await deps.getReferenceAssetById(data.referenceId);

  if (!reference) {
    throw new Error(`Reference ${data.referenceId} not found while polling.`);
  }

  if (hasExceededReferencePollBudget(data.pollStartedAt)) {
    await deps.updateReferenceAssetStatus(data.referenceId, "failed");
    await maybeRefundReferenceImageCost(deps, data, "FAILED");
    if (data.awaitCompletionEvent) {
      await deps.sendEvent({
        name: "reference.generation.completed",
        data: {
          referenceId: data.referenceId,
          videoId: data.videoId,
          status: "failed",
        },
      });
    }
    throw new Error(
      `Reference ${data.referenceId}: Runway task ${data.taskId} exceeded the ${REFERENCE_IMAGE_MAX_POLL_DURATION_MS / 60_000} minute poll budget.`,
    );
  }

  const task = await deps.getRunwayTask(data.taskId);
  const runwayProgress = normalizeRunwayProgress(task.progress, task.status);
  await deps.updateReferenceAssetRunwayPollState({
    referenceId: data.referenceId,
    runwayTaskId: data.taskId,
    runwayTaskStatus: task.status,
    runwayProgress,
  });

  if (task.status === "SUCCEEDED") {
    const outputUrl = task.output?.[0];
    if (!outputUrl) {
      await deps.updateReferenceAssetStatus(data.referenceId, "failed");
      if (data.awaitCompletionEvent) {
        await deps.sendEvent({
          name: "reference.generation.completed",
          data: {
            referenceId: data.referenceId,
            videoId: data.videoId,
            status: "failed",
          },
        });
      }
      throw new Error(
        `Reference ${data.referenceId}: Runway task ${data.taskId} succeeded without an output URL.`,
      );
    }

    await deps.sendEvent({
      name: "reference.output.persist.requested",
      data: {
        referenceId: data.referenceId,
        taskId: data.taskId,
        referenceVariantId: data.taskId,
        outputUrl,
        videoId: data.videoId,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
        awaitCompletionEvent: data.awaitCompletionEvent ?? false,
      },
    });

    return { terminal: true, status: task.status };
  }

  if (task.status === "FAILED" || task.status === "CANCELLED") {
    await deps.updateReferenceAssetStatus(data.referenceId, "failed");
    await maybeRefundReferenceImageCost(deps, data, task.status);
    if (data.awaitCompletionEvent) {
      await deps.sendEvent({
        name: "reference.generation.completed",
        data: {
          referenceId: data.referenceId,
          videoId: data.videoId,
          status: "failed",
        },
      });
    }
    return { terminal: true, status: task.status };
  }

  await deps.sendEvent({
    name: "reference.generation.poll.requested",
    data: {
      referenceId: data.referenceId,
      taskId: data.taskId,
      videoId: data.videoId,
      requestedByUserId: data.requestedByUserId,
      isAllowlisted: true,
      nextPollDelaySeconds: computeReferencePollDelaySeconds(task),
      pollStartedAt: data.pollStartedAt,
      awaitCompletionEvent: data.awaitCompletionEvent ?? false,
    },
  });

  return { terminal: false, status: task.status };
}

export function hasExceededReferencePollBudget(pollStartedAt: string) {
  const startedMs = Date.parse(pollStartedAt);
  if (!Number.isFinite(startedMs)) {
    return false;
  }
  return Date.now() - startedMs > REFERENCE_IMAGE_MAX_POLL_DURATION_MS;
}

async function maybeRefundReferenceImageCost(
  deps: PollReferenceGenerationDeps,
  data: ReferenceGenerationPollRequestedData,
  runwayTaskStatus: "FAILED" | "CANCELLED",
) {
  if (!deps.logCost || !deps.findReferenceStartCredits) {
    return;
  }

  const creditsToRefund = await deps.findReferenceStartCredits(
    data.referenceId,
    data.taskId,
  );

  if (creditsToRefund <= 0) {
    return;
  }

  await refundRunwayReferenceImageCost(deps.logCost, {
    videoId: data.videoId,
    referenceId: data.referenceId,
    runwayTaskId: data.taskId,
    creditsToRefund,
    runwayTaskStatus,
    createdBy: data.requestedByUserId,
  });
}

function computeReferencePollDelaySeconds(task: RunwayTaskStatus) {
  if (task.status === "THROTTLED") {
    return 25;
  }
  if (task.status === "PENDING") {
    return 15;
  }
  if (task.status === "RUNNING") {
    return 6;
  }
  return 8;
}
