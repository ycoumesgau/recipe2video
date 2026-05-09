import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import { ingestRecipe } from "@/modules/recipe-ingest/ingest-recipe";
import { createGpt55PlanningPromptEngine } from "@/modules/storyboard/services/gpt55-planning-prompt-engine";
import {
  updateVideoProjectStatus,
} from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import { INNGEST_EVENTS, type CostLogRequestedData, type RecipeIngestRequestedData, type StoryboardGenerateRequestedData } from "../events";
import { workflowStatusForRecipeResult } from "@/modules/generation/use-cases/orchestrate-segment-generation";

export const ingestRecipeWorkflow = inngest.createFunction(
  {
    id: "ingest-recipe-workflow",
    triggers: [{ event: INNGEST_EVENTS.videoRecipeIngestRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeIngestRequestedData;

    assertWorkflowAllowed(data);

    try {
      const result = await ingestRecipe({
        videoId: data.videoId,
        sourceType: data.sourceType,
        recipeUrl: data.recipeUrl ?? undefined,
        recipeText: data.recipeText ?? undefined,
        photoDescriptions: data.photoDescriptions ?? undefined,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      });
      const status = workflowStatusForRecipeResult({
        clarifyingQuestionCount: result.clarifyingQuestions.length,
      });

      await updateVideoProjectStatus(supabase, data.videoId, status);

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
    triggers: [{ event: INNGEST_EVENTS.videoStoryboardGenerateRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as StoryboardGenerateRequestedData;

    assertWorkflowAllowed(data);

    try {
      const engine = createGpt55PlanningPromptEngine();
      await engine.generateLogicalScenes({
        videoId: data.videoId,
        recipeTitle: data.recipeTitle,
        recipeSteps: data.recipeSteps,
        targetDurationSeconds: data.targetDurationSeconds ?? undefined,
        requestedByUserId: data.requestedByUserId,
        isAllowlisted: true,
      });

      await updateVideoProjectStatus(supabase, data.videoId, "storyboard_ready");

      return { status: "storyboard_ready" };
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

    assertWorkflowAllowed(data);

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

function assertWorkflowAllowed(data: {
  requestedByUserId?: string | null;
  isAllowlisted?: boolean;
}) {
  if (!data.requestedByUserId || !data.isAllowlisted) {
    throw new Error("Workflow requires an authenticated allowlisted user.");
  }
}
