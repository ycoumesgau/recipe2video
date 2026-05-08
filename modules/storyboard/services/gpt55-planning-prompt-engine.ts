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
  DEFAULT_SEEDANCE_VIDEO_MODEL,
  DEFAULT_VERTICAL_RATIO,
  FOOD_VIDEO_PROMPT_RULES,
  MAX_SEEDANCE_REFERENCES,
  MIN_LOGICAL_SCENES,
  OPENAI_REASONING_MODEL,
  TARGET_SEEDANCE_SEGMENT_COUNT,
} from "@/modules/storyboard/storyboard.constants";
import type {
  LogicalScene,
  SeedanceSegment,
  SeedanceSegmentationInput,
  SegmentReference,
  StoryboardGenerationInput,
} from "@/modules/storyboard/storyboard.types";

type PlanningOperation =
  | "recipe_analysis"
  | "storyboard_generation"
  | "seedance_segmentation"
  | "prompt_edit";

interface PlanningPromptEngineOptions {
  model?: string;
  costLogWriter?: CostLogWriter;
}

export interface PlanningPromptEngine {
  analyzeRecipe(input: RecipeAnalysisInput): Promise<RecipeAnalysisResult>;
  generateLogicalScenes(input: StoryboardGenerationInput): Promise<LogicalScene[]>;
  compressToSeedanceSegments(input: SeedanceSegmentationInput): Promise<SeedanceSegment[]>;
  editPromptFromFeedback(input: PromptEditInput): Promise<PromptEditResult>;
}

export function createGpt55PlanningPromptEngine(
  options: PlanningPromptEngineOptions = {},
): PlanningPromptEngine {
  const model = options.model ?? OPENAI_REASONING_MODEL;
  const costLogWriter = options.costLogWriter ?? noopCostLogWriter;

  assertConfiguredModel(model);

  return {
    async analyzeRecipe(input) {
      assertCostlyActionAllowed(input);

      const prompt = buildRecipeAnalysisPrompt(input);
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
      assertCostlyActionAllowed(input);

      const prompt = buildStoryboardGenerationPrompt(input);
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
      assertCostlyActionAllowed(input);

      const prompt = buildSeedanceSegmentationPrompt(input);
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
      assertCostlyActionAllowed(input);

      const prompt = buildPromptEditPrompt(input);
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
    "Return JSON with title, ingredients, steps, timing, critical transformations, visual texture opportunities, possible hooks, and material clarifying questions only.",
    "Ask clarifying questions only when answers materially change the video plan.",
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
    "Return JSON only. Do not create Runway tasks.",
    `Recipe title: ${input.recipeTitle}`,
    `Target duration seconds: ${input.targetDurationSeconds ?? 60}`,
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
    "Return JSON only. Do not launch Runway generation.",
    "Each segment must include multiple hard-cut shots, mandatory timing, explicit reference roles, kitchen ASMR only, no speech, no voiceover, and no music.",
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
    "Task: revise one Seedance prompt from natural-language feedback and return prompt_before, prompt_after, and a line diff.",
    "Do not trigger regeneration. Do not switch models. Preserve hard cuts, timing, reference roles, and kitchen ASMR policy.",
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
      visualCue: inferVisualCue(step),
    })),
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
    const durationTarget = Math.min(15, Math.max(2, Number((scenes.length * 2).toFixed(0))));
    const prompt = buildSeedancePrompt({
      position,
      title: buildSegmentTitle(position, firstScene, lastScene),
      scenes,
      references,
      durationTarget,
    });

    return {
      id: `${input.videoId}-segment-${String(position).padStart(2, "0")}`,
      videoId: input.videoId,
      position,
      title: buildSegmentTitle(position, firstScene, lastScene),
      arc: firstScene?.arc ?? "recipe progression",
      logicalSceneIds: scenes.map((scene) => scene.id),
      description: scenes.map((scene) => scene.description).join(" "),
      prompt,
      promptInitial: prompt,
      references,
      durationTarget,
      status: "ready",
      selectedGenerationId: null,
    };
  });
}

function stubPromptEdit(input: PromptEditInput): PromptEditResult {
  const correction = input.feedbackMessage.trim().replace(/\s+/g, " ");
  const promptAfter = [
    input.promptBefore.trim(),
    `Correction to apply: ${correction}. Make the corrected visual behavior explicit while preserving all existing timing, hard cuts, reference roles, vertical framing, and kitchen ASMR-only audio.`,
  ].join("\n");

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
  durationTarget: number;
}): string {
  const shotLines = input.scenes.map((scene, index) => {
    const start = index * 2;
    const end = Math.min(input.durationTarget, start + 2);

    return `Shot ${index + 1}, ${start}-${end}s: ${scene.description}`;
  });

  return [
    `Vertical ${DEFAULT_SEEDANCE_VIDEO_MODEL} segment ${input.position}: ${input.title}.`,
    `Total duration ${input.durationTarget}s, ${input.scenes.length} shots, hard cuts between every shot.`,
    `Reference roles: ${input.references.map((reference) => `@${reference.label} as ${reference.role}`).join("; ")}.`,
    ...shotLines,
    "Audio: kitchen ASMR only, no speech, no voiceover, no music.",
    "Negative: no extra limbs, no melted mascot, no incorrect utensil grip, no unstable pastry geometry.",
  ].join("\n");
}

function buildSegmentReferences(position: number): SegmentReference[] {
  return [
    {
      id: `reference-kitchen-${position}`,
      role: "global Licorn kitchen environment",
      label: "KitchenIslandDefault",
      runwayUri: null,
      required: true,
    },
    {
      id: `reference-mascot-${position}`,
      role: "Licorn mascot cook with consistent body and expression",
      label: "LicornMascot",
      runwayUri: null,
      required: true,
    },
    {
      id: `reference-food-state-${position}`,
      role: "current recipe state and fragile food geometry",
      label: "RecipeState",
      runwayUri: null,
      required: true,
    },
  ];
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

function assertCostlyActionAllowed(input: { requestedByUserId?: string | null; isAllowlisted: boolean }) {
  if (!input.requestedByUserId || !input.isAllowlisted) {
    throw new Error("OpenAI planning requires an authenticated allowlisted user.");
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
