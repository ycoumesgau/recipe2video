import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getRunwayTask } from "@/modules/generation/services/runway.service";
import { generateReferenceImage } from "@/modules/references/use-cases/generate-reference-image";
import { finalizeReferenceImageOutput } from "@/modules/references/use-cases/finalize-reference-image-output";
import {
  prepareReferenceImageGeneration,
  persistReferenceImageOutputWorkflow,
  type ReferenceOutputPersistRequestedData,
} from "@/modules/references/use-cases/orchestrate-reference-generation";
import {
  pollReferenceImageGenerationWorkflow,
  type ReferenceGenerationPollRequestedData,
} from "@/modules/references/use-cases/reference-image-poll-workflow";
import {
  getReferenceAssetById,
  listReferenceAssetsForVideo,
  updateReferenceAssetRunwayPollState,
  updateReferenceAssetStatus,
} from "@/modules/references/repositories/reference.repository";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type ReferencesGenerateRequestedData,
  type SingleReferenceGenerateRequestedData,
} from "../events";

/**
 * Status values that mean "this reference needs another GPT-Image 2 pass".
 *
 * `planned`: never generated (or recently re-marked planned by the agent).
 * `failed`: the previous Runway task errored or timed out; the operator
 * triggered a regen.
 *
 * `generating` is intentionally excluded so a concurrent click does not
 * stack two tasks. `generated` / `approved` / `rejected` / `uploaded_to_runway`
 * are excluded because the operator must explicitly opt in to overwriting
 * an image they already vetted (per-reference Regenerate button covers
 * that path through the singular event below).
 */
const PENDING_STATUSES = new Set(["planned", "failed"]);

const DEFAULT_POLL_DELAY_SECONDS = 6;

function referenceWorkflowSendEvent(
  workflowEvent: {
    name: string;
    data: Record<string, unknown>;
  },
) {
  return inngest.send({
    name: workflowEvent.name,
    data: workflowEvent.data,
  });
}

export const generateReferencesWorkflow = inngest.createFunction(
  {
    id: "generate-references-workflow",
    // No retry: each step calls Runway and persists media; rerunning would
    // re-spend credits and create orphan files. The user retries explicitly
    // via the references UI when needed.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoReferencesGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as ReferencesGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();
    const references = await listReferenceAssetsForVideo(supabase, data.videoId);

    const candidates = references.filter((reference) => {
      if (reference.videoId !== data.videoId) {
        return false;
      }
      if (!reference.prompt || reference.prompt.trim().length === 0) {
        return false;
      }
      if (data.generateAllMissing) {
        return PENDING_STATUSES.has(reference.status);
      }
      return reference.status === "planned";
    });

    if (candidates.length === 0) {
      if (data.flipStatusOnCompletion ?? !data.generateAllMissing) {
        await updateVideoProjectStatus(
          supabase,
          data.videoId,
          "references_ready",
        );
      }
      return { generatedCount: 0 };
    }

    let generatedCount = 0;
    const awaitCompletion = data.flipStatusOnCompletion ?? !data.generateAllMissing;

    for (const reference of candidates) {
      await step.run(`start-reference-${reference.id}`, async () =>
        generateReferenceImage({
          supabase,
          referenceId: reference.id,
          videoId: data.videoId,
          requestedByUserId: data.requestedByUserId,
          awaitCompletionEvent: awaitCompletion,
          sendEvent: referenceWorkflowSendEvent,
        }),
      );

      if (awaitCompletion) {
        const completion = await step.waitForEvent(
          `wait-reference-${reference.id}`,
          {
            event: INNGEST_EVENTS.referenceGenerationCompleted,
            timeout: "20m",
            if: `async.data.referenceId == "${reference.id}"`,
          },
        );

        const completionData = completion?.data as
          | { status?: string }
          | undefined;
        if (completionData?.status === "generated") {
          generatedCount += 1;
        }
      } else {
        generatedCount += 1;
      }
    }

    if (awaitCompletion) {
      await updateVideoProjectStatus(
        supabase,
        data.videoId,
        "references_ready",
      );
    }

    return { generatedCount };
  },
);

/**
 * Per-reference generation handler. Triggered by the "Generate" /
 * "Regenerate" button on a single reference card.
 */
export const generateSingleReferenceWorkflow = inngest.createFunction(
  {
    id: "generate-single-reference-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoReferenceGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as SingleReferenceGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, data.referenceId);

    if (!reference) {
      throw new Error(
        `Reference ${data.referenceId} not found while handling per-reference generation.`,
      );
    }

    if (reference.videoId !== data.videoId) {
      throw new Error(
        `Reference ${data.referenceId} belongs to video ${reference.videoId ?? "<null>"}, not ${data.videoId}.`,
      );
    }

    if (reference.source === "asset_library") {
      throw new Error(
        `Reference ${data.referenceId} is a library global; use /library to regenerate it.`,
      );
    }

    await step.run(`start-reference-${reference.id}`, async () =>
      generateReferenceImage({
        supabase,
        referenceId: reference.id,
        videoId: data.videoId,
        requestedByUserId: data.requestedByUserId,
        sendEvent: referenceWorkflowSendEvent,
      }),
    );

    return { generatedCount: 1 };
  },
);

export const pollReferenceGeneration = inngest.createFunction(
  {
    id: "poll-reference-generation",
    triggers: [{ event: INNGEST_EVENTS.referenceGenerationPollRequested }],
  },
  async ({ event, step }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as ReferenceGenerationPollRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const requestedDelaySeconds = Number(data.nextPollDelaySeconds);
    const delaySeconds =
      Number.isFinite(requestedDelaySeconds) && requestedDelaySeconds > 0
        ? Math.max(5, Math.min(30, Math.round(requestedDelaySeconds)))
        : DEFAULT_POLL_DELAY_SECONDS;
    await step.sleep("wait before polling Runway", `${delaySeconds}s`);

    return pollReferenceImageGenerationWorkflow(data, {
      getReferenceAssetById: (referenceId) =>
        getReferenceAssetById(supabase, referenceId),
      getRunwayTask,
      updateReferenceAssetRunwayPollState: (input) =>
        updateReferenceAssetRunwayPollState(supabase, input),
      updateReferenceAssetStatus: async (referenceId, status) => {
        await updateReferenceAssetStatus(supabase, { referenceId, status });
      },
      sendEvent: referenceWorkflowSendEvent,
    });
  },
);

export const persistReferenceOutput = inngest.createFunction(
  {
    id: "persist-reference-output",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.referenceOutputPersistRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as ReferenceOutputPersistRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    return persistReferenceImageOutputWorkflow(data, {
      prepareReferenceGeneration: (referenceId) =>
        prepareReferenceImageGeneration(supabase, referenceId),
      finalizeReferenceOutput: (input) =>
        finalizeReferenceImageOutput({ supabase, ...input }),
      sendEvent: data.awaitCompletionEvent
        ? referenceWorkflowSendEvent
        : undefined,
    });
  },
);
