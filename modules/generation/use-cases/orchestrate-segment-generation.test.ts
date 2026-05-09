import assert from "node:assert/strict";
import test from "node:test";

import type { Generation } from "@/modules/generation/generation.types";
import type { RunwayTaskStatus } from "@/modules/generation/runway.types";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  persistSegmentOutputWorkflow,
  pollSegmentGenerationWorkflow,
  requestSegmentGenerationWorkflow,
} from "./orchestrate-segment-generation";

const baseSegment: SeedanceSegment = {
  id: "segment-1",
  videoId: "video-1",
  position: 1,
  title: "Texture hook",
  arc: "opening",
  mode: "References",
  logicalSceneIds: ["scene-1"],
  description: "Glossy cream detail.",
  prompt:
    "Use @KitchenIslandDefault only as global kitchen. Generate exactly 2 shots with hard cuts, total duration 4 seconds, no speech, no voiceover, no music.",
  promptInitial:
    "Use @KitchenIslandDefault only as global kitchen. Generate exactly 2 shots with hard cuts, total duration 4 seconds, no speech, no voiceover, no music.",
  references: [],
  beats: [],
  timing: [],
  continuity: "",
  risk: "",
  audioPrompt: "",
  negatives: [],
  qaChecklist: {
    referencesWithinLimit: true,
    globalKitchenReferencePresent: true,
    referenceRolesExplicit: true,
    promptWithinPracticalLimit: true,
    hardCutsSpecified: true,
    mandatoryTimingSpecified: true,
    noSpeechVoiceoverOrMusic: true,
    fragileFoodPhysicsHandled: true,
    nonStandardGeometryHandled: true,
    sourcePoliciesApplied: [],
  },
  durationTarget: 4,
  status: "ready",
  selectedGenerationId: null,
  createdBy: "user-1",
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

const baseVideo: VideoProject = {
  id: "video-1",
  title: "Paris-Brest",
  slug: "paris-brest",
  recipeUrl: null,
  recipeData: null,
  status: "storyboard_approved",
  storyboard: null,
  seedanceSegments: null,
  selectedVideoModel: "seedance2",
  selectedImageModel: "gpt_image_2",
  selectedTtsModel: "eleven_multilingual_v2",
  selectedSfxModel: "eleven_text_to_sound_v2",
  totalCostCredits: 0,
  totalCostOpenai: 0,
  createdBy: "user-1",
  createdAt: "2026-05-09T00:00:00.000Z",
  updatedAt: "2026-05-09T00:00:00.000Z",
};

test("requestSegmentGenerationWorkflow persists queued and generating states before scheduling polling", async () => {
  const segmentStatuses: string[] = [];
  const sentEvents: string[] = [];
  const costOperations: string[] = [];

  const result = await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      getSegmentById: async () => baseSegment,
      getVideoProjectById: async () => baseVideo,
      updateSegmentStatus: async (_segmentId, status) => {
        segmentStatuses.push(status);
        return { ...baseSegment, status };
      },
      createGeneration: async () => ({
        ...baseGeneration,
        id: "generation-1",
        runwayTaskId: "task-1",
        status: "queued",
      }),
      startSeedanceGeneration: async () => ({
        id: "task-1",
        endpoint: "text_to_video",
        generationStatus: "queued",
      }),
      logCost: async (input) => {
        costOperations.push(input.operation);
        return baseCostLog(input.operation);
      },
      sendEvent: async (event) => {
        sentEvents.push(event.name);
      },
    },
  );

  assert.equal(result.generationId, "generation-1");
  assert.deepEqual(segmentStatuses, ["queued", "generating"]);
  assert.deepEqual(sentEvents, ["segment.generation.poll.requested"]);
  assert.deepEqual(costOperations, ["seedance_segment_generation_started"]);
});

test("requestSegmentGenerationWorkflow blocks new generation when the global queue is paused", async () => {
  const segmentStatuses: string[] = [];

  const result = await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => true,
      getSegmentById: async () => baseSegment,
      getVideoProjectById: async () => baseVideo,
      updateSegmentStatus: async (_segmentId, status) => {
        segmentStatuses.push(status);
        return { ...baseSegment, status };
      },
      createGeneration: async () => {
        throw new Error("generation should not be created while paused");
      },
      startSeedanceGeneration: async () => {
        throw new Error("Runway should not be called while paused");
      },
      logCost: async (input) => baseCostLog(input.operation),
      sendEvent: async () => {
        throw new Error("polling should not be scheduled while paused");
      },
    },
  );

  assert.equal(result.paused, true);
  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("pollSegmentGenerationWorkflow persists a succeeded task and requests output persistence", async () => {
  const generationStatuses: string[] = [];
  const sentEvents: string[] = [];

  await pollSegmentGenerationWorkflow(
    {
      generationId: "generation-1",
      taskId: "task-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      getGenerationById: async () => baseGeneration,
      getSegmentById: async () => baseSegment,
      getRunwayTask: async () => succeededTask,
      updateGenerationStatus: async (input) => {
        generationStatuses.push(input.status);
        return { ...baseGeneration, status: input.status };
      },
      updateSegmentStatus: async (_segmentId, status) => ({
        ...baseSegment,
        status,
      }),
      sendEvent: async (event) => {
        sentEvents.push(event.name);
      },
      now: () => "2026-05-09T01:00:00.000Z",
    },
  );

  assert.deepEqual(generationStatuses, ["processing", "succeeded"]);
  assert.deepEqual(sentEvents, ["segment.output.persist.requested"]);
});

test("persistSegmentOutputWorkflow stores output, marks segment review-ready, and schedules Mux upload", async () => {
  const generationStatuses: string[] = [];
  const segmentStatuses: string[] = [];
  const sentEvents: string[] = [];

  const result = await persistSegmentOutputWorkflow(
    {
      generationId: "generation-1",
      outputUrl: "https://runway.example/output.mp4",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      getGenerationById: async () => baseGeneration,
      getSegmentById: async () => baseSegment,
      persistRunwayOutput: async () => ({
        id: "media-1",
        videoId: "video-1",
        segmentId: "segment-1",
        generationId: "generation-1",
        type: "runway_output",
        provider: "runway",
        storageBucket: "runway-outputs",
        storagePath: "runway-outputs/video-1/segment-1/generation-1.mp4",
        muxAssetId: null,
        muxPlaybackId: null,
        runwayOutputUrl: "https://runway.example/output.mp4",
        originalFilename: "generation-1.mp4",
        mimeType: "video/mp4",
        fileSizeBytes: 100,
        durationSeconds: null,
        width: null,
        height: null,
        status: "stored",
        metadata: {},
        createdBy: "user-1",
        createdAt: "2026-05-09T00:00:00.000Z",
        updatedAt: "2026-05-09T00:00:00.000Z",
      }),
      updateGenerationStatus: async (input) => {
        generationStatuses.push(input.status);
        return { ...baseGeneration, status: input.status };
      },
      updateSegmentStatus: async (_segmentId, status) => {
        segmentStatuses.push(status);
        return { ...baseSegment, status };
      },
      sendEvent: async (event) => {
        sentEvents.push(event.name);
      },
      now: () => "2026-05-09T01:00:00.000Z",
    },
  );

  assert.equal(result.mediaAssetId, "media-1");
  assert.deepEqual(generationStatuses, ["succeeded"]);
  assert.deepEqual(segmentStatuses, ["review"]);
  assert.deepEqual(sentEvents, ["segment.mux.upload.requested"]);
});

const baseGeneration: Generation = {
  id: "generation-1",
  segmentId: "segment-1",
  mediaAssetId: null,
  model: "seedance2",
  modelParams: {},
  runwayTaskId: "task-1",
  status: "queued",
  costCredits: 144,
  durationSeconds: 4,
  triggeredBy: "user-1",
  createdAt: "2026-05-09T00:00:00.000Z",
  completedAt: null,
};

const succeededTask: RunwayTaskStatus = {
  id: "task-1",
  status: "SUCCEEDED",
  generationStatus: "succeeded",
  output: ["https://runway.example/output.mp4"],
  isTerminal: true,
};

function baseCostLog(operation: string) {
  return {
    id: "cost-1",
    videoId: "video-1",
    segmentId: "segment-1",
    provider: "runway",
    model: "seedance2",
    operation,
    creditsUsed: 144,
    costDollars: null,
    tokensInput: null,
    tokensOutput: null,
    metadata: {},
    createdBy: "user-1",
    createdAt: "2026-05-09T00:00:00.000Z",
  };
}
