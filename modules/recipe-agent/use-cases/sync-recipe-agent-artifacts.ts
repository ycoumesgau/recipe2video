import { createHash } from "node:crypto";

import { z } from "zod";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  mergeVideoProjectRecipeData,
  updateVideoProjectStoryboardSummary,
} from "@/modules/videos/repositories/video.repository";
import {
  replaceLogicalScenesForVideo,
  type CreateLogicalSceneInput,
} from "@/modules/storyboard/repositories/logical-scene.repository";
import {
  replaceSegmentsForVideo,
} from "@/modules/storyboard/repositories/segment.repository";
import {
  replaceAgentReferenceAssetsForVideo,
  type CreateReferenceAssetInput,
} from "@/modules/references/repositories/reference.repository";
import {
  LogicalScenesEnvelopeSchema,
  RecipeAnalysisResultSchema,
  SeedanceSegmentsEnvelopeSchema,
} from "@/modules/storyboard/services/planning-output-schemas";
import type { RecipeAnalysisResult } from "@/modules/recipe-ingest/recipe.types";
import type {
  LogicalScene,
  SeedanceSegment,
} from "@/modules/storyboard/storyboard.types";

import type {
  RecipeAgentArtifact,
  UpsertAgentArtifactInput,
} from "../recipe-agent.types";
import {
  upsertAgentArtifact,
} from "../repositories/recipe-agent.repository";

const ReferencePlanSchema = z
  .object({
    references: z.array(
      z
        .object({
          id: z.string().optional(),
          type: z.string().min(1),
          canonicalName: z.string().min(1),
          role: z.string().min(1),
          priority: z.number().optional(),
          source: z.string().optional(),
          prompt: z.string().nullable().optional(),
          runwayUri: z.string().nullable().optional(),
          mediaAssetId: z.string().nullable().optional(),
          usedInSegmentIds: z.array(z.string()).optional(),
          status: z
            .enum([
              "planned",
              "generating",
              "generated",
              "approved",
              "rejected",
              "uploaded_to_runway",
              "failed",
            ])
            .optional(),
        })
        .strict(),
    ),
  })
  .strict();

interface BuildRecipeAgentArtifactSyncPlanInput {
  videoId: string;
  artifacts: RecipeAgentArtifact[];
}

export interface RecipeAgentArtifactSyncPlan {
  valid: boolean;
  artifactRecords: UpsertAgentArtifactInput[];
  recipePatch: {
    normalized: RecipeAnalysisResult["recipe"];
    clarifyingQuestions: RecipeAnalysisResult["clarifyingQuestions"];
    agentSyncedAt: string;
  } | null;
  logicalScenes: CreateLogicalSceneInput[];
  segments: ReturnType<typeof toCreateSegmentInput>[];
  references: CreateReferenceAssetInput[];
  sunoPrompt: string | null;
  errors: string[];
}

export function buildRecipeAgentArtifactSyncPlan(
  input: BuildRecipeAgentArtifactSyncPlanInput,
): RecipeAgentArtifactSyncPlan {
  const artifactRecords: UpsertAgentArtifactInput[] = [];
  const errors: string[] = [];
  let recipePatch: RecipeAgentArtifactSyncPlan["recipePatch"] = null;
  let logicalScenes: CreateLogicalSceneInput[] = [];
  let segments: RecipeAgentArtifactSyncPlan["segments"] = [];
  let references: CreateReferenceAssetInput[] = [];
  let sunoPrompt: string | null = null;

  for (const artifact of input.artifacts) {
    const content = artifact.content ?? "";
    const validation = validateArtifact({
      name: artifact.name,
      content,
      videoId: input.videoId,
    });

    artifactRecords.push({
      videoId: input.videoId,
      artifactName: artifact.name,
      artifactPath: artifact.path,
      content,
      contentHash: createArtifactContentHash(content),
      validationStatus: validation.errors.length > 0 ? "invalid" : "valid",
      validationErrors: validation.errors,
    });

    errors.push(...validation.errors.map((error) => `${artifact.name}: ${error}`));

    if (!validation.value) {
      continue;
    }

    if (artifact.name === "recipe-analysis.json") {
      const recipeAnalysis = validation.value as RecipeAnalysisResult;
      recipePatch = {
        normalized: recipeAnalysis.recipe,
        clarifyingQuestions: recipeAnalysis.clarifyingQuestions,
        agentSyncedAt: new Date().toISOString(),
      };
    }

    if (artifact.name === "logical-scenes.json") {
      logicalScenes = (validation.value as { logicalScenes: LogicalScene[] })
        .logicalScenes.map(toCreateLogicalSceneInput);
    }

    if (artifact.name === "seedance-segments.json") {
      segments = (validation.value as { seedanceSegments: SeedanceSegment[] })
        .seedanceSegments.map((segment) => toCreateSegmentInput(input.videoId, segment));
    }

    if (artifact.name === "reference-plan.json") {
      references = (validation.value as z.infer<typeof ReferencePlanSchema>)
        .references.map((reference) => ({
          id: reference.id,
          videoId: input.videoId,
          mediaAssetId: reference.mediaAssetId ?? null,
          type: reference.type,
          canonicalName: reference.canonicalName,
          source: reference.source ?? "agent_reference_plan",
          runwayUri: reference.runwayUri ?? null,
          prompt: buildReferencePrompt(reference),
          status: reference.status ?? "planned",
        }));
    }

    if (artifact.name === "suno-prompt.md") {
      sunoPrompt = content;
    }
  }

  return {
    valid: errors.length === 0,
    artifactRecords,
    recipePatch,
    logicalScenes,
    segments,
    references,
    sunoPrompt,
    errors,
  };
}

export async function syncRecipeAgentArtifacts(
  supabase: SupabaseDataClient,
  input: BuildRecipeAgentArtifactSyncPlanInput,
) {
  const plan = buildRecipeAgentArtifactSyncPlan(input);

  for (const artifactRecord of plan.artifactRecords) {
    await upsertAgentArtifact(supabase, artifactRecord);
  }

  if (!plan.valid) {
    return plan;
  }

  if (plan.recipePatch) {
    await mergeVideoProjectRecipeData(supabase, input.videoId, plan.recipePatch);
  }

  if (plan.logicalScenes.length > 0) {
    await replaceLogicalScenesForVideo(supabase, input.videoId, plan.logicalScenes);
  }

  if (plan.segments.length > 0) {
    const persistedSegments = await replaceSegmentsForVideo(
      supabase,
      input.videoId,
      plan.segments,
    );

    await updateVideoProjectStoryboardSummary(supabase, input.videoId, {
      source: "cursor_recipe_agent",
      logicalSceneCount: plan.logicalScenes.length,
      segmentCount: persistedSegments.length,
      generatedAt: new Date().toISOString(),
    });
  }

  if (plan.references.length > 0) {
    await replaceAgentReferenceAssetsForVideo(
      supabase,
      input.videoId,
      plan.references,
    );
  }

  if (plan.sunoPrompt) {
    await mergeVideoProjectRecipeData(supabase, input.videoId, {
      sunoPrompt: plan.sunoPrompt,
      sunoPromptSyncedAt: new Date().toISOString(),
    });
  }

  return plan;
}

export function createArtifactContentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function validateArtifact(input: {
  name: string;
  content: string;
  videoId: string;
}): { value: unknown | null; errors: string[] } {
  if (input.name === "suno-prompt.md" || input.name === "decisions.md" || input.name === "changelog.md") {
    return { value: input.content, errors: [] };
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(input.content);
  } catch (error) {
    return {
      value: null,
      errors: [
        `Invalid JSON: ${error instanceof Error ? error.message : "unknown parse error"}`,
      ],
    };
  }

  const schema =
    input.name === "recipe-analysis.json"
      ? RecipeAnalysisResultSchema
      : input.name === "logical-scenes.json"
        ? LogicalScenesEnvelopeSchema
        : input.name === "seedance-segments.json"
          ? SeedanceSegmentsEnvelopeSchema
          : input.name === "reference-plan.json"
            ? ReferencePlanSchema
            : null;

  if (!schema) {
    return { value: parsed, errors: [] };
  }

  const result = schema.safeParse(parsed);

  if (!result.success) {
    return {
      value: null,
      errors: result.error.issues.map(
        (issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`,
      ),
    };
  }

  return { value: result.data, errors: [] };
}

function toCreateLogicalSceneInput(scene: LogicalScene): CreateLogicalSceneInput {
  return {
    position: scene.position,
    sceneType: scene.sceneType,
    arc: scene.arc,
    description: scene.description,
    bg: scene.bg ?? null,
    zoom: scene.zoom ?? null,
    durationTarget: scene.durationTarget ?? null,
    note: scene.note ?? null,
    textureCue: scene.textureCue ?? null,
    sfxCue: scene.sfxCue ?? null,
    satisfactionBeat: scene.satisfactionBeat,
    runwaySafeScore: scene.runwaySafeScore,
    segmentId: null,
  };
}

function toCreateSegmentInput(videoId: string, segment: SeedanceSegment) {
  return {
    videoId,
    position: segment.position,
    title: segment.title,
    arc: segment.arc,
    logicalSceneIds: segment.logicalSceneIds,
    description: segment.description,
    prompt: segment.prompt,
    promptInitial: segment.promptInitial,
    references: segment.references,
    durationTarget: segment.durationTarget,
    status: segment.status,
    createdBy: segment.createdBy ?? null,
  };
}

function buildReferencePrompt(reference: {
  role: string;
  priority?: number;
  usedInSegmentIds?: string[];
  prompt?: string | null;
}) {
  const details = [
    reference.prompt,
    `Role: ${reference.role}`,
    reference.priority == null ? null : `Priority: ${reference.priority}`,
    reference.usedInSegmentIds?.length
      ? `Used in segments: ${reference.usedInSegmentIds.join(", ")}`
      : null,
  ].filter(Boolean);

  return details.join("\n");
}
