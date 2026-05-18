import { z } from "zod";

import { buildRecipeAgentWorkspace } from "../recipe-agent.workspace";
import type { RecipeAgentArtifact } from "../recipe-agent.types";
import {
  RECIPE_AGENT_ARTIFACT_NAMES,
  RECIPE_AGENT_CHECKPOINT_MANIFEST,
  RECIPE_AGENT_WORKSPACE_ROOT,
} from "../recipe-agent.constants";

const ManifestArtifactListEntrySchema = z.union([
  z.object({ path: z.string().min(1) }).passthrough(),
  z.string().min(1),
]);

const CheckpointManifestSchema = z
  .object({
    branch: z.string().min(1).optional(),
    commitSha: z.string().min(7).optional(),
    latestPushedCommitSha: z.string().min(7).optional(),
    /** Some agent runs emit this key instead of `commitSha`; treated the same for GitHub sync. */
    checkpointCommitSha: z.string().min(7).optional(),
    artifactPaths: z.array(z.string()).optional(),
    artifacts: z.array(ManifestArtifactListEntrySchema).optional(),
    completedAt: z.string().optional(),
    updatedAtUtc: z.string().optional(),
    manifestPath: z.string().optional(),
    workspace: z.string().optional(),
  })
  .passthrough()
  .refine(
    (value) =>
      !!(value.commitSha || value.latestPushedCommitSha || value.checkpointCommitSha),
    {
      message:
        "Manifest must contain commitSha, latestPushedCommitSha, or checkpointCommitSha.",
    },
  )
  .transform((value) => ({
    ...value,
    commitSha:
      value.commitSha ??
      value.latestPushedCommitSha ??
      value.checkpointCommitSha,
    artifactPaths:
      value.artifactPaths ??
      value.artifacts
        ?.map((entry) => (typeof entry === "string" ? entry : entry.path))
        .filter(Boolean),
  }));

export type RecipeAgentCheckpointManifest = z.infer<typeof CheckpointManifestSchema>;

export function parseGithubRepoFromUrl(
  repoUrl: string,
): { owner: string; repo: string } | null {
  const normalized = repoUrl.trim();
  const sshMatch = normalized.match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?$/i);
  const httpsMatch = normalized.match(
    /github\.com\/([^/]+)\/([^/?#]+)(?:\.git)?(?:\?|#|$)/i,
  );
  const match = sshMatch ?? httpsMatch;

  if (!match) {
    return null;
  }

  const repo = match[2].replace(/\.git$/i, "");

  return { owner: match[1], repo };
}

interface GithubContentFileResponse {
  type: string;
  encoding?: string;
  content?: string;
  sha?: string;
}

interface GithubRefResponse {
  object?: {
    sha?: string;
  };
}

export async function fetchGithubRepositoryFileText(input: {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  token: string;
}): Promise<string | null> {
  const slug = `${input.owner}/${input.repo}`;
  const encodedPath = input.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `https://api.github.com/repos/${slug}/contents/${encodedPath}?ref=${encodeURIComponent(
    input.ref,
  )}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "recipe2video-agent-sync",
    },
    next: { revalidate: 0 },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub contents request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as GithubContentFileResponse;

  if (json.type !== "file" || json.encoding !== "base64" || !json.content) {
    return null;
  }

  return Buffer.from(json.content, "base64").toString("utf8");
}

interface GithubDirectoryEntry {
  name: string;
  path: string;
  type: string;
}

/**
 * Lists immediate children of a directory in the repo at `ref` (branch name
 * or commit SHA). Returns an empty array on 404.
 */
export async function fetchGithubDirectoryEntries(input: {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  token: string;
}): Promise<GithubDirectoryEntry[]> {
  const slug = `${input.owner}/${input.repo}`;
  const encodedPath = input.path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `https://api.github.com/repos/${slug}/contents/${encodedPath}?ref=${encodeURIComponent(
    input.ref,
  )}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "recipe2video-agent-sync",
    },
    next: { revalidate: 0 },
  });

  if (response.status === 404) {
    return [];
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub directory listing failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as unknown;

  if (!Array.isArray(json)) {
    return [];
  }

  return json
    .filter(
      (entry): entry is GithubDirectoryEntry =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as GithubDirectoryEntry).name === "string" &&
        typeof (entry as GithubDirectoryEntry).path === "string" &&
        typeof (entry as GithubDirectoryEntry).type === "string",
    )
    .map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
    }));
}

/**
 * ISO timestamp of the latest commit touching `path` on `ref`, or null when
 * GitHub has no history for that path at this ref.
 */
export async function fetchLatestCommitIsoDateForRepoPath(input: {
  owner: string;
  repo: string;
  path: string;
  ref: string;
  token: string;
}): Promise<string | null> {
  const slug = `${input.owner}/${input.repo}`;
  const params = new URLSearchParams({
    path: input.path,
    sha: input.ref,
    per_page: "1",
  });
  const url = `https://api.github.com/repos/${slug}/commits?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "recipe2video-agent-sync",
    },
    next: { revalidate: 0 },
  });

  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as unknown;

  if (!Array.isArray(json) || json.length === 0) {
    return null;
  }

  const first = json[0] as {
    commit?: { committer?: { date?: string }; author?: { date?: string } };
  };

  return (
    first.commit?.committer?.date ??
    first.commit?.author?.date ??
    null
  );
}

const MAX_AGENT_RECIPE_SUBDIRS_TO_SCORE = 24;

/**
 * Builds an ordered list of workspace roots under `agent-recipes/` to try when
 * pulling artifacts from GitHub. Prefers the canonical `agent-recipes/{videoId}`
 * path, then other recipe folders ordered by latest Git activity on
 * `seedance-segments.json` (fallback: checkpoint manifest, then recipe
 * analysis), then legacy stored / session paths. Avoids stale slug folders when
 * the agent moved work into a UUID directory on the same branch.
 */
export async function buildAgentRecipeWorkspacePathCandidatesForGithub(input: {
  videoId: string;
  storedWorkspacePath?: string | null;
  cursorSessionWorkspacePath?: string | null;
  owner: string;
  repo: string;
  token: string;
  discoveryRef: string;
}): Promise<string[]> {
  const ordered: string[] = [];
  const pushUnique = (path: string | null | undefined) => {
    const trimmed = path?.trim();
    if (!trimmed || ordered.includes(trimmed)) {
      return;
    }
    ordered.push(trimmed);
  };

  const canonical = buildRecipeAgentWorkspace(input.videoId).workspacePath;
  pushUnique(canonical);

  const discoveryRef = input.discoveryRef.trim();

  if (!discoveryRef) {
    pushUnique(input.storedWorkspacePath);
    pushUnique(input.cursorSessionWorkspacePath);
    return ordered;
  }

  let subdirs: GithubDirectoryEntry[] = [];

  try {
    subdirs = await fetchGithubDirectoryEntries({
      owner: input.owner,
      repo: input.repo,
      path: RECIPE_AGENT_WORKSPACE_ROOT,
      ref: discoveryRef,
      token: input.token,
    });
  } catch {
    subdirs = [];
  }

  const recipeDirs = subdirs
    .filter((entry) => entry.type === "dir" && entry.path.startsWith(`${RECIPE_AGENT_WORKSPACE_ROOT}/`))
    .filter((entry) => entry.path !== canonical)
    .slice(0, MAX_AGENT_RECIPE_SUBDIRS_TO_SCORE);

  const scored = await Promise.all(
    recipeDirs.map(async (entry) => {
      const candidates = [
        `${entry.path}/seedance-segments.json`,
        `${entry.path}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}`,
        `${entry.path}/recipe-analysis.json`,
      ];

      let best: string | null = null;

      for (const path of candidates) {
        const iso = await fetchLatestCommitIsoDateForRepoPath({
          owner: input.owner,
          repo: input.repo,
          path,
          ref: discoveryRef,
          token: input.token,
        });

        if (iso && (!best || iso > best)) {
          best = iso;
        }
      }

      return { path: entry.path, activityIso: best };
    }),
  );

  scored.sort((a, b) => {
    if (a.activityIso && b.activityIso) {
      return a.activityIso < b.activityIso ? 1 : a.activityIso > b.activityIso ? -1 : 0;
    }

    if (a.activityIso) {
      return -1;
    }

    if (b.activityIso) {
      return 1;
    }

    return a.path.localeCompare(b.path);
  });

  for (const row of scored) {
    pushUnique(row.path);
  }

  pushUnique(input.storedWorkspacePath);
  pushUnique(input.cursorSessionWorkspacePath);

  return ordered;
}

export async function fetchGithubBranchHeadSha(input: {
  owner: string;
  repo: string;
  branch: string;
  token: string;
}): Promise<string | null> {
  const slug = `${input.owner}/${input.repo}`;
  const encodedBranch = input.branch
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  const url = `https://api.github.com/repos/${slug}/git/ref/heads/${encodedBranch}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${input.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "recipe2video-agent-sync",
    },
    next: { revalidate: 0 },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `GitHub ref request failed (${response.status}): ${body.slice(0, 500)}`,
    );
  }

  const json = (await response.json()) as GithubRefResponse;

  return json.object?.sha ?? null;
}

export async function fetchCheckpointManifestFromGithub(input: {
  owner: string;
  repo: string;
  workspacePath: string;
  ref: string;
  token: string;
}): Promise<RecipeAgentCheckpointManifest | null> {
  const path = `${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}`;
  const raw = await fetchGithubRepositoryFileText({
    owner: input.owner,
    repo: input.repo,
    path,
    ref: input.ref,
    token: input.token,
  });

  if (!raw) {
    return null;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  const result = CheckpointManifestSchema.safeParse(parsed);

  return result.success ? result.data : null;
}

export async function supplementRecipeAgentArtifactsFromGithub(input: {
  workspacePath: string;
  artifacts: RecipeAgentArtifact[];
  artifactPaths?: string[];
  preferGithub?: boolean;
  owner: string;
  repo: string;
  ref: string;
  token: string;
}): Promise<RecipeAgentArtifact[]> {
  const byName = new Map<string, RecipeAgentArtifact>();
  const pathsByName = new Map<string, string>();

  for (const artifact of input.artifacts) {
    byName.set(String(artifact.name), { ...artifact });
  }

  for (const name of RECIPE_AGENT_ARTIFACT_NAMES) {
    pathsByName.set(name, `${input.workspacePath}/${name}`);
  }

  pathsByName.set(
    RECIPE_AGENT_CHECKPOINT_MANIFEST,
    `${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}`,
  );

  for (const artifactPath of input.artifactPaths ?? []) {
    const normalizedPath = artifactPath.replace(/\\/g, "/");
    const underWorkspace = `${input.workspacePath}/`;
    const resolvedPath = normalizedPath.startsWith(underWorkspace)
      ? normalizedPath
      : !normalizedPath.includes("/")
        ? `${underWorkspace}${normalizedPath}`
        : normalizedPath;

    if (!resolvedPath.startsWith(underWorkspace)) {
      continue;
    }

    const name = resolvedPath.split("/").at(-1);

    if (name) {
      pathsByName.set(name, resolvedPath);
    }
  }

  for (const [name, path] of pathsByName) {
    const current = byName.get(name);
    const needsFill =
      input.preferGithub === true ||
      !current ||
      current.content === undefined ||
      current.content.trim() === "";

    if (!needsFill) {
      continue;
    }

    const text = await fetchGithubRepositoryFileText({
      owner: input.owner,
      repo: input.repo,
      path,
      ref: input.ref,
      token: input.token,
    });

    if (!text) {
      continue;
    }

    byName.set(name, {
      name,
      path,
      content: text,
      sizeBytes: Buffer.byteLength(text, "utf8"),
      source: "github",
    });
  }

  return [...byName.values()];
}
