import { Agent } from "@cursor/sdk";

import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getAgentConversationById,
  mirrorActiveConversationToVideo,
  updateAgentConversation,
} from "@/modules/recipe-agent/repositories/agent-conversations.repository";
import { getAgentRunById } from "@/modules/recipe-agent/repositories/recipe-agent.repository";
import { resolveRecipeAgentConfig } from "@/modules/recipe-agent/recipe-agent.config";
import { createCursorRecipeAgentService } from "@/modules/recipe-agent/services/cursor-agent.service";
import { ensureActiveAgentConversation } from "@/modules/recipe-agent/use-cases/ensure-agent-conversation";
import { sendRecipeAgentMessage } from "@/modules/recipe-agent/use-cases/orchestrate-recipe-agent";
import {
  cancelRecipeAgentRunWorkflow,
  createRecipeAgentPollingDeps,
  finalizeRecipeAgentRunWorkflow,
  pollRecipeAgentRunWorkflow,
  reconcileStaleRecipeAgentRunsWorkflow,
  shouldUsePollingOrchestration,
  startRecipeAgentRunWorkflow,
} from "@/modules/recipe-agent/use-cases/orchestrate-recipe-agent-polling";
import {
  syncRecipeAgentArtifacts,
} from "@/modules/recipe-agent/use-cases/sync-recipe-agent-artifacts";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type RecipeAgentCreateRequestedData,
  type RecipeAgentMessageRequestedData,
  type RecipeAgentRunCancelRequestedData,
  type RecipeAgentRunFinalizeRequestedData,
  type RecipeAgentRunPollRequestedData,
  type RecipeAgentSyncRequestedData,
} from "../events";

const DEFAULT_POLL_DELAY_SECONDS = 6;

async function assertRecipeAgentWorkflowAuth(requestedByUserId: string) {
  if (requestedByUserId === "system") {
    return;
  }

  await assertAllowlistedUser(requestedByUserId);
}

async function recipeAgentWorkflowSendEvent(workflowEvent: {
  name: string;
  data: Record<string, unknown>;
}): Promise<void> {
  await inngest.send({
    name: workflowEvent.name,
    data: workflowEvent.data,
  });
}

function createRecipeAgentServiceForConversation(conversation: {
  cursorAgentModel: string | null;
  cursorAgentReasoning: string | null;
  cursorAgentFast: boolean | null;
}) {
  const baseConfig = resolveRecipeAgentConfig();
  const sdkAdapter = {
    create: (options: Parameters<typeof Agent.create>[0]) => Agent.create(options),
    resume: (agentId: string, options?: Parameters<typeof Agent.resume>[1]) =>
      Agent.resume(agentId, options),
    getRun: (runId: string, options?: Parameters<typeof Agent.getRun>[1]) =>
      Agent.getRun(runId, options),
  };

  const model = conversation.cursorAgentModel?.trim();
  const config =
    model && model.length > 0
      ? {
          ...baseConfig,
          model,
          ...(conversation.cursorAgentReasoning
            ? { modelReasoning: conversation.cursorAgentReasoning }
            : {}),
          ...(conversation.cursorAgentFast !== null
            ? { modelFast: conversation.cursorAgentFast ? "true" : "false" }
            : {}),
        }
      : baseConfig;

  return createCursorRecipeAgentService({
    sdk: sdkAdapter,
    config,
  });
}

export const createRecipeAgentWorkflow = inngest.createFunction(
  {
    id: "create-recipe-agent-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentCreateRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentCreateRequestedData;

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const config = resolveRecipeAgentConfig();
    const message =
      "Initialize the persistent Recipe2Video recipe agent workspace for this project. Create or update decisions.md and changelog.md only if useful. Do not launch generation services.";

    if (shouldUsePollingOrchestration(config)) {
      const deps = createRecipeAgentPollingDeps(
        supabase,
        recipeAgentWorkflowSendEvent,
      );

      return startRecipeAgentRunWorkflow(
        {
          supabase,
          videoId: data.videoId,
          conversationId: data.conversationId,
          requestedByUserId: data.requestedByUserId,
          stage: "general",
          message,
        },
        deps,
      );
    }

    return sendRecipeAgentMessage({
      supabase,
      videoId: data.videoId,
      conversationId: data.conversationId,
      requestedByUserId: data.requestedByUserId,
      stage: "general",
      message,
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

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const config = resolveRecipeAgentConfig();

    if (shouldUsePollingOrchestration(config)) {
      const deps = createRecipeAgentPollingDeps(
        supabase,
        recipeAgentWorkflowSendEvent,
      );

      return startRecipeAgentRunWorkflow(
        {
          supabase,
          videoId: data.videoId,
          conversationId: data.conversationId,
          requestedByUserId: data.requestedByUserId,
          stage: data.stage,
          message: data.message,
          attachmentMediaAssetIds: data.attachmentMediaAssetIds,
          includeAssetsManifestBriefing: data.includeAssetsManifestBriefing,
        },
        deps,
      );
    }

    return sendRecipeAgentMessage({
      supabase,
      videoId: data.videoId,
      conversationId: data.conversationId,
      requestedByUserId: data.requestedByUserId,
      stage: data.stage,
      message: data.message,
      attachmentMediaAssetIds: data.attachmentMediaAssetIds,
      includeAssetsManifestBriefing: data.includeAssetsManifestBriefing,
    });
  },
);

export const pollRecipeAgentRunWorkflowFn = inngest.createFunction(
  {
    id: "poll-recipe-agent-run",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentRunPollRequested }],
  },
  async ({ event, step }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentRunPollRequestedData;

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const requestedDelaySeconds = Number(data.nextPollDelaySeconds);
    const delaySeconds =
      Number.isFinite(requestedDelaySeconds) && requestedDelaySeconds > 0
        ? Math.max(5, Math.min(30, Math.round(requestedDelaySeconds)))
        : DEFAULT_POLL_DELAY_SECONDS;
    await step.sleep("wait before polling Cursor", `${delaySeconds}s`);

    const conversation = await getAgentConversationById(
      supabase,
      data.conversationId,
    );
    if (!conversation) {
      throw new Error(`Agent conversation ${data.conversationId} not found.`);
    }

    const config = resolveRecipeAgentConfig();
    const deps = createRecipeAgentPollingDeps(
      supabase,
      recipeAgentWorkflowSendEvent,
    );

    return pollRecipeAgentRunWorkflow(data, {
      ...deps,
      config,
      recipeAgentService: createRecipeAgentServiceForConversation(conversation),
    });
  },
);

export const finalizeRecipeAgentRunWorkflowFn = inngest.createFunction(
  {
    id: "finalize-recipe-agent-run",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentRunFinalizeRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentRunFinalizeRequestedData;

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const conversation = await getAgentConversationById(
      supabase,
      data.conversationId,
    );
    if (!conversation) {
      throw new Error(`Agent conversation ${data.conversationId} not found.`);
    }

    const deps = createRecipeAgentPollingDeps(
      supabase,
      recipeAgentWorkflowSendEvent,
    );

    return finalizeRecipeAgentRunWorkflow(data, {
      ...deps,
      supabase,
      recipeAgentService: createRecipeAgentServiceForConversation(conversation),
    });
  },
);

export const cancelRecipeAgentRunWorkflowFn = inngest.createFunction(
  {
    id: "cancel-recipe-agent-run",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.recipeAgentRunCancelRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as RecipeAgentRunCancelRequestedData;

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const agentRun = await getAgentRunById(supabase, data.agentRunId);
    if (!agentRun || agentRun.videoId !== data.videoId) {
      throw new Error(`Agent run ${data.agentRunId} not found.`);
    }

    const conversation = agentRun.agentConversationId
      ? await getAgentConversationById(supabase, agentRun.agentConversationId)
      : null;

    const deps = createRecipeAgentPollingDeps(
      supabase,
      recipeAgentWorkflowSendEvent,
    );

    return cancelRecipeAgentRunWorkflow(data, {
      ...deps,
      recipeAgentService: createRecipeAgentServiceForConversation(
        conversation ?? {
          cursorAgentModel: null,
          cursorAgentReasoning: null,
          cursorAgentFast: null,
        },
      ),
    });
  },
);

export const reconcileRecipeAgentRunsWorkflowFn = inngest.createFunction(
  {
    id: "reconcile-recipe-agent-runs",
    retries: 0,
    triggers: [{ cron: "*/5 * * * *" }],
  },
  async () => {
    const supabase = createSupabaseAdminClient();
    const deps = createRecipeAgentPollingDeps(
      supabase,
      recipeAgentWorkflowSendEvent,
    );

    return reconcileStaleRecipeAgentRunsWorkflow({
      ...deps,
      supabase,
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

    await assertRecipeAgentWorkflowAuth(data.requestedByUserId);

    const conversation = data.conversationId
      ? await getAgentConversationById(supabase, data.conversationId)
      : await ensureActiveAgentConversation(supabase, data.videoId);

    if (!conversation) {
      throw new Error(`No agent conversation found for video ${data.videoId}.`);
    }

    const plan = await syncRecipeAgentArtifacts(supabase, {
      videoId: data.videoId,
      agentConversationId: conversation.id,
      syncStoryboardTables: conversation.isActive,
      artifacts: data.artifacts,
    });

    const updated = await updateAgentConversation(supabase, conversation.id, {
      lastAgentSyncAt: new Date().toISOString(),
      agentStatus: plan.valid ? "idle" : "validation_failed",
    });
    await mirrorActiveConversationToVideo(supabase, data.videoId, updated);

    return {
      valid: plan.valid,
      artifactCount: plan.artifactRecords.length,
      errors: plan.errors,
    };
  },
);
