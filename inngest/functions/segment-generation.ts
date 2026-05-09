import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import {
  createGeneration,
  getGenerationById,
  updateGenerationStatus,
} from "@/modules/generation/repositories/generation.repository";
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
    triggers: [{ event: INNGEST_EVENTS.segmentGenerationRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as SegmentGenerationRequestedData;

    return requestSegmentGenerationWorkflow(data, {
      isGenerationQueuePaused,
      getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
      getVideoProjectById: (videoId) => getVideoProjectById(supabase, videoId),
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
    triggers: [{ event: INNGEST_EVENTS.segmentFeedbackApplyRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as FeedbackApplyRequestedData;

    return requestSegmentGenerationWorkflow(
      {
        segmentId: data.segmentId,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: data.isAllowlisted,
      },
      {
        isGenerationQueuePaused,
        getSegmentById: (segmentId) => getSegmentById(supabase, segmentId),
        getVideoProjectById: (videoId) => getVideoProjectById(supabase, videoId),
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
    triggers: [{ event: INNGEST_EVENTS.segmentOutputPersistRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as SegmentOutputPersistRequestedData;

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

    await uploadSegmentMuxWorkflow(data, {
      uploadMediaAssetToMux,
    });
  },
);
