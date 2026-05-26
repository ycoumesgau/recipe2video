import {
  ensureGithubBranchExists,
  resolveAgentWorkspaceTarget,
} from "@/modules/library/services/agent-workspace-github";

import type { AgentConversation } from "../recipe-agent.types";
import { fetchGithubBranchHeadSha } from "../services/github-recipe-artifacts.service";
import { buildConversationBranchForSlug } from "./ensure-agent-conversation";

function uniqueBranches(candidates: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    ordered.push(trimmed);
  }

  return ordered;
}

function rankConversationsForGithubSource(
  conversations: AgentConversation[],
): AgentConversation[] {
  return [...conversations].sort((left, right) => {
    const leftScore =
      (left.agentGitCommitSha?.trim() ? 4 : 0) +
      (left.lastAgentSyncAt ? 2 : 0) +
      (left.cursorAgentId?.trim() ? 1 : 0);
    const rightScore =
      (right.agentGitCommitSha?.trim() ? 4 : 0) +
      (right.lastAgentSyncAt ? 2 : 0) +
      (right.cursorAgentId?.trim() ? 1 : 0);

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

/**
 * Picks the first Git branch that exists on the agent workspace remote. Skips
 * phantom branches stored on failed conversations (common when a prior create
 * never pushed to GitHub).
 */
export async function resolveGithubSourceBranchForAgentWorkspace(input: {
  videoId: string;
  conversations: AgentConversation[];
  preferredBranch?: string | null;
}): Promise<string> {
  const target = resolveAgentWorkspaceTarget();
  const ranked = rankConversationsForGithubSource(input.conversations);
  const candidates = uniqueBranches([
    input.preferredBranch,
    ...ranked.map((conversation) => conversation.agentGitBranch),
    buildConversationBranchForSlug(input.videoId, "initial"),
    target.branch,
  ]);

  for (const branch of candidates) {
    const sha = await fetchGithubBranchHeadSha({
      owner: target.owner,
      repo: target.repo,
      branch,
      token: target.token,
    });

    if (sha) {
      return branch;
    }
  }

  throw new Error(
    `No Git branch found in the agent workspace repository to fork from. Checked: ${candidates.join(", ")}.`,
  );
}

export async function ensureConversationGitBranchOnGithub(input: {
  videoId: string;
  branch: string;
  conversations: AgentConversation[];
  preferredSourceBranch?: string | null;
}): Promise<string> {
  const fromBranch = await resolveGithubSourceBranchForAgentWorkspace({
    videoId: input.videoId,
    conversations: input.conversations,
    preferredBranch: input.preferredSourceBranch,
  });
  const target = resolveAgentWorkspaceTarget();

  await ensureGithubBranchExists({
    owner: target.owner,
    repo: target.repo,
    branch: input.branch,
    fromBranch,
    token: target.token,
  });

  return fromBranch;
}
