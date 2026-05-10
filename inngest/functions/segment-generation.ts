import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  createGeneration,
  getGenerationById,
  updateGenerationStatus,
} from "@/modules/generation/repositories/generation.repository";
import { getGenerationQueuePaused } from "@/modules/generation/repositories/queue-state.repository";
import {
  getRunwayTask,
  startSeedanceGeneration,
} from "@/modules/generation/services/runway.service";
import {
  persistSegmentOutputWorkflow,
  pollSegmentGenerationWorkflow,
  requestSegmentGenerationWorkflow,
  uploadSegmentMuxWorkflow,
  type SegmentGenerationPollRequestedData,
  type SegmentGenerationRequestedData,
  type SegmentMuxUploadRequestedData,
  type SegmentOutputPersistRequestedData,
} from "@/modules/generation/use-cases/orchestrate-segment-generation";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";
import { persistRunwayOutput } from "@/modules/media-assets/use-cases/persist-media-asset";
import { uploadMediaAssetToMux } from "@/modules/media-assets/use-cases/upload-media-asset-to-mux";
import {
  getSegmentById,
  updateSegmentStatus,
} from "@/modules/storyboard/repositories/segment.repository";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import {
  getWorkflowConcurrency,
  isGenerationQueuePaused,
} from "../config";
import { INNGEST_EVENTS } from "../events";
import type { FeedbackApplyRequestedData } from "../events";

const POLL_DELAY = "5s";

export const requestSegmentGeneration = inngest.createFunction(
  {
    id: "request-segment-generation",
    concurrency: { limit: getWorkflowConcurrency() },
    // No automatic retry: this function calls Runway and any retry would
    // re-spend hackathon credits. Failures stay visible and are recovered
    // through the segment review UI per the no-silent-fallback contract.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.segmentGenerationRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as SegmentGenerationRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    // Read the persisted pause flag once at the start so the workflow stays
    // synchronous downstream. The env-var fallback in `getGenerationQueuePaused`
    // keeps backward compatibility with the original `GENERATION_QUEUE_PAUSED` deploy switch.
    const queuePaused =
      isGenerationQueuePaused() ||
      (await getGenerationQueuePaused(supabase));

    return requestSegmentGenerationWorkflow(data, {
      isGenerationQueuePaused: () => queuePaused,
      getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
      getVideoProjectById: (videoId) => getVideoProjectById(supabase, videoId),
      listReferenceAssetsForVideo: (videoId) =>
        listReferenceAssetsForVideo(supabase, videoId),
      updateSegmentStatus: (segmentId, status) =>
        updateSegmentStatus(supabase, segmentId, status),
      createGeneration: (input) => createGeneration(supabase, input),
      startSeedanceGeneration,
      logCost: (input) => logCost(supabase, input),
      sendEvent: async (workflowEvent) => {
        await inngest.send({
          name: workflowEvent.name,
          data: workflowEvent.data,
        });
      },
    });
  },
);

export const applySegmentFeedbackRegeneration = inngest.createFunction(
  {
    id: "apply-segment-feedback-regeneration",
    concurrency: { limit: getWorkflowConcurrency() },
    // Same rationale as requestSegmentGeneration: this triggers a paid Runway
    // generation; we never want Inngest to retry behind the user's back.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.segmentFeedbackApplyRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as FeedbackApplyRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const queuePaused =
      isGenerationQueuePaused() ||
      (await getGenerationQueuePaused(supabase));

    return requestSegmentGenerationWorkflow(
      {
        segmentId: data.segmentId,
        requestedByUserId: data.requestedByUserId,
      },
      {
        isGenerationQueuePaused: () => queuePaused,
        getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
        getVideoProjectById: (videoId) => getVideoProjectById(supabase, videoId),
        listReferenceAssetsForVideo: (videoId) =>
          listReferenceAssetsForVideo(supabase, videoId),
        updateSegmentStatus: (segmentId, status) =>
          updateSegmentStatus(supabase, segmentId, status),
        createGeneration: (input) => createGeneration(supabase, input),
        startSeedanceGeneration,
        logCost: (input) => logCost(supabase, input),
        sendEvent: async (workflowEvent) => {
          await inngest.send({
            name: workflowEvent.name,
            data: workflowEvent.data,
          });
        },
      },
    );
  },
);

export const pollSegmentGeneration = inngest.createFunction(
  {
    id: "poll-segment-generation",
    triggers: [{ event: INNGEST_EVENTS.segmentGenerationPollRequested }],
  },
  async ({ event, step }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as SegmentGenerationPollRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    await step.sleep("wait before polling Runway", POLL_DELAY);

    return pollSegmentGenerationWorkflow(data, {
      getGenerationById: (generationId) =>
        getGenerationById(supabase, generationId),
      getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
      getRunwayTask,
      updateGenerationStatus: (input) =>
        updateGenerationStatus(supabase, input),
      updateSegmentStatus: (segmentId, status) =>
        updateSegmentStatus(supabase, segmentId, status),
      logCost: (input) => logCost(supabase, input),
      sendEvent: async (workflowEvent) => {
        await inngest.send({
          name: workflowEvent.name,
          data: workflowEvent.data,
        });
      },
      now: () => new Date().toISOString(),
    });
  },
);

export const persistSegmentOutput = inngest.createFunction(
  {
    id: "persist-segment-output",
    // No retry: persistRunwayOutput downloads from a temporary Runway URL.
    // Retrying after a partial Storage write would create orphaned files and
    // duplicate media_assets rows. The user retries explicitly when needed.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.segmentOutputPersistRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as SegmentOutputPersistRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    return persistSegmentOutputWorkflow(data, {
      getGenerationById: (generationId) =>
        getGenerationById(supabase, generationId),
      getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
      persistRunwayOutput: (input) =>
        persistRunwayOutput({
          supabase,
          ...input,
        }),
      updateGenerationStatus: (input) =>
        updateGenerationStatus(supabase, input),
      updateSegmentStatus: (segmentId, status) =>
        updateSegmentStatus(supabase, segmentId, status),
      sendEvent: async (workflowEvent) => {
        await inngest.send({
          name: workflowEvent.name,
          data: workflowEvent.data,
        });
      },
      now: () => new Date().toISOString(),
    });
  },
);

export const uploadSegmentMux = inngest.createFunction(
  {
    id: "upload-segment-mux",
    triggers: [{ event: INNGEST_EVENTS.segmentMuxUploadRequested }],
  },
  async ({ event }) => {
    const data = event.data as SegmentMuxUploadRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    await uploadSegmentMuxWorkflow(data, {
      uploadMediaAssetToMux,
    });
  },
);
