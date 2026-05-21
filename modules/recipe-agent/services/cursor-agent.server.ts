import "server-only";

import { Agent } from "@cursor/sdk";

import { createCursorRecipeAgentService } from "./cursor-agent.service";

export function createLiveCursorRecipeAgentService() {
  return createCursorRecipeAgentService({
    sdk: {
      create: (options) => Agent.create(options),
      resume: (agentId, options) => Agent.resume(agentId, options),
      getRun: (runId, options) => Agent.getRun(runId, options),
    },
  });
}
