import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { createSupabaseOpenAiCostLogWriter } from "@/modules/costs/log-openai-usage";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import { ingestRecipe } from "@/modules/recipe-ingest/ingest-recipe";
import {
  replaceLogicalScenesForVideo,
  type CreateLogicalSceneInput,
} from "@/modules/storyboard/repositories/logical-scene.repository";
import { replaceSegmentsForVideo } from "@/modules/storyboard/repositories/segment.repository";
import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import { resolveSegmentLogicalSceneIdsForPersistence } from "@/modules/storyboard/services/resolve-logical-scene-ids";
import type {
  CreateSeedanceSegmentInput,
  LogicalScene,
  SeedanceSegment,
} from "@/modules/storyboard/storyboard.types";
import {
  getVideoProjectById,
  mergeVideoProjectRecipeData,
  updateVideoProjectStatus,
  updateVideoProjectStoryboardSummary,
} from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type CostLogRequestedData,
  type RecipeIngestRequestedData,
  type StoryboardGenerateRequestedData,
} from "../events";
import { workflowStatusForRecipeResult } from "@/modules/generation/use-cases/orchestrate-segment-generation";

export const ingestRecipeWorkflow = inngest.createFunction(
  {
    id: "ingest-recipe-workflow",
    // No retry: the workflow calls OpenAI which is paid, and the persistence
    // step is not idempotent across reruns. The user retries explicitly via
    // the project overview if anything fails.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoRecipeIngestRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeIngestRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    try {
      const result = await ingestRecipe(
        {
          videoId: data.videoId,
          sourceType: data.sourceType,
          recipeUrl: data.recipeUrl ?? undefined,
          recipeText: data.recipeText ?? undefined,
          photoDescriptions: data.photoDescriptions ?? undefined,
          requestedByUserId: data.requestedByUserId,
          isAllowlisted: true,
        },
        {
          costLogWriter: createSupabaseOpenAiCostLogWriter(supabase),
        },
      );

      // Persist the structured recipe alongside the original wizard metadata.
      await mergeVideoProjectRecipeData(supabase, data.videoId, {
        normalized: result.recipe,
        clarifyingQuestions: result.clarifyingQuestions,
        recipeExtractionRequested: true,
        ingestedAt: new Date().toISOString(),
      });

      const status = workflowStatusForRecipeResult({
        clarifyingQuestionCount: result.clarifyingQuestions.length,
      });

      await updateVideoProjectStatus(supabase, data.videoId, status);

      // If the agent does not need any clarification, chain into storyboard
      // generation so the pipeline progresses without manual intervention.
      if (result.clarifyingQuestions.length === 0) {
        await inngest.send({
          name: INNGEST_EVENTS.videoStoryboardGenerateRequested,
          data: {
            videoId: data.videoId,
            recipeTitle: result.recipe.title,
            recipeSteps: result.recipe.steps.map((step) => step.text),
            targetDurationSeconds: extractTargetDurationSeconds(
              await getVideoProjectById(supabase, data.videoId),
            ),
            requestedByUserId: data.requestedByUserId,
            isAllowlisted: true,
          },
        });
      }

      return {
        status,
        clarifyingQuestionCount: result.clarifyingQuestions.length,
      };
    } catch (error) {
      await updateVideoProjectStatus(supabase, data.videoId, "failed");
      throw error;
    }
  },
);

export const generateStoryboardWorkflow = inngest.createFunction(
  {
    id: "generate-storyboard-workflow",
    // Same rationale as ingestRecipeWorkflow: paid OpenAI calls, non-idempotent
    // persistence (logical_scenes and segments are wiped before reinserting).
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoStoryboardGenerateRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as StoryboardGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    try {
      const engine = createGpt55PlanningPromptEngine({
        costLogWriter: createSupabaseOpenAiCostLogWriter(supabase),
      });

      const logicalScenes = await engine.generateLogicalScenes({
        videoId: data.videoId,
        recipeTitle: data.recipeTitle,
        recipeSteps: data.recipeSteps,
        targetDurationSeconds: data.targetDurationSeconds ?? undefined,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      });

      const persistedScenes = await replaceLogicalScenesForVideo(
        supabase,
        data.videoId,
        logicalScenes.map(toCreateLogicalSceneInput),
      );

      const seedanceSegments = await engine.compressToSeedanceSegments({
        videoId: data.videoId,
        logicalScenes: persistedScenes,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      });

      const segmentInputs = mapSegmentsForPersistence(
        data.videoId,
        seedanceSegments,
        persistedScenes,
        data.requestedByUserId,
      );
      const persistedSegments = await replaceSegmentsForVideo(
        supabase,
        data.videoId,
        segmentInputs,
      );

      await updateVideoProjectStoryboardSummary(supabase, data.videoId, {
        source: "openai_planning_engine",
        logicalSceneCount: persistedScenes.length,
        segmentCount: persistedSegments.length,
        generatedAt: new Date().toISOString(),
      });
      await updateVideoProjectStatus(supabase, data.videoId, "storyboard_ready");

      return {
        status: "storyboard_ready",
        logicalSceneCount: persistedScenes.length,
        segmentCount: persistedSegments.length,
      };
    } catch (error) {
      await updateVideoProjectStatus(supabase, data.videoId, "failed");
      throw error;
    }
  },
);

export const logCostWorkflow = inngest.createFunction(
  {
    id: "log-cost-workflow",
    triggers: [{ event: INNGEST_EVENTS.costLogRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as CostLogRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    return logCost(supabase, {
      videoId: data.videoId,
      segmentId: data.segmentId,
      provider: data.provider,
      model: data.model,
      operation: data.operation,
      creditsUsed: data.creditsUsed,
      costDollars: data.costDollars,
      tokensInput: data.tokensInput,
      tokensOutput: data.tokensOutput,
      metadata: data.metadata,
      createdBy: data.createdBy ?? data.requestedByUserId,
    });
  },
);

function toCreateLogicalSceneInput(
  scene: LogicalScene,
): CreateLogicalSceneInput {
  return {
    position: scene.position,
    sceneType: scene.sceneType,
    arc: scene.arc,
    description: scene.description,
    bg: scene.bg ?? null,
    zoom: scene.zoom ?? null,
    durationTarget: scene.durationTarget ?? null,
    note: scene.note ?? null,
    segmentId: null,
  };
}

function mapSegmentsForPersistence(
  videoId: string,
  segments: SeedanceSegment[],
  persistedScenes: LogicalScene[],
  createdBy: string,
): CreateSeedanceSegmentInput[] {
  return segments.map((segment, index) => {
    const logicalSceneIds = resolveSegmentLogicalSceneIdsForPersistence({
      segment,
      persistedScenes,
    });

    return {
      videoId,
      position: segment.position ?? index + 1,
      title: segment.title,
      arc: segment.arc,
      logicalSceneIds,
      description: segment.description,
      prompt: segment.prompt,
      promptInitial: segment.promptInitial ?? segment.prompt,
      references: segment.references,
      durationTarget: segment.durationTarget,
      status: "ready",
      createdBy,
    };
  });
}

function extractTargetDurationSeconds(
  project: { recipeData?: Record<string, unknown> | null } | null,
): number | undefined {
  const recipeData = project?.recipeData as
    | { productionDefaults?: { targetDurationSeconds?: number } }
    | undefined;
  return recipeData?.productionDefaults?.targetDurationSeconds;
}

