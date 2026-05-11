import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  updateVideoAgentSession,
} from "@/modules/recipe-agent/repositories/recipe-agent.repository";
import {
  syncRecipeAgentArtifacts,
} from "@/modules/recipe-agent/use-cases/sync-recipe-agent-artifacts";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type RecipeAgentCreateRequestedData,
  type RecipeAgentMessageRequestedData,
  type RecipeAgentSyncRequestedData,
} from "../events";

export const createRecipeAgentWorkflow = inngest.createFunction(
  {
    id: "create-recipe-agent-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentCreateRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentCreateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const { sendRecipeAgentMessage } = await import(
      "@/modules/recipe-agent/use-cases/orchestrate-recipe-agent"
    );

    return sendRecipeAgentMessage({
      supabase,
      videoId: data.videoId,
      requestedByUserId: data.requestedByUserId,
      stage: "general",
      message:
        "Initialize the persistent Recipe2Video recipe agent workspace for this project. Create or update decisions.md and changelog.md only if useful. Do not launch generation services.",
    });
  },
);

export const sendRecipeAgentMessageWorkflow = inngest.createFunction(
  {
    id: "send-recipe-agent-message-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentMessageRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentMessageRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const { sendRecipeAgentMessage } = await import(
      "@/modules/recipe-agent/use-cases/orchestrate-recipe-agent"
    );

    return sendRecipeAgentMessage({
      supabase,
      videoId: data.videoId,
      requestedByUserId: data.requestedByUserId,
      stage: data.stage,
      message: data.message,
    });
  },
);

export const syncRecipeAgentArtifactsWorkflow = inngest.createFunction(
  {
    id: "sync-recipe-agent-artifacts-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentSyncRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentSyncRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const plan = await syncRecipeAgentArtifacts(supabase, {
      videoId: data.videoId,
      artifacts: data.artifacts,
    });

    await updateVideoAgentSession(supabase, data.videoId, {
      lastAgentSyncAt: new Date().toISOString(),
      agentStatus: plan.valid ? "idle" : "validation_failed",
    });

    return {
      valid: plan.valid,
      artifactCount: plan.artifactRecords.length,
      errors: plan.errors,
    };
  },
);
