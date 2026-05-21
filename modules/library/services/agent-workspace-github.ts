// Tested via `regenerate-asset-reference-skill.test.ts`; see that file for
// rationale on the missing `server-only` guard. This module only talks to the
// GitHub Contents API and is invoked exclusively from server actions / the
// /library admin page.
import {
  fetchGithubBranchHeadSha,
  parseGithubRepoFromUrl,
} from "@/modules/recipe-agent/services/github-recipe-artifacts.service";

import { ASSET_REFERENCE_SKILL_PATH } from "../library.constants";

/**
 * Minimal info needed to address a file in the agent workspace repository.
 * Resolved from CURSOR_AGENT_REPO_URL + RECIPE_AGENT_GITHUB_TOKEN at request
 * time so we can support multi-env (local dev points at a fork, prod at the
 * real repo).
 */
export interface AgentWorkspaceTarget {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}

export class AgentWorkspaceConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentWorkspaceConfigError";
  }
}

export function resolveAgentWorkspaceTarget(
  env: Partial<Record<string, string | undefined>> = process.env,
): AgentWorkspaceTarget {
  const repoUrl = env.CURSOR_AGENT_REPO_URL?.trim();
  if (!repoUrl) {
    throw new AgentWorkspaceConfigError(
      "CURSOR_AGENT_REPO_URL is required to push library skill updates.",
    );
  }

  const parsed = parseGithubRepoFromUrl(repoUrl);
  if (!parsed) {
    throw new AgentWorkspaceConfigError(
      `CURSOR_AGENT_REPO_URL is not a valid GitHub URL: ${repoUrl}`,
    );
  }

  const token = (env.RECIPE_AGENT_GITHUB_TOKEN ?? env.GITHUB_TOKEN)?.trim();
  if (!token) {
    throw new AgentWorkspaceConfigError(
      "RECIPE_AGENT_GITHUB_TOKEN (or GITHUB_TOKEN) is required and must have Contents: Write on the agent workspace repo.",
    );
  }

  const branch = (env.CURSOR_AGENT_STARTING_REF ?? "main").trim() || "main";

  return { owner: parsed.owner, repo: parsed.repo, branch, token };
}

interface GithubContentsFileResponse {
  type: string;
  encoding?: string;
  content?: string;
  sha?: string;
}

async function fetchExistingFile(
  target: AgentWorkspaceTarget,
  path: string,
): Promise<{ sha: string; content: string } | null> {
  const url = githubContentsUrl(target, path, target.branch);
  const response = await fetch(url, {
    headers: githubHeaders(target.token),
    next: { revalidate: 0 },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub GET contents failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as GithubContentsFileResponse;
  if (json.type !== "file" || !json.sha) {
    throw new Error(
      `GitHub returned an unexpected contents payload for ${path}: type=${json.type}`,
    );
  }

  const content =
    json.encoding === "base64" && json.content
      ? Buffer.from(json.content, "base64").toString("utf8")
      : "";
  return { sha: json.sha, content };
}

export interface PushFileResult {
  /** True iff the file content was actually committed. False means a no-op (content unchanged). */
  committed: boolean;
  commitSha?: string;
  commitUrl?: string;
  /** Reason the call was a no-op (only set when committed=false). */
  skippedReason?: "unchanged";
}

export interface PushFileInput {
  target: AgentWorkspaceTarget;
  path: string;
  content: string;
  commitMessage: string;
}

/**
 * PUT a single file via the GitHub Contents API. Idempotent: if the remote
 * content already matches `content`, we short-circuit without creating a
 * commit (so spamming the regenerate button doesn't pollute history).
 */
export async function ensureGithubBranchExists(input: {
  owner: string;
  repo: string;
  branch: string;
  fromBranch: string;
  token: string;
}): Promise<void> {
  const existing = await fetchGithubBranchHeadSha({
    owner: input.owner,
    repo: input.repo,
    branch: input.branch,
    token: input.token,
  });
  if (existing) {
    return;
  }

  const sourceSha = await fetchGithubBranchHeadSha({
    owner: input.owner,
    repo: input.repo,
    branch: input.fromBranch,
    token: input.token,
  });
  if (!sourceSha) {
    throw new Error(
      `Cannot create branch ${input.branch}: source branch ${input.fromBranch} was not found in the agent workspace repository.`,
    );
  }

  const slug = `${input.owner}/${input.repo}`;
  const response = await fetch(`https://api.github.com/repos/${slug}/git/refs`, {
    method: "POST",
    headers: {
      ...githubHeaders(input.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: `refs/heads/${input.branch}`,
      sha: sourceSha,
    }),
  });

  if (response.status === 422) {
    return;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub branch creation failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }
}

export async function pushFileToAgentWorkspace(
  input: PushFileInput,
): Promise<PushFileResult> {
  const existing = await fetchExistingFile(input.target, input.path);

  if (existing && existing.content === input.content) {
    return { committed: false, skippedReason: "unchanged" };
  }

  const url = githubContentsUrl(input.target, input.path, undefined);
  const body: Record<string, unknown> = {
    message: input.commitMessage,
    content: Buffer.from(input.content, "utf8").toString("base64"),
    branch: input.target.branch,
  };
  if (existing) {
    body.sha = existing.sha;
  }

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...githubHeaders(input.target.token),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub PUT contents failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as {
    commit?: { sha?: string; html_url?: string };
  };

  return {
    committed: true,
    commitSha: json.commit?.sha,
    commitUrl: json.commit?.html_url,
  };
}

export async function pushAssetReferenceSkill(input: {
  target: AgentWorkspaceTarget;
  content: string;
  commitMessage: string;
}): Promise<PushFileResult> {
  return pushFileToAgentWorkspace({
    target: input.target,
    path: ASSET_REFERENCE_SKILL_PATH,
    content: input.content,
    commitMessage: input.commitMessage,
  });
}

function githubContentsUrl(
  target: AgentWorkspaceTarget,
  path: string,
  ref: string | undefined,
): string {
  const slug = `${target.owner}/${target.repo}`;
  const encodedPath = path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const base = `https://api.github.com/repos/${slug}/contents/${encodedPath}`;
  return ref ? `${base}?ref=${encodeURIComponent(ref)}` : base;
}

function githubHeaders(token: string): Record<string, string> {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "recipe2video-library-admin",
  };
}
