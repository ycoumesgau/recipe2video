import assert from "node:assert/strict";
import test from "node:test";

import type { Generation } from "@/modules/generation/generation.types";
import type {
  RunwayTaskStatus,
  SeedanceGenerationInput,
} from "@/modules/generation/runway.types";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
} from "../runway.constants";

import {
  buildSeedanceGenerationInput,
  persistSegmentOutputWorkflow,
  pollSegmentGenerationWorkflow,
  requestSegmentGenerationWorkflow,
  type SegmentSeedanceReferenceInput,
} from "./orchestrate-segment-generation";

function seedanceRef(
  canonicalName: string,
  uri: string,
  options: {
    position?: number;
    role?: string;
    required?: boolean;
    source?: "asset_library" | "reference_assets";
    aliases?: string[];
    fileSizeBytes?: number;
    mimeType?: string | null;
  } = {},
): SegmentSeedanceReferenceInput {
  return {
    position: options.position ?? 0,
    role: options.role ?? "global Licorn kitchen environment",
    required: options.required ?? true,
    canonicalName,
    aliases: options.aliases ?? [],
    uri,
    source: options.source ?? "asset_library",
    fileSizeBytes: options.fileSizeBytes,
    mimeType: options.mimeType,
  };
}

test("buildSeedanceGenerationInput maps every resolved JIT URL into Runway's references[] in position order", () => {
  // Pure mapping test for the JIT-resolver -> Runway boundary. Seedance 2
  // exposes image references EXCLUSIVELY through `text_to_video` with a
  // top-level `references[]` array (image_to_video rejects that field with
  // `unrecognized_keys: ["references"]`). Every resolved reference therefore
  // flows into `references[]` in `position` order; we never write to
  // `promptImage`. Ordering matters because Seedance's prompt template
  // addresses references positionally (`@KitchenIslandDefault`, then state
  // and pose references).
  const input = buildSeedanceGenerationInput(
    {
      id: "segment-x",
      videoId: "video-x",
      title: "Hook",
      prompt: "Generate a 5s hard cut",
      durationTarget: 5,
    } as unknown as SeedanceSegment,
    [
      seedanceRef("Whisk", "https://signed/whisk.png", { position: 2 }),
      seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png", {
        position: 0,
      }),
      seedanceRef("BakedCheeseBlisterFrame", "https://signed/baked.png", {
        position: 1,
        source: "reference_assets",
      }),
    ],
  );

  assert.equal(input.promptImage, undefined);
  assert.deepEqual(input.references, [
    { type: "image", uri: "https://signed/kitchen.png" },
    { type: "image", uri: "https://signed/baked.png" },
    { type: "image", uri: "https://signed/whisk.png" },
  ]);
});

test("buildSeedanceGenerationInput splits inputs by kind into references[] (images) and referenceVideos[] (videos)", () => {
  // The standardized outro segment binds 4 image references AND a video
  // reference (LicornOutroVideo) on the same Seedance request. The
  // orchestrator must therefore route entries to the right Runway slot
  // based on `kind`, ordered by `position`, and surface
  // `durationSeconds` so the runway service can validate the combined
  // 15s cap.
  const input = buildSeedanceGenerationInput(
    {
      id: "segment-outro",
      videoId: "video-x",
      title: "Outro",
      prompt: "Outro prompt",
      durationTarget: 5,
    } as unknown as SeedanceSegment,
    [
      seedanceRef("KitchenLayoutContextWide", "https://signed/kitchen-wide.png", {
        position: 0,
      }),
      seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png", {
        position: 1,
      }),
      {
        position: 2,
        role: "Licorn celebration motion reference",
        required: true,
        canonicalName: "LicornOutroVideo",
        aliases: ["LicornOutroVideo"],
        uri: "https://signed/licorn-outro.mp4",
        source: "asset_library",
        kind: "video",
        durationSeconds: 3,
        mimeType: "video/mp4",
      },
      seedanceRef("CharacterSheet", "https://signed/character-sheet.png", {
        position: 3,
      }),
      seedanceRef("FinalDishVisual", "https://signed/dish.png", {
        position: 4,
        source: "reference_assets",
      }),
    ],
  );

  assert.equal(input.promptImage, undefined);
  assert.deepEqual(input.references, [
    { type: "image", uri: "https://signed/kitchen-wide.png" },
    { type: "image", uri: "https://signed/kitchen.png" },
    { type: "image", uri: "https://signed/character-sheet.png" },
    { type: "image", uri: "https://signed/dish.png" },
  ]);
  assert.deepEqual(input.referenceVideos, [
    {
      type: "video",
      uri: "https://signed/licorn-outro.mp4",
      durationSeconds: 3,
    },
  ]);
});

test("buildSeedanceGenerationInput omits referenceVideos[] when no video reference is wired", () => {
  const input = buildSeedanceGenerationInput(
    {
      id: "segment-x",
      videoId: "video-x",
      title: "Hook",
      prompt: "Generate a 5s hard cut",
      durationTarget: 5,
    } as unknown as SeedanceSegment,
    [seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png")],
  );

  assert.equal(input.referenceVideos, undefined);
});

test("buildSeedanceGenerationInput puts a single reference into references[] (not promptImage)", () => {
  const input = buildSeedanceGenerationInput(
    {
      id: "segment-x",
      videoId: "video-x",
      title: "Hook",
      prompt: "Generate a 5s hard cut",
      durationTarget: 5,
    } as unknown as SeedanceSegment,
    [seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png")],
  );

  assert.equal(input.promptImage, undefined);
  assert.deepEqual(input.references, [
    { type: "image", uri: "https://signed/kitchen.png" },
  ]);
});

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
    "Use @KitchenIslandDefault only as global kitchen. Generate exactly 2 shots with hard cuts, total duration 5 seconds, no speech, no voiceover, no music.",
  promptInitial:
    "Use @KitchenIslandDefault only as global kitchen. Generate exactly 2 shots with hard cuts, total duration 5 seconds, no speech, no voiceover, no music.",
  references: [
    {
      id: "ref-kitchen",
      role: "global Licorn kitchen environment",
      name: "KitchenIslandDefault",
      label: "KitchenIslandDefault",
      runwayUri: "runway://test/kitchen",
      required: true,
    },
  ],
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
  durationTarget: 5,
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
  agentStatus: "idle",
};

test("requestSegmentGenerationWorkflow persists queued and generating states before scheduling polling", async () => {
  const segmentStatuses: string[] = [];
  const sentEvents: string[] = [];
  const costOperations: string[] = [];
  const generationInputs: SeedanceGenerationInput[] = [];

  const result = await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      hasActiveGenerationForSegment: async () => false,
      getSegmentById: async () => baseSegment,
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [
        seedanceRef("kitchen_wide", "https://signed.test/kitchen-context.png", {
          position: 0,
          role: "structural kitchen context",
          aliases: ["KitchenLayoutContextWide"],
        }),
        seedanceRef("KitchenIslandDefault", "https://signed.test/kitchen.png", {
          position: 1,
          aliases: ["KitchenIslandDefault"],
        }),
      ],
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
      startSeedanceGeneration: async (input) => {
        generationInputs.push(input);
        return {
          id: "task-1",
          endpoint: "text_to_video",
          generationStatus: "queued",
        };
      },
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
  assert.equal(generationInputs[0]?.promptImage, undefined);
  assert.deepEqual(generationInputs[0]?.references, [
    { type: "image", uri: "https://signed.test/kitchen-context.png" },
    { type: "image", uri: "https://signed.test/kitchen.png" },
  ]);
  assert.equal(generationInputs[0]?.ratio, RUNWAY_DEFAULT_VIDEO_RATIO);
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
      hasActiveGenerationForSegment: async () => false,
      getSegmentById: async () => baseSegment,
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [],
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

test("requestSegmentGenerationWorkflow is idempotent when a segment already has an active generation", async () => {
  let runwayCalled = false;
  let generationCreated = false;

  const result = await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      hasActiveGenerationForSegment: async () => true,
      getSegmentById: async () => baseSegment,
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [],
      updateSegmentStatus: async (_segmentId, status) => ({
        ...baseSegment,
        status,
      }),
      createGeneration: async () => {
        generationCreated = true;
        return baseGeneration;
      },
      startSeedanceGeneration: async () => {
        runwayCalled = true;
        return {
          id: "task-1",
          endpoint: "text_to_video",
          generationStatus: "queued",
        };
      },
      logCost: async (input) => baseCostLog(input.operation),
      sendEvent: async () => {},
    },
  );

  assert.equal(result.alreadyActive, true);
  assert.equal(runwayCalled, false);
  assert.equal(generationCreated, false);
});

test("requestSegmentGenerationWorkflow uses JIT signed URLs from the resolver", async () => {
  const generationInputs: SeedanceGenerationInput[] = [];
  const segmentWithTwoRefs: SeedanceSegment = {
    ...baseSegment,
    references: [
      {
        id: "ref-kitchen",
        role: "global Licorn kitchen environment",
        name: "KitchenIslandDefault",
        label: "KitchenIslandDefault",
        runwayUri: null,
        required: true,
      },
      {
        id: "ref-state",
        role: "current recipe state and fragile food geometry",
        name: "RawChouxCrownFrame",
        label: "RawChouxCrownFrame",
        runwayUri: null,
        required: true,
      },
    ],
  };

  await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      hasActiveGenerationForSegment: async () => false,
      getSegmentById: async () => segmentWithTwoRefs,
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [
        seedanceRef("kitchen_wide", "https://signed.test/kitchen-context.png", {
          position: 0,
          role: "structural kitchen context",
          aliases: ["KitchenLayoutContextWide"],
          source: "asset_library",
        }),
        seedanceRef("KitchenIslandDefault", "https://signed.test/kitchen.png", {
          position: 1,
          aliases: ["KitchenIslandDefault"],
          source: "asset_library",
        }),
        seedanceRef("RawChouxCrownFrame", "https://signed.test/raw-choux.png", {
          position: 2,
          role: "current recipe state and fragile food geometry",
          source: "reference_assets",
        }),
      ],
      updateSegmentStatus: async (_segmentId, status) => ({
        ...segmentWithTwoRefs,
        status,
      }),
      createGeneration: async () => ({
        ...baseGeneration,
        id: "generation-1",
        runwayTaskId: "task-1",
        status: "queued",
      }),
      startSeedanceGeneration: async (input) => {
        generationInputs.push(input);
        return {
          id: "task-1",
          endpoint: "text_to_video",
          generationStatus: "queued",
        };
      },
      logCost: async (input) => baseCostLog(input.operation),
      sendEvent: async () => {},
    },
  );

  assert.equal(generationInputs[0]?.promptImage, undefined);
  assert.deepEqual(generationInputs[0]?.references, [
    { type: "image", uri: "https://signed.test/kitchen-context.png" },
    { type: "image", uri: "https://signed.test/kitchen.png" },
    { type: "image", uri: "https://signed.test/raw-choux.png" },
  ]);
});

test("requestSegmentGenerationWorkflow accepts the agent's PascalCase alias when the resolver returns the snake_case canonical", async () => {
  // Regression for the "Chicken Enchiladas" project: every reference was
  // wired correctly through `segment_references`, but the validator
  // compared `segment.references[].name = "KitchenIslandDefault"` against
  // `resolver.canonicalName = "island_default"` with a plain toLowerCase
  // and threw `... could not be resolved ...`, blocking generation. Once
  // the resolver surfaces aliases and the validator normalizes both sides,
  // the same data must flow through.
  const segmentStatuses: string[] = [];

  await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      hasActiveGenerationForSegment: async () => false,
      getSegmentById: async () => ({
        ...baseSegment,
        references: [
          {
            id: "ref-kitchen",
            role: "global Licorn kitchen environment",
            name: "KitchenIslandDefault",
            label: "KitchenIslandDefault",
            runwayUri: null,
            required: true,
          },
          {
            id: "ref-pose",
            role: "top-down hands pose",
            name: "PoseTopDown",
            label: "PoseTopDown",
            runwayUri: null,
            required: true,
          },
        ],
      }),
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [
        seedanceRef("kitchen_wide", "https://signed.test/context.png", {
          position: 0,
          aliases: ["KitchenLayoutContextWide"],
        }),
        seedanceRef("island_default", "https://signed.test/island.png", {
          position: 1,
          aliases: ["KitchenIslandDefault"],
        }),
        seedanceRef("Luma-topDown-pose", "https://signed.test/pose.png", {
          position: 2,
          role: "top-down hands pose",
          aliases: ["PoseTopDown"],
        }),
      ],
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
      logCost: async (input) => baseCostLog(input.operation),
      sendEvent: async () => {},
    },
  );

  assert.deepEqual(segmentStatuses, ["queued", "generating"]);
});

test("requestSegmentGenerationWorkflow detects the global kitchen reference via its alias", async () => {
  // The previous implementation derived "kitchen presence" from the
  // canonicalName + role haystack only. `island_default` happens to contain
  // "island", but a future rename to `bg_main` would silently break the
  // check; the alias `KitchenIslandDefault` should keep it working.
  let createdGeneration = false;

  await requestSegmentGenerationWorkflow(
    {
      segmentId: "segment-1",
      requestedByUserId: "user-1",
      isAllowlisted: true,
    },
    {
      isGenerationQueuePaused: () => false,
      hasActiveGenerationForSegment: async () => false,
      getSegmentById: async () => ({
        ...baseSegment,
        references: [
          {
            id: "ref-kitchen",
            role: "primary backdrop",
            name: "KitchenIslandDefault",
            label: "KitchenIslandDefault",
            runwayUri: null,
            required: true,
          },
        ],
      }),
      getVideoProjectById: async () => baseVideo,
      resolveSegmentSeedanceReferences: async () => [
        seedanceRef("bg_kitchen_context", "https://signed.test/context.png", {
          position: 0,
          role: "structural context backdrop",
          aliases: ["KitchenLayoutContextWide"],
        }),
        seedanceRef("bg_main", "https://signed.test/bg.png", {
          position: 1,
          role: "primary backdrop",
          aliases: ["KitchenIslandDefault"],
        }),
      ],
      updateSegmentStatus: async (_segmentId, status) => ({
        ...baseSegment,
        status,
      }),
      createGeneration: async () => {
        createdGeneration = true;
        return {
          ...baseGeneration,
          id: "generation-1",
          runwayTaskId: "task-1",
          status: "queued",
        };
      },
      startSeedanceGeneration: async () => ({
        id: "task-1",
        endpoint: "text_to_video",
        generationStatus: "queued",
      }),
      logCost: async (input) => baseCostLog(input.operation),
      sendEvent: async () => {},
    },
  );

  assert.equal(createdGeneration, true);
});

test("requestSegmentGenerationWorkflow blocks when required reference asset is not uploaded", async () => {
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => ({
            ...baseSegment,
            references: [
              {
                id: "ref-kitchen",
                role: "global Licorn kitchen environment",
                name: "KitchenIslandDefault",
                label: "KitchenIslandDefault",
                runwayUri: null,
                required: true,
              },
            ],
          }),
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /no resolved Seedance references/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow blocks when Seedance reference limit is exceeded", async () => {
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => ({
            ...baseSegment,
            references: Array.from({ length: 10 }, (_, index) => ({
              role:
                index === 0
                  ? "global Licorn kitchen environment"
                  : `recipe state reference ${index}`,
              name: index === 0 ? "KitchenIslandDefault" : `State${index}`,
              label: index === 0 ? "KitchenIslandDefault" : `State${index}`,
              runwayUri: `runway://reference-${index}`,
              required: true,
            })),
          }),
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () =>
            Array.from({ length: 10 }, (_, index) =>
              seedanceRef(
                index === 0 ? "KitchenIslandDefault" : `State${index}`,
                `https://signed.test/ref-${index}.png`,
                {
                  position: index,
                  role:
                    index === 0
                      ? "global Licorn kitchen environment"
                      : `recipe state reference ${index}`,
                },
              ),
            ),
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /at most 9/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow blocks when more than 3 video references are wired", async () => {
  // Runway Seedance 2 caps `referenceVideos[]` at 3 entries on
  // text_to_video. We refuse upfront so the operator does not waste a
  // round-trip and gets a precise message.
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => baseSegment,
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [
            seedanceRef("KitchenLayoutContextWide", "https://signed/kitchen-wide.png", {
              position: 0,
              aliases: ["KitchenLayoutContextWide"],
            }),
            seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png", {
              position: 1,
            }),
            ...Array.from({ length: 4 }, (_, index) => ({
              position: 10 + index,
              role: "Licorn celebration motion reference",
              required: true,
              canonicalName: `LicornVideo${index}`,
              aliases: [],
              uri: `https://signed/video-${index}.mp4`,
              source: "asset_library" as const,
              kind: "video" as const,
              durationSeconds: 2,
              mimeType: "video/mp4",
            })),
          ],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /at most 3 videos/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow blocks when video references combined duration exceeds 15s", async () => {
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => baseSegment,
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [
            seedanceRef("KitchenLayoutContextWide", "https://signed/kitchen-wide.png", {
              position: 0,
              aliases: ["KitchenLayoutContextWide"],
            }),
            seedanceRef("KitchenIslandDefault", "https://signed/kitchen.png", {
              position: 1,
            }),
            ...Array.from({ length: 3 }, (_, index) => ({
              position: 10 + index,
              role: "Licorn celebration motion reference",
              required: true,
              canonicalName: `LicornVideo${index}`,
              aliases: [],
              uri: `https://signed/video-${index}.mp4`,
              source: "asset_library" as const,
              kind: "video" as const,
              durationSeconds: 6,
              mimeType: "video/mp4",
            })),
          ],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /combined duration .* caps the total at 15s/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow flips status to awaiting_upstream_frame when a pending frame placeholder is detected", async () => {
  // When the planner declares an `extracted_frame_pending` reference,
  // generation must wait until the operator extracts the upstream frame
  // through the segment-review UI. The orchestrator surfaces a
  // dedicated status + a precise message naming the source segment so
  // the operator can act without digging through logs.
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => baseSegment,
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => {
            throw new Error("resolver should not be called when frames are pending");
          },
          findPendingExtractedFrames: async () => [
            {
              referenceAssetId: "ref-pending-1",
              canonicalName: "DishAfterSpoonDive",
              sourceSegmentId: "segment-prev",
              sourceTimestampSeconds: 4.5,
            },
          ],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created while pending");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called while pending");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /awaiting 1 upstream frame[\s\S]*DishAfterSpoonDive[\s\S]*segment segment-prev at 4\.50s/,
  );

  assert.deepEqual(segmentStatuses, ["awaiting_upstream_frame"]);
});

test("requestSegmentGenerationWorkflow blocks when a reference exceeds Runway's 16MB per-asset cap", async () => {
  // Regression for the Recipe2Video kitchen library: high-detail PNGs in
  // `library/kitchen/*` ship at ~17 MB and Runway rejects them with a
  // generic "Asset size exceeds 16.0MB" 400 after queueing the task. We
  // now pre-flight against `media_assets.file_size_bytes` and refuse the
  // segment with a precise, operator-actionable message.
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => baseSegment,
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [
            seedanceRef("KitchenLayoutContextWide", "https://signed.test/context.png", {
              position: 0,
              aliases: ["KitchenLayoutContextWide"],
              fileSizeBytes: 4 * 1024 * 1024,
              mimeType: "image/png",
            }),
            seedanceRef("KitchenIslandDefault", "https://signed.test/kitchen.png", {
              position: 1,
              fileSizeBytes: 9 * 1024 * 1024,
              mimeType: "image/png",
            }),
            seedanceRef("InductionLeftCloseup", "https://signed.test/induction.png", {
              position: 2,
              fileSizeBytes: 17_153_462,
              mimeType: "image/png",
            }),
          ],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /16\.0MB-per-asset limit[\s\S]*InductionLeftCloseup \(16\.36MB image\/png\)/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow blocks when segment duration is below Seedance 2's 5s minimum", async () => {
  // Regression for the Recipe2Video pipeline producing 4s outro segments:
  // Runway rejected those generations as a generic "Validation of body
  // failed" 400, which was hard to diagnose. The orchestrator now refuses
  // upfront with the exact constraint so the operator can fix the storyboard.
  const segmentStatuses: string[] = [];

  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => ({
            ...baseSegment,
            durationTarget: 4,
          }),
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [
            seedanceRef("KitchenLayoutContextWide", "https://signed.test/context.png", {
              position: 0,
              aliases: ["KitchenLayoutContextWide"],
            }),
            seedanceRef("KitchenIslandDefault", "https://signed.test/kitchen.png", {
              position: 1,
              aliases: ["KitchenIslandDefault"],
            }),
          ],
          updateSegmentStatus: async (_segmentId, status) => {
            segmentStatuses.push(status);
            return { ...baseSegment, status };
          },
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /Seedance 2 only accepts integer durations between 5s and 15s/,
  );

  assert.deepEqual(segmentStatuses, ["blocked"]);
});

test("requestSegmentGenerationWorkflow blocks when segment duration exceeds Seedance 2's 15s ceiling", async () => {
  await assert.rejects(
    () =>
      requestSegmentGenerationWorkflow(
        {
          segmentId: "segment-1",
          requestedByUserId: "user-1",
          isAllowlisted: true,
        },
        {
          isGenerationQueuePaused: () => false,
          hasActiveGenerationForSegment: async () => false,
          getSegmentById: async () => ({
            ...baseSegment,
            durationTarget: 16,
          }),
          getVideoProjectById: async () => baseVideo,
          resolveSegmentSeedanceReferences: async () => [
            seedanceRef("KitchenLayoutContextWide", "https://signed.test/context.png", {
              position: 0,
              aliases: ["KitchenLayoutContextWide"],
            }),
            seedanceRef("KitchenIslandDefault", "https://signed.test/kitchen.png", {
              position: 1,
              aliases: ["KitchenIslandDefault"],
            }),
          ],
          updateSegmentStatus: async (_segmentId, status) => ({
            ...baseSegment,
            status,
          }),
          createGeneration: async () => {
            throw new Error("generation should not be created");
          },
          startSeedanceGeneration: async () => {
            throw new Error("Runway should not be called");
          },
          logCost: async (input) => baseCostLog(input.operation),
          sendEvent: async () => {},
        },
      ),
    /between 5s and 15s/,
  );
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

test("pollSegmentGenerationWorkflow refunds credits when Runway fails the task", async () => {
  const costOperations: string[] = [];

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
      getRunwayTask: async () => ({
        id: "task-1",
        status: "FAILED",
        generationStatus: "failed",
        failure: "Text prompt did not pass moderation check",
        failureCode: "INPUT_PREPROCESSING.SAFETY.TEXT",
        isTerminal: true,
      }),
      updateGenerationStatus: async (input) => {
        if (input.modelParams) {
          assert.equal(
            input.modelParams.runwayFailure,
            "Text prompt did not pass moderation check",
          );
          assert.equal(
            input.modelParams.runwayFailureCode,
            "INPUT_PREPROCESSING.SAFETY.TEXT",
          );
        }
        return {
          ...baseGeneration,
          status: input.status,
          modelParams: input.modelParams ?? baseGeneration.modelParams,
        };
      },
      updateSegmentStatus: async (_segmentId, status) => ({
        ...baseSegment,
        status,
      }),
      logCost: async (input) => {
        costOperations.push(input.operation);
        return baseCostLog(input.operation);
      },
      sendEvent: async () => undefined,
      now: () => "2026-05-09T01:00:00.000Z",
    },
  );

  assert.deepEqual(costOperations, ["seedance_segment_generation_refunded"]);
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
  costCredits: 4 * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
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
  const creditsUsed = 4 * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND;

  return {
    id: "cost-1",
    videoId: "video-1",
    segmentId: "segment-1",
    provider: "runway",
    model: "seedance2",
    operation,
    creditsUsed,
    costDollars: null,
    tokensInput: null,
    tokensOutput: null,
    metadata: {},
    createdBy: "user-1",
    createdAt: "2026-05-09T00:00:00.000Z",
  };
}

