import { z } from "zod";

import {
  MAX_LOGICAL_SCENES,
  MAX_SEEDANCE_REFERENCES,
  MIN_LOGICAL_SCENES,
} from "@/modules/storyboard/storyboard.constants";

/**
 * Strict Zod schemas for every OpenAI planning output. Each schema enforces
 * the contracts written in `docs/technical-contracts.md` and the creative
 * rules from `.cursor/rules/recipe2video-*`. We never silently repair a bad
 * LLM output: invalid responses throw with an explicit error so the user can
 * retry instead of paying for a corrupt downstream generation.
 */

const RecipeStepSchema = z.object({
  position: z.number().int().min(1),
  text: z.string().min(1),
  timing: z.string().nullable().optional(),
  visualCue: z.string().nullable().optional(),
  block: z.string().nullable().optional(),
  textureCue: z.string().nullable().optional(),
  runwayRisk: z.string().nullable().optional(),
});

const RecipeIngredientSchema = z.object({
  name: z.string().min(1),
  quantity: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

const RecipeDataSchema = z
  .object({
    title: z.string().min(1),
    sourceType: z.enum(["url", "photos", "text", "demo_fixture"]),
    sourceUrl: z.string().nullable().optional(),
    ingredients: z.array(RecipeIngredientSchema),
    steps: z.array(RecipeStepSchema),
    subRecipes: z.array(z.string()),
    assumptions: z.array(z.string()),
    timing: z
      .object({
        prep: z.string().nullable().optional(),
        cook: z.string().nullable().optional(),
        total: z.string().nullable().optional(),
      })
      .nullable()
      .optional(),
    criticalTransformations: z.array(z.string()),
    visualTextureOpportunities: z.array(z.string()),
    possibleHooks: z.array(z.string()),
    promptPolicySources: z.array(z.string()),
  })
  .strict();

const ClarifyingQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  reason: z.string().min(1),
});

export const RecipeAnalysisResultSchema = z
  .object({
    recipe: RecipeDataSchema,
    clarifyingQuestions: z.array(ClarifyingQuestionSchema),
  })
  .strict();

const RunwaySafeScoreSchema = z.object({
  stillImageReadable: z.boolean(),
  singleMainMotion: z.boolean(),
  dominantSound: z.boolean(),
  visuallyDesirable: z.boolean(),
  textureContrast: z.boolean(),
  notes: z.array(z.string()),
});

const LogicalSceneSchema = z.object({
  id: z.string().min(1),
  videoId: z.string().min(1),
  segmentId: z.string().nullable().optional(),
  position: z.number().int().min(1),
  sceneType: z.enum(["detail", "context"]),
  arc: z.string().min(1),
  description: z.string().min(1),
  bg: z.string().nullable().optional(),
  zoom: z.string().nullable().optional(),
  durationTarget: z.number().nullable().optional(),
  note: z.string().nullable().optional(),
  textureCue: z.string().nullable().optional(),
  sfxCue: z.string().nullable().optional(),
  satisfactionBeat: z.boolean().optional(),
  runwaySafeScore: RunwaySafeScoreSchema.optional(),
});

export const LogicalScenesEnvelopeSchema = z
  .object({
    logicalScenes: z
      .array(LogicalSceneSchema)
      .min(
        MIN_LOGICAL_SCENES,
        `Logical storyboard must have at least ${MIN_LOGICAL_SCENES} scenes per the editorial rules.`,
      )
      .max(
        MAX_LOGICAL_SCENES,
        `Logical storyboard cannot exceed ${MAX_LOGICAL_SCENES} scenes; compress further before generation.`,
      ),
  })
  .strict();

const SegmentReferenceSchema = z.object({
  id: z.string().optional(),
  role: z.string().min(1),
  name: z.string().min(1),
  label: z.string().min(1),
  runwayUri: z.string().nullable().optional(),
  mediaAssetId: z.string().nullable().optional(),
  required: z.boolean().optional(),
});

const SeedancePromptQaSchema = z.object({
  referencesWithinLimit: z.boolean(),
  globalKitchenReferencePresent: z.boolean(),
  referenceRolesExplicit: z.boolean(),
  promptWithinPracticalLimit: z.boolean(),
  hardCutsSpecified: z.boolean(),
  mandatoryTimingSpecified: z.boolean(),
  noSpeechVoiceoverOrMusic: z.boolean(),
  fragileFoodPhysicsHandled: z.boolean(),
  nonStandardGeometryHandled: z.boolean(),
  sourcePoliciesApplied: z.array(z.string()),
});

const SeedanceSegmentSchema = z.object({
  id: z.string().min(1),
  videoId: z.string().min(1),
  position: z.number().int().min(1),
  title: z.string().min(1),
  arc: z.string().min(1),
  mode: z.literal("References"),
  logicalSceneIds: z.array(z.string().min(1)).min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  promptInitial: z.string().min(1),
  references: z
    .array(SegmentReferenceSchema)
    .max(
      MAX_SEEDANCE_REFERENCES,
      `Seedance segments accept at most ${MAX_SEEDANCE_REFERENCES} references.`,
    ),
  beats: z.array(z.string()),
  timing: z.array(z.string()),
  continuity: z.string(),
  risk: z.string(),
  audioPrompt: z.string(),
  negatives: z.array(z.string()),
  qaChecklist: SeedancePromptQaSchema,
  durationTarget: z.number().positive(),
  status: z
    .enum([
      "pending",
      "ready",
      "queued",
      "generating",
      "review",
      "accepted",
      "rejected",
      "failed",
      "blocked",
    ])
    .optional(),
  selectedGenerationId: z.string().nullable().optional(),
});

export const SeedanceSegmentsEnvelopeSchema = z
  .object({
    seedanceSegments: z
      .array(SeedanceSegmentSchema)
      .min(5, "Seedance segmentation must produce at least 5 segments.")
      .max(
        10,
        "Seedance segmentation must compress logical scenes into 5-10 segments.",
      ),
  })
  .strict();

const PromptDiffLineSchema = z.object({
  type: z.enum(["unchanged", "added", "removed"]),
  text: z.string(),
});

const PromptDiffSchema = z.object({
  lines: z.array(PromptDiffLineSchema),
});

export const PromptEditResultSchema = z
  .object({
    promptBefore: z.string().min(1),
    promptAfter: z.string().min(1),
    diff: PromptDiffSchema,
  })
  .strict();

/**
 * Apply a Zod schema and rethrow as an explicit Error so the failure surfaces
 * to the user. Never returns a partial result.
 */
export function validatePlanningOutput<T>(
  schema: z.ZodType<T>,
  payload: unknown,
  operation: string,
): T {
  const result = schema.safeParse(payload);
  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
      .join("; ");
    throw new Error(
      `OpenAI ${operation} returned a payload that does not match the contract: ${formatted}`,
    );
  }
  return result.data;
}
