import type { CostLogWriter, OpenAiTokenUsage } from "@/modules/costs/cost.types";
import { noopCostLogWriter } from "@/modules/costs/cost.types";
import type { PromptDiff, PromptEditInput, PromptEditResult } from "@/modules/feedback/feedback.types";
import type {
  ClarifyingQuestion,
  RecipeAnalysisInput,
  RecipeAnalysisResult,
  RecipeData,
} from "@/modules/recipe-ingest/recipe.types";
import {
  RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS,
  RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS,
} from "@/modules/generation/runway.constants";
import {
  DEFAULT_SEEDANCE_VIDEO_MODEL,
  DEFAULT_VERTICAL_RATIO,
  FOOD_VIDEO_PROMPT_RULES,
  MAX_SEEDANCE_PROMPT_CHARACTERS,
  MAX_SEEDANCE_REFERENCES,
  MIN_LOGICAL_SCENES,
  OPENAI_REASONING_MODEL,
  SEEDANCE_PROMPT_SKELETON,
  TARGET_SEEDANCE_SEGMENT_COUNT,
  VIDEOS_REPO_POLICY_SOURCES,
} from "@/modules/storyboard/storyboard.constants";
import type {
  LogicalScene,
  RunwaySafeScore,
  SeedanceSegment,
  SeedanceSegmentationInput,
  SeedancePromptQa,
  SegmentReference,
  StoryboardGenerationInput,
} from "@/modules/storyboard/storyboard.types";
import {
  createOpenAiPlanningClient,
  type OpenAiPlanningClient,
} from "./openai-planning-client";
import {
  LogicalScenesEnvelopeSchema,
  PromptEditResultSchema,
  RecipeAnalysisResultSchema,
  SeedanceSegmentsEnvelopeSchema,
  validatePlanningOutput,
} from "./planning-output-schemas";

type PlanningOperation =
  | "recipe_analysis"
  | "storyboard_generation"
  | "seedance_segmentation"
  | "prompt_edit";

interface PlanningPromptEngineOptions {
  mode?: "stub" | "live";
  model?: string;
  costLogWriter?: CostLogWriter;
  openAiClient?: OpenAiPlanningClient;
}

export interface PlanningPromptEngine {
  analyzeRecipe(input: RecipeAnalysisInput): Promise<RecipeAnalysisResult>;
  generateLogicalScenes(input: StoryboardGenerationInput): Promise<LogicalScene[]>;
  compressToSeedanceSegments(input: SeedanceSegmentationInput): Promise<SeedanceSegment[]>;
  editPromptFromFeedback(input: PromptEditInput): Promise<PromptEditResult>;
}

/**
 * Resolves the planning mode. Default is `"live"` so that production paths hit
 * OpenAI as the contract requires. Set `RECIPE2VIDEO_PLANNING_MODE=stub` in
 * the environment to opt out (used for local rehearsals or CI without an
 * OpenAI key). Tests can pass `mode` explicitly via options.
 */
function resolveDefaultPlanningMode(): "stub" | "live" {
  const envMode = process.env.RECIPE2VIDEO_PLANNING_MODE;
  if (envMode === "stub") {
    return "stub";
  }
  return "live";
}

export function createGpt55PlanningPromptEngine(
  options: PlanningPromptEngineOptions = {},
): PlanningPromptEngine {
  const mode = options.mode ?? resolveDefaultPlanningMode();
  const model = options.model ?? OPENAI_REASONING_MODEL;
  const costLogWriter = options.costLogWriter ?? noopCostLogWriter;

  assertConfiguredModel(model);
  const openAiClient =
    mode === "live" ? options.openAiClient ?? createOpenAiPlanningClient() : null;

  return {
    async analyzeRecipe(input) {
      assertPlanningCallerProvided(input);

      const prompt = buildRecipeAnalysisPrompt(input);
      if (openAiClient) {
        const result = await openAiClient.generateJson<unknown>({
          operation: "recipe_analysis",
          prompt,
        });

        const validated = validatePlanningOutput(
          RecipeAnalysisResultSchema,
          result.json,
          "recipe_analysis",
        ) as RecipeAnalysisResult;

        await logTokenUsage({
          costLogWriter,
          videoId: input.videoId,
          createdBy: input.requestedByUserId,
          operation: "recipe_analysis",
          model,
          usage: result.usage,
          metadata: { sourceType: input.sourceType },
        });

        return validated;
      }

      const result = stubRecipeAnalysis(input);

      await logTokenUsage({
        costLogWriter,
        videoId: input.videoId,
        createdBy: input.requestedByUserId,
        operation: "recipe_analysis",
        model,
        usage: estimateTokenUsage(prompt, JSON.stringify(result)),
        metadata: { sourceType: input.sourceType },
      });

      return result;
    },

    async generateLogicalScenes(input) {
      assertPlanningCallerProvided(input);

      const prompt = buildStoryboardGenerationPrompt(input);
      if (openAiClient) {
        const result = await openAiClient.generateJson<unknown>({
          operation: "storyboard_generation",
          prompt,
        });

        const validated = validatePlanningOutput(
          LogicalScenesEnvelopeSchema,
          result.json,
          "storyboard_generation",
        );
        const logicalScenes = validated.logicalScenes as LogicalScene[];

        await logTokenUsage({
          costLogWriter,
          videoId: input.videoId,
          createdBy: input.requestedByUserId,
          operation: "storyboard_generation",
          model,
          usage: result.usage,
          metadata: { logicalSceneCount: logicalScenes.length },
        });

        return logicalScenes;
      }

      const scenes = stubLogicalScenes(input);

      await logTokenUsage({
        costLogWriter,
        videoId: input.videoId,
        createdBy: input.requestedByUserId,
        operation: "storyboard_generation",
        model,
        usage: estimateTokenUsage(prompt, JSON.stringify(scenes)),
        metadata: { logicalSceneCount: scenes.length },
      });

      return scenes;
    },

    async compressToSeedanceSegments(input) {
      assertPlanningCallerProvided(input);

      const prompt = buildSeedanceSegmentationPrompt(input);
      if (openAiClient) {
        const result = await openAiClient.generateJson<unknown>({
          operation: "seedance_segmentation",
          prompt,
        });

        const validated = validatePlanningOutput(
          SeedanceSegmentsEnvelopeSchema,
          result.json,
          "seedance_segmentation",
        );
        const seedanceSegments = validated.seedanceSegments as SeedanceSegment[];

        await logTokenUsage({
          costLogWriter,
          videoId: input.videoId,
          createdBy: input.requestedByUserId,
          operation: "seedance_segmentation",
          model,
          usage: result.usage,
          metadata: { segmentCount: seedanceSegments.length },
        });

        return seedanceSegments;
      }

      const segments = stubSeedanceSegments(input);

      await logTokenUsage({
        costLogWriter,
        videoId: input.videoId,
        createdBy: input.requestedByUserId,
        operation: "seedance_segmentation",
        model,
        usage: estimateTokenUsage(prompt, JSON.stringify(segments)),
        metadata: { segmentCount: segments.length },
      });

      return segments;
    },

    async editPromptFromFeedback(input) {
      assertPlanningCallerProvided(input);

      const prompt = buildPromptEditPrompt(input);
      if (openAiClient) {
        const result = await openAiClient.generateJson<unknown>({
          operation: "prompt_edit",
          prompt,
        });

        const validated = validatePlanningOutput(
          PromptEditResultSchema,
          result.json,
          "prompt_edit",
        ) as PromptEditResult;

        await logTokenUsage({
          costLogWriter,
          videoId: input.videoId,
          segmentId: input.segmentId,
          createdBy: input.requestedByUserId,
          operation: "prompt_edit",
          model,
          usage: result.usage,
          metadata: { generationId: input.generationId },
        });

        return validated;
      }

      const result = stubPromptEdit(input);

      await logTokenUsage({
        costLogWriter,
        videoId: input.videoId,
        segmentId: input.segmentId,
        createdBy: input.requestedByUserId,
        operation: "prompt_edit",
        model,
        usage: estimateTokenUsage(prompt, JSON.stringify(result)),
        metadata: { generationId: input.generationId },
      });

      return result;
    },
  };
}

export function buildRecipeAnalysisPrompt(input: RecipeAnalysisInput): string {
  return [
    `Model: ${OPENAI_REASONING_MODEL}`,
    "Task: analyze a recipe for Recipe2Video without launching media generation.",
    "Return JSON with title, ingredients, sub-recipes, assumptions, steps, timing, critical transformations, visual texture opportunities, possible hooks, and material clarifying questions only.",
    "Ask clarifying questions only when answers materially change the video plan.",
    "Apply the videos repo policy sources as named source material; do not collapse them into generic food-video advice.",
    `Policy sources:\n${VIDEOS_REPO_POLICY_SOURCES.map((source) => `- ${source}`).join("\n")}`,
    `Source type: ${input.sourceType}`,
    input.recipeUrl ? `Recipe URL: ${input.recipeUrl}` : null,
    input.recipeText ? `Recipe text:\n${input.recipeText}` : null,
    input.photoDescriptions?.length
      ? `Photo descriptions:\n${input.photoDescriptions.join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildStoryboardGenerationPrompt(input: StoryboardGenerationInput): string {
  return [
    `Model: ${OPENAI_REASONING_MODEL}`,
    "Task: generate a 30-48 logical-scene storyboard for a vertical Licorn cooking video.",
    "Return a JSON object with a `logicalScenes` array only. Do not create Runway tasks.",
    `Recipe title: ${input.recipeTitle}`,
    `Target duration seconds: ${input.targetDurationSeconds ?? 60}`,
    "Required output shape: 30-48 logical scenes with id, type, arc, description, bg, zoom, duration, note, texture cue, SFX cue, satisfaction beat, and Runway-safe score.",
    "Enforce the videos repo sequencing policy: micro-arc scenes 1-3, 70-80% detail shots, context only when it prepares the next detail, final dressing gesture before the hero shot, final dish on island_default with the character satisfied.",
    "Recipe steps:",
    input.recipeSteps.map((step, index) => `${index + 1}. ${step}`).join("\n"),
    "Creative rules:",
    FOOD_VIDEO_PROMPT_RULES.map((rule) => `- ${rule}`).join("\n"),
  ].join("\n\n");
}

export function buildSeedanceSegmentationPrompt(input: SeedanceSegmentationInput): string {
  return [
    `Model: ${OPENAI_REASONING_MODEL}`,
    `Task: compress logical scenes into approximately ${TARGET_SEEDANCE_SEGMENT_COUNT} Seedance generation segments.`,
    `Default video model: ${DEFAULT_SEEDANCE_VIDEO_MODEL}`,
    `Default ratio: ${DEFAULT_VERTICAL_RATIO}`,
    "Return a JSON object with a `seedanceSegments` array only. Do not launch Runway generation.",
    `Each segment's durationTarget MUST be an integer number of seconds from ${RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS} to ${RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS} inclusive (Runway Seedance 2 API); align prompt timing bullets to the same total.`,
    "Each segment must include mode References, references to load, 2-4 visual beats, continuity, risk, prompt, timing, audio, negatives, and QA checklist.",
    "Seedance prompt skeleton:",
    SEEDANCE_PROMPT_SKELETON.map((rule) => `- ${rule}`).join("\n"),
    `Reference limit: ${MAX_SEEDANCE_REFERENCES}`,
    "Logical scenes:",
    input.logicalScenes
      .map((scene) => `${scene.position}. [${scene.sceneType}] ${scene.description}`)
      .join("\n"),
  ].join("\n\n");
}

export function buildPromptEditPrompt(input: PromptEditInput): string {
  return [
    `Model: ${OPENAI_REASONING_MODEL}`,
    "Task: revise one Seedance prompt from natural-language feedback.",
    "Return a JSON object with camelCase keys only: promptBefore, promptAfter, and diff.",
    "diff must be `{ \"lines\": [{ \"type\": \"unchanged\" | \"added\" | \"removed\", \"text\": string }] }`.",
    "Do not trigger regeneration. Do not switch models. Preserve References mode, hard cuts, timing, reference roles, kitchen identity, visible hands, ASMR-only audio, concise negatives, and prompt length.",
    `Feedback: ${input.feedbackMessage}`,
    "Prompt before:",
    input.promptBefore,
  ].join("\n\n");
}

function stubRecipeAnalysis(input: RecipeAnalysisInput): RecipeAnalysisResult {
  const sourceText = input.recipeText ?? input.photoDescriptions?.join(" ") ?? input.recipeUrl ?? "demo recipe";
  const title = inferRecipeTitle(sourceText);
  const steps = inferRecipeSteps(sourceText);

  const recipe: RecipeData = {
    title,
    sourceType: input.sourceType,
    sourceUrl: input.recipeUrl ?? null,
    ingredients: inferIngredients(sourceText),
    steps: steps.map((step, index) => ({
      position: index + 1,
      text: step,
      block: inferRecipeBlock(step, index),
      visualCue: inferVisualCue(step),
      textureCue: inferTextureCue(step),
      runwayRisk: inferRunwayRisk(step),
    })),
    subRecipes: inferSubRecipes(sourceText),
    assumptions: inferRecipeAssumptions(sourceText, title),
    timing: null,
    criticalTransformations: [
      "raw ingredients becoming a structured mixture",
      "heat changing color, texture, and shape",
      "final plating and texture reveal",
    ],
    visualTextureOpportunities: [
      "close macro texture before the first context shot",
      "contrast between raw and cooked states",
      "final crack, slice, pull, gloss, or crumb reveal",
    ],
    possibleHooks: [
      `A texture-first reveal of ${title.toLowerCase()} before the full recipe context`,
      "Licorn reacts to the first sensory payoff in the kitchen",
    ],
    promptPolicySources: [...VIDEOS_REPO_POLICY_SOURCES],
  };

  return {
    recipe,
    clarifyingQuestions: buildClarifyingQuestions(recipe),
  };
}

function stubLogicalScenes(input: StoryboardGenerationInput): LogicalScene[] {
  const sceneCount = MIN_LOGICAL_SCENES;
  const targetDuration = input.targetDurationSeconds ?? 60;
  const durationTarget = Number((targetDuration / sceneCount).toFixed(2));
  const steps = input.recipeSteps.length > 0 ? input.recipeSteps : ["Prepare the recipe"];

  return Array.from({ length: sceneCount }, (_, index) => {
    const position = index + 1;
    const step = steps[index % steps.length];
    const isOpening = position <= 3;
    const isFinale = position > sceneCount - 3;
    const sceneType: LogicalScene["sceneType"] = position % 4 === 0 ? "context" : "detail";

    return {
      id: `${input.videoId}-scene-${String(position).padStart(2, "0")}`,
      videoId: input.videoId,
      segmentId: null,
      position,
      sceneType,
      arc: isOpening ? "texture hook" : isFinale ? "hero payoff" : inferArc(position, sceneCount),
      description: buildSceneDescription({
        position,
        recipeTitle: input.recipeTitle,
        step,
        isOpening,
        isFinale,
      }),
      bg: "Licorn kitchen island",
      zoom: sceneType === "detail" ? "macro close-up" : "medium kitchen context",
      durationTarget,
      note:
        position % 4 === 0 || isOpening || isFinale
          ? "Texture payoff or material contrast checkpoint."
          : null,
      textureCue: inferTextureCue(step),
      sfxCue: inferSfxCue(step),
      satisfactionBeat: position <= 3 || position % 4 === 0 || isFinale,
      runwaySafeScore: buildRunwaySafeScore({
        sceneType,
        description: step,
        satisfactionBeat: position <= 3 || position % 4 === 0 || isFinale,
      }),
    };
  });
}

function stubSeedanceSegments(input: SeedanceSegmentationInput): SeedanceSegment[] {
  const segmentCount = Math.min(
    TARGET_SEEDANCE_SEGMENT_COUNT,
    Math.max(1, Math.ceil(input.logicalScenes.length / 6)),
  );
  const scenesPerSegment = Math.ceil(input.logicalScenes.length / segmentCount);

  return Array.from({ length: segmentCount }, (_, index) => {
    const position = index + 1;
    const scenes = input.logicalScenes.slice(index * scenesPerSegment, (index + 1) * scenesPerSegment);
    const firstScene = scenes[0];
    const lastScene = scenes[scenes.length - 1] ?? firstScene;
    const references = buildSegmentReferences(position);
    const heuristicSeconds = Number((scenes.length * 2).toFixed(0));
    const durationTarget = Math.min(
      RUNWAY_SEEDANCE2_MAX_DURATION_SECONDS,
      Math.max(RUNWAY_SEEDANCE2_MIN_DURATION_SECONDS, heuristicSeconds),
    );
    const beats = buildSegmentBeats(scenes);
    const timing = buildSegmentTiming(scenes, durationTarget);
    const risk = inferSegmentRisk(scenes);
    const prompt = buildSeedancePrompt({
      position,
      title: buildSegmentTitle(position, firstScene, lastScene),
      scenes,
      references,
      beats,
      timing,
      risk,
      durationTarget,
    });
    const qaChecklist = buildSeedancePromptQa({ prompt, references, risk });

    return {
      id: `${input.videoId}-segment-${String(position).padStart(2, "0")}`,
      videoId: input.videoId,
      position,
      title: buildSegmentTitle(position, firstScene, lastScene),
      arc: firstScene?.arc ?? "recipe progression",
      mode: "References",
      logicalSceneIds: scenes.map((scene) => scene.id),
      description: scenes.map((scene) => scene.description).join(" "),
      prompt,
      promptInitial: prompt,
      references,
      beats,
      timing,
      continuity: buildSegmentContinuity(position, scenes),
      risk,
      audioPrompt: buildMandatoryAudio(timing),
      negatives: buildSegmentNegatives(risk),
      qaChecklist,
      durationTarget,
      status: "ready",
      selectedGenerationId: null,
    };
  });
}

function stubPromptEdit(input: PromptEditInput): PromptEditResult {
  const correction = input.feedbackMessage.trim().replace(/\s+/g, " ");
  const promptAfter = reviseSeedancePrompt(input.promptBefore, correction);

  return {
    promptBefore: input.promptBefore,
    promptAfter,
    diff: buildLineDiff(input.promptBefore, promptAfter),
  };
}

function buildSeedancePrompt(input: {
  position: number;
  title: string;
  scenes: LogicalScene[];
  references: SegmentReference[];
  beats: string[];
  timing: string[];
  risk: string;
  durationTarget: number;
}): string {
  return [
    input.references
      .map((reference) => `Use @${reference.label} only as ${reference.role}.`)
      .join(" "),
    "Use @KitchenLayoutContextWide as structural kitchen context in every segment. Add one shot-specific kitchen view (@KitchenIslandDefault, @KitchenIslandOverhead, @InductionWide, etc.) to preserve materials and layout continuity without forcing a wide framing.",
    "Use character references to preserve identity and hands. The character's face may stay out of frame in macro shots, but hands must be visible on every human action.",
    `Generate exactly ${input.timing.length} short shots with hard cuts, total duration ${input.durationTarget} seconds, no slow motion, no soft transitions, no extra shots. TikTok/Reels food ASMR style, no text on screen.`,
    "Integrated audio: no speech, no voiceover, no music. Only close-up kitchen ASMR sounds synchronized with the cuts and food actions.",
    "Visual beats:",
    ...input.beats.map((beat) => `- ${beat}`),
    "Mandatory timing:",
    ...input.timing.map((line) => `- ${line}`),
    `Risk to control: ${input.risk}`,
    `Global negatives: ${buildSegmentNegatives(input.risk).join(", ")}.`,
    `Mandatory audio: ${buildMandatoryAudio(input.timing)}`,
  ].join("\n");
}

function buildSegmentReferences(position: number): SegmentReference[] {
  return [
    {
      id: `reference-kitchen-context-${position}`,
      role: "structural kitchen context and layout anchor",
      name: "KitchenLayoutContextWide",
      label: "KitchenLayoutContextWide",
      runwayUri: null,
      required: true,
    },
    {
      id: `reference-kitchen-${position}`,
      role: "shot-specific kitchen view for active framing and material continuity",
      name: "KitchenIslandDefault",
      label: "KitchenIslandDefault",
      runwayUri: null,
      required: true,
    },
    {
      id: `reference-mascot-${position}`,
      role: "Licorn mascot cook with consistent body and expression",
      name: "LicornMascot",
      label: "LicornMascot",
      runwayUri: null,
      required: true,
    },
    {
      id: `reference-food-state-${position}`,
      role: "current recipe state and fragile food geometry",
      name: "RecipeState",
      label: "RecipeState",
      runwayUri: null,
      required: true,
    },
  ];
}

function buildSegmentBeats(scenes: LogicalScene[]): string[] {
  const strongScenes = scenes.filter((scene) => scene.satisfactionBeat || scene.textureCue);
  const selectedScenes = (strongScenes.length > 0 ? strongScenes : scenes).slice(0, 4);

  return selectedScenes.map((scene) => scene.textureCue ?? scene.description);
}

function buildSegmentTiming(scenes: LogicalScene[], durationTarget: number): string[] {
  const shotCount = Math.min(Math.max(scenes.length, 2), 8);
  const shotDuration = Number((durationTarget / shotCount).toFixed(1));

  return Array.from({ length: shotCount }, (_, index) => {
    const scene = scenes[index] ?? scenes[scenes.length - 1];
    const start = Number((index * shotDuration).toFixed(1));
    const end = index === shotCount - 1 ? durationTarget : Number(((index + 1) * shotDuration).toFixed(1));

    return `${start.toFixed(1)}-${end.toFixed(1)}s: ${scene.description}`;
  });
}

function buildSegmentContinuity(position: number, scenes: LogicalScene[]): string {
  if (position === 1) {
    return "Opening segment; no prior product continuity required.";
  }

  const hasFragileGeometry = scenes.some((scene) => mentionsFragileGeometry(scene.description));

  if (hasFragileGeometry) {
    return "Use the best prior product-state frame if available; preserve topology with hard cuts rather than free-form morphing.";
  }

  return "Preserve kitchen, character, utensil, and current recipe-state continuity from the prior approved segment.";
}

function inferSegmentRisk(scenes: LogicalScene[]): string {
  const text = scenes.map((scene) => scene.description).join(" ").toLowerCase();

  if (mentionsFragileGeometry(text)) {
    return "Fragile repetitive pastry geometry may drift; describe what the shape is and what it is not, and prefer target state frames.";
  }

  if (text.includes("oven") || text.includes("bake") || text.includes("cuisson")) {
    return "Baking may change geometry; avoid free morphing and use raw/baked state frames when shape matters.";
  }

  if (text.includes("rolling pin") || text.includes("rouleau")) {
    return "Utensil motion can be misread; lock whether the rolling pin rolls normally or moves vertically like a mallet.";
  }

  if (text.includes("induction") || text.includes("hob")) {
    return "Induction visuals may hallucinate flame or glow; explicitly forbid flame, red/blue glow, and heat halo.";
  }

  return "Keep one readable food action per shot and avoid extra objects or unsupported camera movement.";
}

function buildSegmentNegatives(risk: string): string[] {
  const negatives = [
    "no text on screen",
    "no slow pacing",
    "no extra shots",
    "no deformed character",
    "no floating utensils",
  ];

  if (risk.includes("geometry") || risk.includes("shape")) {
    negatives.push("no unstable pastry geometry", "no invented topology", "no scale mismatch");
  }

  if (risk.includes("Induction")) {
    negatives.push("no flame", "no red glow", "no blue glow", "no heat halo");
  }

  if (risk.includes("rolling pin")) {
    negatives.push("no wrong rolling-pin motion", "no added handles");
  }

  return negatives;
}

function buildMandatoryAudio(timing: string[]): string {
  return timing
    .map((line) => {
      const [range, description] = line.split(": ");
      return `${range} ${inferSfxCue(description ?? line)}`;
    })
    .join("; ");
}

function buildSeedancePromptQa(input: {
  prompt: string;
  references: SegmentReference[];
  risk: string;
}): SeedancePromptQa {
  const hasKitchenLayoutContext = input.references.some(
    (reference) => reference.label === "KitchenLayoutContextWide",
  );
  const hasShotSpecificKitchenView = input.references.some((reference) => {
    if (reference.label === "KitchenLayoutContextWide") {
      return false;
    }
    const name = `${reference.label} ${reference.name}`.toLowerCase();
    return (
      name.includes("kitchen") ||
      name.includes("island") ||
      name.includes("induction") ||
      name.includes("oven")
    );
  });

  return {
    referencesWithinLimit: input.references.length <= MAX_SEEDANCE_REFERENCES,
    globalKitchenReferencePresent:
      hasKitchenLayoutContext && hasShotSpecificKitchenView,
    referenceRolesExplicit: input.references.every((reference) => reference.role.length > 0),
    promptWithinPracticalLimit: input.prompt.length <= MAX_SEEDANCE_PROMPT_CHARACTERS,
    hardCutsSpecified: input.prompt.includes("hard cuts"),
    mandatoryTimingSpecified: input.prompt.includes("Mandatory timing"),
    noSpeechVoiceoverOrMusic: input.prompt.includes("no speech") && input.prompt.includes("no voiceover") && input.prompt.includes("no music"),
    fragileFoodPhysicsHandled: input.risk.length > 0,
    nonStandardGeometryHandled: !input.risk.includes("geometry") || input.prompt.includes("what the shape is and what it is not"),
    sourcePoliciesApplied: [...VIDEOS_REPO_POLICY_SOURCES],
  };
}

function buildLineDiff(before: string, after: string): PromptDiff {
  const beforeLines = before.split("\n");
  const afterLines = after.split("\n");
  const unchangedPrefixLength = beforeLines.findIndex((line, index) => line !== afterLines[index]);
  const prefixLength = unchangedPrefixLength === -1 ? beforeLines.length : unchangedPrefixLength;

  return {
    lines: [
      ...beforeLines.slice(0, prefixLength).map((text) => ({ type: "unchanged" as const, text })),
      ...beforeLines.slice(prefixLength).map((text) => ({ type: "removed" as const, text })),
      ...afterLines.slice(prefixLength).map((text) => ({ type: "added" as const, text })),
    ],
  };
}

function assertConfiguredModel(model: string) {
  if (model !== OPENAI_REASONING_MODEL) {
    throw new Error(`Planning engine requires ${OPENAI_REASONING_MODEL}. No silent model fallback is allowed.`);
  }
}

/**
 * Sanity check on the planning input shape. The caller (Inngest handler or
 * server action) is responsible for the actual allowlist verification through
 * `assertAllowlistedUser` or `assertCostlyActionAllowed`. Renamed to avoid the
 * homonym with the auth helper of the same legacy name.
 */
function assertPlanningCallerProvided(input: { requestedByUserId?: string | null }) {
  if (!input.requestedByUserId) {
    throw new Error("Planning calls require a triggering user ID.");
  }
}

async function logTokenUsage(input: {
  costLogWriter: CostLogWriter;
  videoId: string;
  segmentId?: string | null;
  createdBy: string;
  operation: PlanningOperation;
  model: string;
  usage: OpenAiTokenUsage;
  metadata?: Record<string, unknown>;
}) {
  await input.costLogWriter.logOpenAiUsage({
    videoId: input.videoId,
    segmentId: input.segmentId ?? null,
    model: input.model,
    operation: input.operation,
    costDollars: null,
    tokensInput: input.usage.inputTokens,
    tokensOutput: input.usage.outputTokens,
    metadata: input.metadata,
    createdBy: input.createdBy,
  });
}

function estimateTokenUsage(prompt: string, output: string): OpenAiTokenUsage {
  return {
    inputTokens: estimateTokens(prompt),
    outputTokens: estimateTokens(output),
  };
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

function reviseSeedancePrompt(promptBefore: string, correction: string): string {
  const lines = promptBefore.trim().split("\n");
  const riskLineIndex = lines.findIndex((line) => line.startsWith("Risk to control:"));
  const negativeLineIndex = lines.findIndex((line) => line.startsWith("Global negatives:"));
  const correctionLine = `Correction to apply: ${correction}. Preserve References mode, all @reference roles, mandatory timing, hard cuts, visible hands for human actions, kitchen identity, and ASMR-only audio.`;

  if (riskLineIndex >= 0) {
    lines[riskLineIndex] = `${lines[riskLineIndex]} ${correctionLine}`;
  } else {
    lines.push(correctionLine);
  }

  if (negativeLineIndex >= 0 && !lines[negativeLineIndex].toLowerCase().includes(correction.toLowerCase())) {
    lines[negativeLineIndex] = `${lines[negativeLineIndex].replace(/\.$/, "")}, no recurrence of: ${correction}.`;
  }

  return lines.join("\n");
}

function inferRecipeTitle(sourceText: string): string {
  const firstLine = sourceText
    .split(/\n|\./)
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine) {
    return "Untitled recipe";
  }

  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

function inferSubRecipes(sourceText: string): string[] {
  const lower = sourceText.toLowerCase();
  const subRecipes = new Set<string>();

  if (lower.includes("pralin")) subRecipes.add("praline");
  if (lower.includes("crumble")) subRecipes.add("crumble");
  if (lower.includes("choux")) subRecipes.add("choux pastry");
  if (lower.includes("cream") || lower.includes("creme") || lower.includes("crème")) subRecipes.add("cream");
  if (lower.includes("caramel")) subRecipes.add("caramel");

  return subRecipes.size > 0 ? [...subRecipes] : ["main preparation", "assembly", "final dressing"];
}

function inferRecipeAssumptions(sourceText: string, title: string): string[] {
  const assumptions = ["Translate recipe instructions into visible cooking gestures rather than literal procedural text."];
  const lower = `${sourceText} ${title}`.toLowerCase();

  if (lower.includes("paris") || lower.includes("choux")) {
    assumptions.push("Treat Paris-Brest as a non-standard repetitive crown when visible: separate piped choux domes touching in a ring, not a smooth classic ring.");
  }

  if (lower.includes("pralin")) {
    assumptions.push("Homemade praline can be used as a mobile opening block when it creates a stronger texture-first hook and is re-anchored later.");
  }

  return assumptions;
}

function inferRecipeBlock(step: string, index: number): string {
  const lower = step.toLowerCase();

  if (lower.includes("caramel") || lower.includes("pralin")) return "praline";
  if (lower.includes("crumble")) return "crumble";
  if (lower.includes("choux") || lower.includes("piping") || lower.includes("pipe")) return "choux";
  if (lower.includes("cream") || lower.includes("creme") || lower.includes("crème")) return "cream";
  if (lower.includes("finish") || lower.includes("dust") || lower.includes("assemble")) return "assembly";

  return index < 3 ? "opening" : "main preparation";
}

function inferRecipeSteps(sourceText: string): string[] {
  const candidates = sourceText
    .split(/\n|\.\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 12);

  if (candidates.length > 0) {
    return candidates.slice(0, 8);
  }

  return [
    "Prepare the ingredients and tools",
    "Mix the base preparation",
    "Cook until the texture changes visibly",
    "Assemble and finish the dish",
  ];
}

function inferTextureCue(step: string): string {
  const lower = step.toLowerCase();

  if (lower.includes("caramel")) return "glossy amber caramel changing from viscous pour to brittle glass shards";
  if (lower.includes("pralin")) return "smooth oily hazelnut praline ribbon, amber-brown and glossy";
  if (lower.includes("crumble")) return "matte sandy crumble contrasting with shiny pastry";
  if (lower.includes("choux")) return "golden glossy choux paste becoming elastic, puffed, crisp, or airy";
  if (lower.includes("cream") || lower.includes("creme") || lower.includes("crème")) return "dense glossy cream becoming satin, airy, and thick";
  if (lower.includes("sugar")) return "fine white powdered sugar falling over warm golden pastry";

  return "visible material contrast with color, shine, density, and texture stated explicitly";
}

function inferSfxCue(step: string): string {
  const lower = step.toLowerCase();

  if (lower.includes("caramel") && (lower.includes("crack") || lower.includes("hit"))) return "sharp brittle caramel crack";
  if (lower.includes("caramel")) return "thick hot caramel pouring";
  if (lower.includes("blender")) return "short dense blender sound";
  if (lower.includes("mixer") || lower.includes("robot")) return "low mixer hum and thick food friction";
  if (lower.includes("cream") || lower.includes("creme") || lower.includes("crème")) return "thick cream folding and glossy whisking";
  if (lower.includes("oven") || lower.includes("bake")) return "low oven warmth, tray slide, and crisp crackles";
  if (lower.includes("dust") || lower.includes("sugar")) return "fine sugar dusting";

  return "close-up kitchen ASMR synchronized to the action";
}

function inferRunwayRisk(step: string): string {
  const lower = step.toLowerCase();

  if (mentionsFragileGeometry(lower)) return "fragile non-standard or repetitive geometry";
  if (lower.includes("bake") || lower.includes("oven")) return "baking geometry drift";
  if (lower.includes("cut") || lower.includes("slice")) return "cut axis and hand precision";
  if (lower.includes("roll") || lower.includes("rolling pin")) return "utensil motion ambiguity";

  return "generic one-action readability";
}

function inferIngredients(sourceText: string) {
  const knownIngredients = [
    "flour",
    "butter",
    "sugar",
    "eggs",
    "cream",
    "chocolate",
    "caramel",
    "vanilla",
    "salt",
  ];
  const lower = sourceText.toLowerCase();
  const matches = knownIngredients.filter((ingredient) => lower.includes(ingredient));

  return (matches.length > 0 ? matches : ["main ingredient"]).map((name) => ({ name }));
}

function inferVisualCue(step: string): string {
  const lower = step.toLowerCase();

  if (lower.includes("bake") || lower.includes("cook")) {
    return "color and structure changing under heat";
  }

  if (lower.includes("mix") || lower.includes("whisk")) {
    return "texture smoothing as ingredients combine";
  }

  if (lower.includes("fill") || lower.includes("pipe")) {
    return "precise filling and layered geometry";
  }

  return "clear material transformation";
}

function buildRunwaySafeScore(input: {
  sceneType: LogicalScene["sceneType"];
  description: string;
  satisfactionBeat: boolean;
}): RunwaySafeScore {
  const lower = input.description.toLowerCase();
  const fragile = mentionsFragileGeometry(lower) || lower.includes("slice") || lower.includes("cut");

  return {
    stillImageReadable: true,
    singleMainMotion: !lower.includes(" and then "),
    dominantSound: true,
    visuallyDesirable: input.satisfactionBeat || input.sceneType === "detail",
    textureContrast: input.satisfactionBeat || hasTextureLanguage(lower),
    notes: fragile
      ? ["Fragile scene: simplify action or require target state references before generation."]
      : ["Runway-safe if kept to one visible action and one dominant sound."],
  };
}

function hasTextureLanguage(text: string): boolean {
  return [
    "glossy",
    "shiny",
    "crisp",
    "brittle",
    "sandy",
    "matte",
    "steam",
    "dense",
    "ribbon",
    "crack",
    "smooth",
    "cream",
  ].some((word) => text.includes(word));
}

function mentionsFragileGeometry(text: string): boolean {
  return [
    "paris-brest",
    "crown",
    "ring",
    "choux",
    "rosette",
    "piping",
    "pipe",
    "layer",
    "cut",
    "slice",
    "filled",
  ].some((word) => text.toLowerCase().includes(word));
}

function buildClarifyingQuestions(recipe: RecipeData): ClarifyingQuestion[] {
  const questions: ClarifyingQuestion[] = [];
  const lowerTitle = recipe.title.toLowerCase();

  if (lowerTitle.includes("cake") || lowerTitle.includes("pastry") || lowerTitle.includes("paris")) {
    questions.push({
      id: "dish-geometry",
      question: "Does the final dish have a specific shape or cut state that must be preserved?",
      reason: "Non-standard geometry changes the reference plan and final hero shot.",
    });
  }

  if (recipe.steps.length < 4) {
    questions.push({
      id: "missing-transformations",
      question: "Which transformation should be the strongest visual payoff?",
      reason: "Sparse recipe steps need one explicit visual anchor before storyboard generation.",
    });
  }

  return questions;
}

function inferArc(position: number, total: number): string {
  if (position < total * 0.35) {
    return "setup and preparation";
  }

  if (position < total * 0.75) {
    return "transformation and assembly";
  }

  return "finishing and reveal";
}

function buildSceneDescription(input: {
  position: number;
  recipeTitle: string;
  step: string;
  isOpening: boolean;
  isFinale: boolean;
}): string {
  if (input.isOpening) {
    return `Texture-first hook ${input.position}: macro sensory detail from ${input.recipeTitle}, then Licorn reacts in the kitchen.`;
  }

  if (input.isFinale) {
    return `Hero payoff ${input.position}: finished ${input.recipeTitle} in the Licorn kitchen, mascot visible and satisfied.`;
  }

  return `Recipe beat ${input.position}: ${input.step}, staged for a clear food transformation and ASMR material contrast.`;
}

function buildSegmentTitle(position: number, firstScene?: LogicalScene, lastScene?: LogicalScene): string {
  if (!firstScene || !lastScene) {
    return `Seedance segment ${position}`;
  }

  return `${firstScene.arc} to ${lastScene.arc}`;
}
