import type { CostLog } from "@/modules/costs/cost.types";
import type { PromptDiff } from "@/modules/feedback/feedback.types";
import type { Generation } from "@/modules/generation/generation.types";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
} from "@/modules/generation/runway.constants";
import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import {
  buildFixturePromptQa,
  getParisBrestStoryboardFixture,
} from "@/modules/storyboard/paris-brest-storyboard.fixture";
import type {
  LogicalScene,
  SeedanceSegment,
} from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

export interface DemoReference {
  id: string;
  canonicalName: string;
  role: string;
  type: "global" | "recipe_state";
  source: "fixture_public_safe";
  status: "approved" | "uploaded_to_runway";
  previewUrl: string;
  storageBucket: string;
  storagePath: string;
  runwayUri: string | null;
  usedInSegments: string[];
}

export interface DemoSegmentGeneration extends Generation {
  title: string;
  clipUrl: string;
  mediaAsset: MediaAsset;
  selected: boolean;
}

export interface DemoAssembly {
  finalPreviewUrl: string;
  selectedSegmentIds: string[];
  audioStatus: "prompt_ready_no_audio_uploaded";
  totalDurationSeconds: number;
  storagePlan: string;
}

export interface ParisBrestDemoFixture {
  project: VideoProject;
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
  references: DemoReference[];
  generations: DemoSegmentGeneration[];
  costLogs: CostLog[];
  promptDiff: {
    feedbackMessage: string;
    promptBefore: string;
    promptAfter: string;
    diff: PromptDiff;
  };
  assembly: DemoAssembly;
  sunoPrompt: string;
}

const DEMO_PROJECT_ID = "paris-brest-demo";
const CREATED_AT = "2026-05-08T18:00:00.000Z";
const UPDATED_AT = "2026-05-08T18:42:00.000Z";

export function getParisBrestDemoFixture(): ParisBrestDemoFixture {
  const storyboard = getParisBrestStoryboardFixture();
  const segmentIdByKey = new Map(
    storyboard.seedanceSegments.map((segment) => [
      segment.key,
      `demo-segment-${segment.key}`,
    ]),
  );

  const logicalScenes: LogicalScene[] = storyboard.logicalScenes.map((scene) => ({
    id: `demo-scene-${scene.position.toString().padStart(2, "0")}`,
    videoId: DEMO_PROJECT_ID,
    segmentId: segmentIdByKey.get(scene.segmentKey) ?? null,
    position: scene.position,
    sceneType: scene.sceneType,
    arc: scene.arc,
    description: scene.description,
    bg: scene.bg,
    zoom: scene.zoom,
    durationTarget: scene.durationTarget,
    note: scene.note,
  }));

  const sceneIdByPosition = new Map(
    logicalScenes.map((scene) => [scene.position, scene.id]),
  );

  const seedanceSegments: SeedanceSegment[] = storyboard.seedanceSegments.map(
    (segment) => {
      const id = segmentIdByKey.get(segment.key) ?? `demo-segment-${segment.key}`;
      const logicalSceneIds = segment.logicalScenePositions
        .map((position) => sceneIdByPosition.get(position))
        .filter((sceneId): sceneId is string => Boolean(sceneId));

      return {
        id,
        videoId: DEMO_PROJECT_ID,
        position: segment.position,
        title: segment.title,
        arc: segment.arc,
        mode: "References",
        logicalSceneIds,
        description: segment.description,
        prompt: segment.prompt,
        promptInitial: segment.prompt,
        references: segment.references,
        beats: segment.logicalScenePositions.map((position) => `Scene ${position}`),
        timing: extractTiming(segment.prompt),
        continuity: "Keep the Licorn kitchen, mascot scale, and Paris-Brest crown topology consistent.",
        risk: "Fragile choux geometry can collapse or become a smooth donut if references are ignored.",
        audioPrompt: "Close kitchen ASMR only: brittle crack, whisking, piping, sugar dust, and plate contact.",
        negatives: [
          "no speech",
          "no voiceover",
          "no music",
          "no smooth ring",
          "no deformed mascot",
        ],
        qaChecklist: buildFixturePromptQa(segment.prompt, segment.references),
        durationTarget: segment.durationTarget,
        status: getSegmentStatus(segment.position),
        selectedGenerationId:
          segment.position <= 3 ? `demo-generation-${segment.position}` : null,
        createdBy: "fixture",
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      };
    },
  );

  return {
    project: demoProject,
    logicalScenes,
    seedanceSegments,
    references: demoReferences,
    generations: buildDemoGenerations(seedanceSegments),
    costLogs: demoCostLogs,
    promptDiff: demoPromptDiff,
    assembly: demoAssembly,
    sunoPrompt,
  };
}

const demoProject: VideoProject = {
  id: DEMO_PROJECT_ID,
  title: "Paris-Brest praline cream",
  slug: "paris-brest-demo",
  recipeUrl: null,
  recipeData: {
    source: {
      type: "demo",
      demoRecipeId: "paris-brest",
    },
    title: "Paris-Brest with praline cream",
    servings: 6,
    publicSafeFixture: true,
  },
  status: "review",
  storyboard: {
    source: "fixture:paris-brest-public-safe",
    logicalSceneCount: 30,
  },
  seedanceSegments: {
    source: "fixture:paris-brest-public-safe",
    segmentCount: 6,
  },
  selectedVideoModel: "seedance2",
  selectedImageModel: "gpt_image_2",
  selectedTtsModel: "eleven_multilingual_v2",
  selectedSfxModel: "eleven_text_to_sound_v2",
  totalCostCredits: 3820,
  totalCostOpenai: 0.84,
  createdBy: "fixture",
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
  agentStatus: "idle",
};

const demoReferences: DemoReference[] = [
  {
    id: "demo-reference-kitchen",
    canonicalName: "KitchenIslandDefault",
    role: "Global Licorn kitchen environment for all Seedance segments.",
    type: "global",
    source: "fixture_public_safe",
    status: "uploaded_to_runway",
    previewUrl: "/demo/paris-brest/reference-kitchen.svg",
    storageBucket: "reference-images",
    storagePath: `${DEMO_PROJECT_ID}/kitchen-island-default.svg`,
    runwayUri: "runway://fixture/kitchen-island-default",
    usedInSegments: ["S1", "S2", "S3", "S4", "S5", "S6"],
  },
  {
    id: "demo-reference-mascot",
    canonicalName: "LicornMascot",
    role: "Consistent mascot cook body, hands, expression, and scale.",
    type: "global",
    source: "fixture_public_safe",
    status: "uploaded_to_runway",
    previewUrl: "/demo/paris-brest/reference-mascot.svg",
    storageBucket: "reference-images",
    storagePath: `${DEMO_PROJECT_ID}/licorn-mascot.svg`,
    runwayUri: "runway://fixture/licorn-mascot",
    usedInSegments: ["S1", "S2", "S4", "S5", "S6"],
  },
  {
    id: "demo-reference-raw-choux",
    canonicalName: "ParisBrestRawChoux",
    role: "Piped raw crown with separate domes touching in a ring.",
    type: "recipe_state",
    source: "fixture_public_safe",
    status: "uploaded_to_runway",
    previewUrl: "/demo/paris-brest/reference-raw.svg",
    storageBucket: "reference-images",
    storagePath: `${DEMO_PROJECT_ID}/paris-brest-raw-choux.svg`,
    runwayUri: "runway://fixture/paris-brest-raw-choux",
    usedInSegments: ["S2"],
  },
  {
    id: "demo-reference-baked-crown",
    canonicalName: "ParisBrestBakedCrown",
    role: "Golden baked choux crown, airy ridges, not a smooth donut.",
    type: "recipe_state",
    source: "fixture_public_safe",
    status: "approved",
    previewUrl: "/demo/paris-brest/reference-baked.svg",
    storageBucket: "reference-images",
    storagePath: `${DEMO_PROJECT_ID}/paris-brest-baked-crown.svg`,
    runwayUri: null,
    usedInSegments: ["S3", "S5", "S6"],
  },
  {
    id: "demo-reference-filled-slice",
    canonicalName: "ParisBrestFilledSlice",
    role: "Cut state showing praline cream ridges and airy choux interior.",
    type: "recipe_state",
    source: "fixture_public_safe",
    status: "uploaded_to_runway",
    previewUrl: "/demo/paris-brest/reference-final.svg",
    storageBucket: "reference-images",
    storagePath: `${DEMO_PROJECT_ID}/paris-brest-filled-slice.svg`,
    runwayUri: "runway://fixture/paris-brest-filled-slice",
    usedInSegments: ["S6"],
  },
];

const demoCostLogs: CostLog[] = [
  costLog("cost-openai-storyboard", "openai", "gpt-5.5-high", "storyboard_generated", null, 0.42, 0, 8220),
  costLog("cost-openai-diff", "openai", "gpt-5.5-high", "prompt_diff_generated", null, 0.08, 0, 1840),
  costLog("cost-runway-segment-1", "runway", "seedance2", "seedance_segment_generation_succeeded", 432, null),
  costLog("cost-runway-segment-2", "runway", "seedance2", "seedance_segment_generation_succeeded", 864, null),
  costLog("cost-runway-reference", "runway", "gpt_image_2", "reference_image_generated", 120, null),
  costLog("cost-mux-playback", "mux", "basic_on_demand", "media_asset_uploaded_to_mux", null, 0.12),
];

const demoPromptDiff = {
  feedbackMessage:
    "The caramel reads too soft. Make it crack into brittle shards and keep the Paris-Brest crown from becoming a smooth donut.",
  promptBefore:
    "Warm praline breaks apart near the Paris-Brest crown. Preserve the ring shape while the mascot works at the kitchen island.",
  promptAfter:
    "Amber praline cracks into brittle glass shards with a sharp ASMR snap beside the Paris-Brest crown. Preserve separate piped choux domes touching in a crown, not a smooth donut or continuous ring.",
  diff: {
    lines: [
      { type: "removed", text: "Warm praline breaks apart near the Paris-Brest crown." },
      { type: "added", text: "Amber praline cracks into brittle glass shards with a sharp ASMR snap beside the Paris-Brest crown." },
      { type: "removed", text: "Preserve the ring shape while the mascot works at the kitchen island." },
      { type: "added", text: "Preserve separate piped choux domes touching in a crown, not a smooth donut or continuous ring." },
    ],
  } satisfies PromptDiff,
};

const demoAssembly: DemoAssembly = {
  finalPreviewUrl: "/demo/paris-brest/final-preview.mp4",
  selectedSegmentIds: [
    "demo-segment-opening",
    "demo-segment-choux-setup",
    "demo-segment-cream",
  ],
  audioStatus: "prompt_ready_no_audio_uploaded",
  totalDurationSeconds: 26,
  storagePlan:
    "Final export should render from Supabase Storage originals, then upload a playback copy to Mux.",
};

const sunoPrompt = [
  "Create a short upbeat French pastry groove for a vertical cooking video.",
  "Mood: playful, premium, warm kitchen ASMR energy.",
  "Instrumentation: light funky bass, soft claps, tiny bell accents, no vocals.",
  "Structure: 4 second hook, 20 second groove, 4 second satisfying finish.",
  "Avoid lyrics, dramatic drops, or anything that competes with kitchen sound effects.",
].join("\n");

function buildDemoGenerations(
  seedanceSegments: SeedanceSegment[],
): DemoSegmentGeneration[] {
  return seedanceSegments.slice(0, 3).map((segment, index) => {
    const generationId = `demo-generation-${index + 1}`;
    const clipNumber = (index + 1).toString().padStart(2, "0");

    return {
      id: generationId,
      segmentId: segment.id,
      mediaAssetId: `demo-media-${index + 1}`,
      model: "seedance2",
      modelParams: {
        duration: segment.durationTarget,
        ratio: RUNWAY_DEFAULT_VIDEO_RATIO,
        mode: "References",
      },
      runwayTaskId: `fixture-task-paris-brest-${clipNumber}`,
      status: "succeeded",
      costCredits: Math.ceil(
        segment.durationTarget * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND,
      ),
      durationSeconds: segment.durationTarget,
      triggeredBy: "fixture",
      createdAt: CREATED_AT,
      completedAt: UPDATED_AT,
      title: segment.title,
      clipUrl: `/demo/paris-brest/segment-${clipNumber}.mp4`,
      selected: index < 2,
      mediaAsset: {
        id: `demo-media-${index + 1}`,
        videoId: DEMO_PROJECT_ID,
        segmentId: segment.id,
        generationId,
        type: index < 2 ? "accepted_clip" : "runway_output",
        provider: "supabase",
        storageBucket: index < 2 ? "accepted-clips" : "runway-outputs",
        storagePath: `${DEMO_PROJECT_ID}/${segment.id}/${generationId}.mp4`,
        muxAssetId: `fixture-mux-asset-${clipNumber}`,
        muxPlaybackId: `fixture-playback-${clipNumber}`,
        runwayOutputUrl: null,
        originalFilename: `segment-${clipNumber}.mp4`,
        mimeType: "video/mp4",
        fileSizeBytes: 184000,
        durationSeconds: segment.durationTarget,
        width: 720,
        height: 1280,
        status: "uploaded_to_mux",
        metadata: {
          fixture: true,
          publicDemoUrl: `/demo/paris-brest/segment-${clipNumber}.mp4`,
        },
        createdBy: "fixture",
        createdAt: CREATED_AT,
        updatedAt: UPDATED_AT,
      },
    };
  });
}

function costLog(
  id: string,
  provider: string,
  model: string,
  operation: string,
  creditsUsed: number | null,
  costDollars: number | null,
  tokensInput?: number | null,
  tokensOutput?: number | null,
): CostLog {
  return {
    id,
    videoId: DEMO_PROJECT_ID,
    segmentId: null,
    provider,
    model,
    operation,
    creditsUsed,
    costDollars,
    tokensInput,
    tokensOutput,
    metadata: {
      fixture: true,
      source: "fixture:paris-brest-public-safe",
    },
    createdBy: "fixture",
    createdAt: UPDATED_AT,
  };
}

function getSegmentStatus(position: number): SeedanceSegment["status"] {
  if (position <= 2) {
    return "accepted";
  }

  if (position === 3) {
    return "review";
  }

  return "ready";
}

function extractTiming(prompt: string) {
  return prompt
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));
}
