import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getVideoProjectById,
  updateVideoProjectStatus,
} from "@/modules/videos/repositories/video.repository";
import type { VideoProject } from "@/modules/videos/video.types";
import type { VideoStatus } from "@/modules/videos/video-status";

import { resolveRecipeAgentConfig } from "../recipe-agent.config";
import {
  mirrorActiveConversationToVideo,
  updateAgentConversation,
} from "../repositories/agent-conversations.repository";
import { ensureActiveAgentConversation } from "./ensure-agent-conversation";
import { extractAssistantCheckpoint } from "../services/checkpoint-parse";
import {
  buildAgentRecipeWorkspacePathCandidatesForGithub,
  fetchGithubBranchHeadSha,
  fetchCheckpointManifestFromGithub,
  parseGithubRepoFromUrl,
  supplementRecipeAgentArtifactsFromGithub,
} from "../services/github-recipe-artifacts.service";
import type {
  RecipeAgentArtifact,
  RecipeAgentStage,
} from "../recipe-agent.types";
import {
  syncRecipeAgentArtifacts,
  type RecipeAgentArtifactSyncPlan,
} from "./sync-recipe-agent-artifacts";

/**
 * Loads recipe workspace artifacts from GitHub using the same ref + manifest
 * resolution as post-agent runs. Does not call Cursor.
 *
 * Tries multiple `agent-recipes/...` roots when needed (canonical video id path,
 * then other folders by recent Git activity, then stored / session paths) so
 * Git-only sync does not keep reading a stale slug directory after the agent
 * moved artifacts under `agent-recipes/{videoId}`.
 */
export async function fetchRecipeAgentArtifactsFromGithub(input: {
  project: VideoProject;
  /** Last workspace path reported by the Cursor SDK for this run (optional). */
  cursorSessionWorkspacePath?: string | null;
  seedArtifacts?: RecipeAgentArtifact[];
  assistantResultText?: string | undefined;
  /**
   * When set, the assistant checkpoint embedded in `assistantResultText` is
   * ignored so Git sync resolves from branch HEAD. Use for `publication_planning`
   * where a stale checkpoint in `run.result` would pin an old SHA without
   * `song-cover-plan.json`.
   */
  ignoreAssistantCheckpoint?: boolean;
}): Promise<{
  artifacts: RecipeAgentArtifact[];
  gitBranch: string | null;
  gitSha: string | null;
  hasAssistantCheckpoint: boolean;
  resolvedWorkspacePath: string | null;
}> {
  let artifacts = input.seedArtifacts?.length
    ? input.seedArtifacts.map((artifact) => ({ ...artifact }))
    : [];
  let gitBranch: string | null = input.project.agentGitBranch ?? null;
  let gitSha: string | null = input.project.agentGitCommitSha ?? null;
  const assistantCheckpoint = input.ignoreAssistantCheckpoint
    ? null
    : extractAssistantCheckpoint(input.assistantResultText);
  const hasAssistantCheckpoint = !!assistantCheckpoint?.recipe2videoCheckpoint.commitSha;

  if (assistantCheckpoint?.recipe2videoCheckpoint.branch) {
    gitBranch = assistantCheckpoint.recipe2videoCheckpoint.branch;
  }

  if (assistantCheckpoint?.recipe2videoCheckpoint.commitSha) {
    gitSha = assistantCheckpoint.recipe2videoCheckpoint.commitSha;
  }

  let config: ReturnType<typeof resolveRecipeAgentConfig> | undefined;

  try {
    config = resolveRecipeAgentConfig();
  } catch {
    return {
      artifacts,
      gitBranch,
      gitSha,
      hasAssistantCheckpoint,
      resolvedWorkspacePath: null,
    };
  }

  const repo = config.repoUrl ? parseGithubRepoFromUrl(config.repoUrl) : null;
  const token = config.githubToken;

  if (!repo || !token) {
    return {
      artifacts,
      gitBranch,
      gitSha,
      hasAssistantCheckpoint,
      resolvedWorkspacePath: null,
    };
  }

  const gitBranchTrimmed = gitBranch?.trim() ?? "";
  const gitShaTrimmed = gitSha?.trim() ?? "";

  let discoveryRef = gitShaTrimmed;

  if (gitBranchTrimmed) {
    try {
      const branchHeadSha = await fetchGithubBranchHeadSha({
        owner: repo.owner,
        repo: repo.repo,
        branch: gitBranchTrimmed,
        token,
      });

      if (branchHeadSha) {
        discoveryRef = branchHeadSha;
      }
    } catch (error) {
      console.warn(
        "[recipe-agent] Unable to resolve branch HEAD for workspace discovery:",
        error instanceof Error ? error.message : error,
      );
    }
  }

  if (!discoveryRef && gitBranchTrimmed) {
    discoveryRef = gitBranchTrimmed;
  }

  const refForWorkspaceDiscovery = discoveryRef || gitBranchTrimmed || gitShaTrimmed;

  const workspacePathCandidates = await buildAgentRecipeWorkspacePathCandidatesForGithub({
    videoId: input.project.id,
    storedWorkspacePath: input.project.agentWorkspacePath,
    cursorSessionWorkspacePath: input.cursorSessionWorkspacePath,
    owner: repo.owner,
    repo: repo.repo,
    token,
    discoveryRef: refForWorkspaceDiscovery,
  });

  const candidateRefs = await buildGithubArtifactRefs({
    gitBranch,
    gitSha,
    owner: repo.owner,
    repo: repo.repo,
    token,
  });

  if (candidateRefs.length === 0) {
    return {
      artifacts,
      gitBranch,
      gitSha,
      hasAssistantCheckpoint,
      resolvedWorkspacePath: null,
    };
  }

  for (const workspacePath of workspacePathCandidates) {
    for (const candidate of candidateRefs) {
      const retryDelaysMs = getGithubRetryDelaysMs();
      let lastError: unknown;

      for (let attempt = 0; attempt < retryDelaysMs.length; attempt += 1) {
        try {
          const manifest = await fetchCheckpointManifestFromGithub({
            owner: repo.owner,
            repo: repo.repo,
            workspacePath,
            ref: candidate.ref,
            token,
          });

          if (!manifest) {
            throw new Error(`Checkpoint manifest not found at ref ${candidate.ref}`);
          }

          const supplementRef = candidate.preferRefOverManifestSha
            ? candidate.ref
            : manifest?.commitSha ?? candidate.ref;

          const supplemented = await supplementRecipeAgentArtifactsFromGithub({
            workspacePath,
            artifacts,
            artifactPaths: manifest?.artifactPaths,
            preferGithub: true,
            owner: repo.owner,
            repo: repo.repo,
            ref: supplementRef,
            token,
          });

          const hasGithubArtifact = supplemented.some(
            (artifact) => artifact.source === "github",
          );

          if (!hasGithubArtifact) {
            throw new Error(`No GitHub artifacts found at ref ${candidate.ref}`);
          }

          artifacts = supplemented;

          if (manifest?.branch) {
            gitBranch = manifest.branch;
          }

          if (manifest?.commitSha) {
            gitSha = manifest.commitSha;
          }

          if (candidate.persistedSha) {
            gitSha = candidate.persistedSha;
          }

          return {
            artifacts,
            gitBranch,
            gitSha,
            hasAssistantCheckpoint,
            resolvedWorkspacePath: workspacePath,
          };
        } catch (error) {
          lastError = error;
          const delayMs = retryDelaysMs[attempt] ?? 0;
          const isLastAttempt = attempt === retryDelaysMs.length - 1;

          if (!isLastAttempt && delayMs > 0) {
            await sleep(delayMs);
          }
        }
      }

      console.warn(
        "[recipe-agent] GitHub artifact sync failed for ref; trying next fallback:",
        candidate.ref,
        workspacePath,
        lastError instanceof Error ? lastError.message : lastError,
      );
    }
  }

  console.warn(
    "[recipe-agent] GitHub artifact sync failed for all refs and workspace paths; falling back to Cursor SDK artifacts.",
  );

  return {
    artifacts,
    gitBranch,
    gitSha,
    hasAssistantCheckpoint,
    resolvedWorkspacePath: null,
  };
}

/**
 * Re-runs artifact ingestion from Git only (no Cursor agent). Uses the branch
 * / SHA stored on the video plus `GITHUB_*` / recipe-agent repo config.
 */
export async function syncRecipeAgentArtifactsFromGithubOnly(
  supabase: SupabaseDataClient,
  input: { videoId: string },
): Promise<RecipeAgentArtifactSyncPlan> {
  const project = await getVideoProjectById(supabase, input.videoId);

  if (!project) {
    throw new Error(`Video ${input.videoId} not found.`);
  }

  const conversation = await ensureActiveAgentConversation(
    supabase,
    input.videoId,
    project,
  );

  if (!conversation.agentGitBranch?.trim() && !conversation.agentGitCommitSha?.trim()) {
    throw new Error(
      "No Git branch or commit is stored for this project. Run the recipe agent once so a checkpoint branch or SHA is recorded.",
    );
  }

  const enriched = await fetchRecipeAgentArtifactsFromGithub({
    project,
    seedArtifacts: [],
    assistantResultText: undefined,
  });

  if (!enriched.artifacts.some((artifact) => artifact.source === "github")) {
    throw new Error(
      "Could not load any artifacts from GitHub. Check server config (repo URL, token), the workspace path, and that checkpoint-manifest.json exists at the recorded ref.",
    );
  }

  const artifactsToSync = selectArtifactsForStage("general", enriched.artifacts);
  const syncPlan = await syncRecipeAgentArtifacts(supabase, {
    videoId: input.videoId,
    agentConversationId: conversation.id,
    syncStoryboardTables: conversation.isActive,
    artifacts: artifactsToSync,
  });

  const updatedConversation = await updateAgentConversation(supabase, conversation.id, {
    lastAgentSyncAt: new Date().toISOString(),
    agentGitBranch: enriched.gitBranch ?? conversation.agentGitBranch ?? null,
    agentGitCommitSha: enriched.gitSha ?? null,
    agentStatus: syncPlan.valid ? "idle" : "validation_failed",
    ...(enriched.resolvedWorkspacePath
      ? { agentWorkspacePath: enriched.resolvedWorkspacePath }
      : {}),
  });
  await mirrorActiveConversationToVideo(supabase, input.videoId, updatedConversation);

  const nextVideoStatus = resolveVideoStatusAfterAgentSync({
    stage: "general",
    syncPlan,
  });

  if (nextVideoStatus) {
    await updateVideoProjectStatus(supabase, input.videoId, nextVideoStatus);
  }

  return syncPlan;
}

export function selectArtifactsForStage(
  stage: RecipeAgentStage,
  artifacts: RecipeAgentArtifact[],
) {
  if (stage !== "recipe_ingest") {
    return artifacts;
  }

  return artifacts.filter((artifact) => {
    const name = String(artifact.name);
    const isJson = name.endsWith(".json");

    if (!isJson) {
      return true;
    }

    return artifact.source === "github";
  });
}

export function resolveVideoStatusAfterAgentSync(input: {
  stage: RecipeAgentStage;
  syncPlan: RecipeAgentArtifactSyncPlan;
}): VideoStatus | null {
  if (!input.syncPlan.valid) {
    return null;
  }

  if (input.stage === "recipe_ingest") {
    const clarifyingQuestionCount =
      input.syncPlan.recipePatch?.clarifyingQuestions.length ?? 0;

    if (clarifyingQuestionCount > 0) {
      return "clarification_needed";
    }

    if (
      input.syncPlan.logicalScenes.length > 0 &&
      input.syncPlan.segments.length > 0
    ) {
      return "storyboard_ready";
    }

    if (input.syncPlan.recipePatch) {
      return "recipe_ingested";
    }
  }

  if (
    input.stage === "storyboard_revision" &&
    input.syncPlan.logicalScenes.length > 0 &&
    input.syncPlan.segments.length > 0
  ) {
    return "storyboard_ready";
  }

  return null;
}

async function buildGithubArtifactRefs(input: {
  gitBranch: string | null;
  gitSha: string | null;
  owner: string;
  repo: string;
  token: string;
}) {
  /**
   * Try branch tip before the pinned `agent_git_commit_sha`. Operators often
   * push newer JSON to the same branch without updating the video row; if we
   * tried the stored SHA first, Git-only sync would keep ingesting stale blobs
   * even though HEAD already contains fixed artifacts.
   */
  const refs: Array<{
    ref: string;
    persistedSha?: string;
    preferRefOverManifestSha?: boolean;
  }> = [];
  const seen = new Set<string>();
  const add = (entry: {
    ref: string | null | undefined;
    persistedSha?: string;
    preferRefOverManifestSha?: boolean;
  }) => {
    if (!entry.ref || seen.has(entry.ref)) {
      return;
    }

    seen.add(entry.ref);
    refs.push({
      ref: entry.ref,
      persistedSha: entry.persistedSha,
      preferRefOverManifestSha: entry.preferRefOverManifestSha,
    });
  };

  const branch = input.gitBranch?.trim() ?? "";

  if (branch) {
    try {
      const branchHeadSha = await fetchGithubBranchHeadSha({
        owner: input.owner,
        repo: input.repo,
        branch,
        token: input.token,
      });

      add({
        ref: branchHeadSha,
        persistedSha: branchHeadSha ?? undefined,
        preferRefOverManifestSha: true,
      });
    } catch (error) {
      console.warn(
        "[recipe-agent] Unable to resolve GitHub branch HEAD; trying branch ref:",
        error instanceof Error ? error.message : error,
      );
    }

    add({ ref: branch });
  }

  add({
    ref: input.gitSha?.trim(),
    persistedSha: input.gitSha?.trim() ?? undefined,
    preferRefOverManifestSha: true,
  });

  return refs;
}

function getGithubRetryDelaysMs() {
  return process.env.NODE_ENV === "test" ? [0] : [0, 750, 1500];
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
