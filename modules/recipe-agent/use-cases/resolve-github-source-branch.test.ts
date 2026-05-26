import assert from "node:assert/strict";
import test from "node:test";

import type { AgentConversation } from "../recipe-agent.types";
import { resolveGithubSourceBranchForAgentWorkspace } from "./resolve-github-source-branch";

const videoId = "05ea0559-21c9-487c-9bf7-415090f9a5a4";
const existingBranch = "cursor/chicken-enchiladas-recipe-ingest-0fc3";
const phantomBranch = `recipe2video/${videoId}/retry-with-sonnet-4-6-high`;

function buildConversation(
  overrides: Partial<AgentConversation> & Pick<AgentConversation, "id" | "name" | "slug">,
): AgentConversation {
  return {
    videoId,
    cursorAgentId: null,
    cursorAgentRuntime: null,
    agentWorkspacePath: `agent-recipes/${videoId}`,
    agentGitBranch: null,
    agentGitCommitSha: null,
    agentStatus: "idle",
    lastAgentRunId: null,
    lastAgentSyncAt: null,
    cursorAgentModel: "gpt-5.5",
    cursorAgentReasoning: null,
    cursorAgentFast: false,
    customInstructions: null,
    includeAssetsManifest: true,
    isActive: false,
    archivedAt: null,
    deletedAt: null,
    createdAt: "2026-05-21T00:00:00.000Z",
    updatedAt: "2026-05-21T00:00:00.000Z",
    ...overrides,
  };
}

function branchExistsOnGithub(branch: string, href: string) {
  const encoded = branch
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  return href.includes(encoded) || href.includes(branch);
}

test("resolveGithubSourceBranchForAgentWorkspace skips phantom preferred branch", async () => {
  const originalFetch = global.fetch;
  const envSnapshot = {
    CURSOR_AGENT_REPO_URL: process.env.CURSOR_AGENT_REPO_URL,
    RECIPE_AGENT_GITHUB_TOKEN: process.env.RECIPE_AGENT_GITHUB_TOKEN,
    CURSOR_AGENT_STARTING_REF: process.env.CURSOR_AGENT_STARTING_REF,
  };

  process.env.CURSOR_AGENT_REPO_URL =
    "https://github.com/ycoumesgau/recipe2video-agent-workspace";
  process.env.RECIPE_AGENT_GITHUB_TOKEN = "test-token";
  process.env.CURSOR_AGENT_STARTING_REF = "main";

  global.fetch = (async (input: RequestInfo | URL) => {
    const href = String(input);

    if (branchExistsOnGithub(existingBranch, href)) {
      return new Response(JSON.stringify({ object: { sha: "abc123" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const resolved = await resolveGithubSourceBranchForAgentWorkspace({
      videoId,
      conversations: [
        buildConversation({
          id: "retry",
          name: "Retry",
          slug: "retry-with-sonnet-4-6-high",
          isActive: true,
          agentGitBranch: phantomBranch,
          agentStatus: "failed",
        }),
        buildConversation({
          id: "initial",
          name: "Initial",
          slug: "initial",
          agentGitBranch: existingBranch,
          agentGitCommitSha: "4bdd74eb13aa7ea16c54ac3588213fd4e0924cea",
          lastAgentSyncAt: "2026-05-11T09:42:06.490Z",
          cursorAgentId: "bc-agent",
        }),
      ],
      preferredBranch: phantomBranch,
    });

    assert.equal(resolved, existingBranch);
  } finally {
    global.fetch = originalFetch;
    process.env.CURSOR_AGENT_REPO_URL = envSnapshot.CURSOR_AGENT_REPO_URL;
    process.env.RECIPE_AGENT_GITHUB_TOKEN = envSnapshot.RECIPE_AGENT_GITHUB_TOKEN;
    process.env.CURSOR_AGENT_STARTING_REF = envSnapshot.CURSOR_AGENT_STARTING_REF;
  }
});
