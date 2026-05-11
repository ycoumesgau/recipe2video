// NOTE: no `server-only` import here on purpose. This module is pure
// orchestration over an injected Supabase client + a GitHub fetcher and is
// unit-tested with `tsx --test`. The downstream `agent-workspace-github`
// module is also test-friendly; both are still only imported from server
// actions and server components in the app, so there is no risk of leaking
// secrets to the client bundle.
import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { listAssetLibrary } from "@/modules/references/repositories/asset-library.repository";

import { ASSET_REFERENCE_SKILL_COMMIT_PREFIX } from "../library.constants";
import {
  AgentWorkspaceConfigError,
  pushAssetReferenceSkill,
  resolveAgentWorkspaceTarget,
} from "../services/agent-workspace-github";
import { renderAssetReferenceSkillMarkdown } from "../services/asset-reference-skill-markdown";

export interface RegenerateAssetReferenceSkillResult {
  /** Markdown that was generated (returned in every mode so the UI can show a diff/preview). */
  content: string;
  /**
   * Whether we actually pushed to GitHub:
   * - "committed": a new commit was created
   * - "unchanged": file already matched, nothing to do
   * - "skipped": we deliberately did not push (dry-run, or repo not configured)
   * - "failed": push attempted but errored (the error is in `error`)
   */
  pushStatus: "committed" | "unchanged" | "skipped" | "failed";
  commitSha?: string;
  commitUrl?: string;
  skippedReason?: string;
  error?: string;
}

export interface RegenerateAssetReferenceSkillInput {
  /** When true (default), generate the file but do NOT push it to GitHub. */
  dryRun?: boolean;
  /** Optional reason that ends up in the commit subject. */
  reason?: string;
  /** Optional override of the timestamp baked into the markdown (for tests). */
  generatedAtUtc?: string;
}

/**
 * End-to-end skill regeneration. Reads the current library state, renders the
 * canonical markdown, and (unless `dryRun`) pushes it to the agent workspace
 * repo so the next agent run picks up the fresh inventory.
 *
 * Configuration errors (missing repo / token) downgrade to a "skipped" result
 * instead of throwing: the library mutation that triggered this call already
 * succeeded, and we don't want to roll back DB state because of a missing PAT
 * on a developer's machine. The UI surfaces the skipped reason so operators
 * can fix the env and re-push manually.
 */
export async function regenerateAssetReferenceSkill(
  supabase: SupabaseDataClient,
  input: RegenerateAssetReferenceSkillInput = {},
): Promise<RegenerateAssetReferenceSkillResult> {
  const entries = await listAssetLibrary(supabase, { includeDeprecated: false });
  const content = renderAssetReferenceSkillMarkdown({
    entries,
    generatedAtUtc: input.generatedAtUtc,
  });

  if (input.dryRun) {
    return { content, pushStatus: "skipped", skippedReason: "dry_run" };
  }

  let target;
  try {
    target = resolveAgentWorkspaceTarget();
  } catch (error) {
    if (error instanceof AgentWorkspaceConfigError) {
      return {
        content,
        pushStatus: "skipped",
        skippedReason: error.message,
      };
    }
    throw error;
  }

  const subject = input.reason
    ? `${ASSET_REFERENCE_SKILL_COMMIT_PREFIX}: ${input.reason}`
    : `${ASSET_REFERENCE_SKILL_COMMIT_PREFIX}: regenerate from Recipe2Video /library`;

  try {
    const push = await pushAssetReferenceSkill({
      target,
      content,
      commitMessage: subject,
    });
    if (push.committed) {
      return {
        content,
        pushStatus: "committed",
        commitSha: push.commitSha,
        commitUrl: push.commitUrl,
      };
    }
    return { content, pushStatus: "unchanged" };
  } catch (error) {
    return {
      content,
      pushStatus: "failed",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
