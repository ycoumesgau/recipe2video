/**
 * Run a Cursor recipe agent stage with the same polling/finalize flow as Inngest,
 * blocking until the run finishes or times out. Uses local code (including wall-clock
 * budgets from `recipe-agent.constants.ts`).
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/run-recipe-agent-stage.ts \
 *     <videoId> <stage> [--conversation-id=<uuid>] [--message="..."]
 *
 * Example (Cover & Canvas):
 *   npx tsx --env-file=.env.local scripts/run-recipe-agent-stage.ts \
 *     5e846a3d-92ea-4607-8bfc-91f26b88291e publication_planning \
 *     --conversation-id=9273b471-6343-4eb0-a20a-56309227dd9c
 */
import { Agent } from "@cursor/sdk";

import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { resolveRecipeAgentConfig } from "@/modules/recipe-agent/recipe-agent.config";
import { createCursorRecipeAgentService } from "@/modules/recipe-agent/services/cursor-agent.service";
import type { RecipeAgentStage } from "@/modules/recipe-agent/recipe-agent.types";
import {
  createRecipeAgentPollingDeps,
  finalizeRecipeAgentRunWorkflow,
  pollRecipeAgentRunWorkflow,
  startRecipeAgentRunWorkflow,
  type RecipeAgentPollingWorkflowEvent,
} from "@/modules/recipe-agent/use-cases/orchestrate-recipe-agent-polling";

const DEFAULT_PUBLICATION_MESSAGE =
  "Plan the Spotify publication assets for this recipe per contracts/song-cover.md. Produce or update agent-recipes/{videoId}/song-cover-plan.json: full album cover prompt (square, mascot allowed), full Spotify Canvas prompt with explicit first-frame = last-frame loop instruction, image and optional video references (canonical names from asset_library or reference-plan.json), loop anchor reference, duration 5-8s, mascot appearance mode. Follow the spotify-publication-assets skill for direction and the Spotify guardrails.";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  let conversationId: string | undefined;
  let message: string | undefined;
  let requestedByUserId = "system";

  for (const arg of argv) {
    if (arg.startsWith("--conversation-id=")) {
      conversationId = arg.slice("--conversation-id=".length);
    } else if (arg.startsWith("--message=")) {
      message = arg.slice("--message=".length);
    } else if (arg.startsWith("--requested-by=")) {
      requestedByUserId = arg.slice("--requested-by=".length);
    } else if (!arg.startsWith("--")) {
      positional.push(arg);
    }
  }

  return { positional, conversationId, message, requestedByUserId };
}

async function main() {
  const { positional, conversationId, message, requestedByUserId } = parseArgs(
    process.argv.slice(2),
  );
  const videoId = positional[0];
  const stage = positional[1] as RecipeAgentStage | undefined;

  if (!videoId || !stage) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/run-recipe-agent-stage.ts <videoId> <stage> [--conversation-id=uuid] [--message=...]",
    );
    process.exit(1);
  }

  const resolvedMessage =
    message ??
    (stage === "publication_planning"
      ? DEFAULT_PUBLICATION_MESSAGE.replaceAll("{videoId}", videoId)
      : undefined);

  if (!resolvedMessage) {
    console.error("Provide --message= for stages other than publication_planning.");
    process.exit(1);
  }

  const supabase = createSupabaseAdminClient();
  const config = resolveRecipeAgentConfig();
  const eventQueue: RecipeAgentPollingWorkflowEvent[] = [];

  const deps = createRecipeAgentPollingDeps(supabase, async (event) => {
    eventQueue.push(event);
  });

  const recipeAgentService = createCursorRecipeAgentService({
    sdk: {
      create: (options) => Agent.create(options),
      resume: (agentId, options) => Agent.resume(agentId, options),
      getRun: (runId, options) => Agent.getRun(runId, options),
    },
    config,
  });

  const pollingDeps = {
    ...deps,
    recipeAgentService,
    config,
  };

  console.log(`Starting stage=${stage} videoId=${videoId}`);

  const started = await startRecipeAgentRunWorkflow(
    {
      supabase,
      videoId,
      conversationId,
      requestedByUserId,
      stage,
      message: resolvedMessage,
    },
    deps,
  );

  if ("alreadyActive" in started && started.alreadyActive) {
    console.error("Conversation already has an active agent run. Clear it first.");
    process.exit(1);
  }

  while (eventQueue.length > 0) {
    const event = eventQueue.shift()!;

    if (event.name === "recipe.agent.run.finalize.requested") {
      const finalized = await finalizeRecipeAgentRunWorkflow(
        event.data as Parameters<typeof finalizeRecipeAgentRunWorkflow>[0],
        pollingDeps,
      );
      console.log(
        JSON.stringify(
          {
            runStatus: finalized.run.status,
            valid: finalized.syncPlan.valid,
            errors: finalized.syncPlan.errors,
          },
          null,
          2,
        ),
      );
      return;
    }

    const pollData = event.data as Parameters<typeof pollRecipeAgentRunWorkflow>[0];
    const delaySeconds = Number(pollData.nextPollDelaySeconds ?? 6);
    const result = await pollRecipeAgentRunWorkflow(pollData, pollingDeps);

    if (result.terminal) {
      continue;
    }

    await sleep(Math.max(delaySeconds, 1) * 1000);
  }

  throw new Error("Polling queue drained without finalize.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
