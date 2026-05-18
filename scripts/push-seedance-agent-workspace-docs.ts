/**
 * Pushes Seedance duration documentation updates to the GitHub agent workspace
 * configured via CURSOR_AGENT_REPO_URL + RECIPE_AGENT_GITHUB_TOKEN (Contents:
 * Write). Optional argv[1]: path to a checkout of recipe2video-agent-workspace
 * containing the modified files (defaults to /tmp/recipe2video-agent-workspace-check).
 *
 * Usage: npx tsx scripts/push-seedance-agent-workspace-docs.ts [sourceRoot]
 */
import fs from "node:fs";
import path from "node:path";

import {
  pushFileToAgentWorkspace,
  resolveAgentWorkspaceTarget,
} from "../modules/library/services/agent-workspace-github";

const RELATIVE_PATHS = [
  ".cursor/agents/scene-verifier.md",
  ".cursor/rules/recipe-agent-core.mdc",
  ".cursor/rules/seedance-references.mdc",
  ".cursor/skills/seedance-workflow/SKILL.md",
  "contracts/artifact-schemas.md",
] as const;

async function main() {
  const sourceRoot = path.resolve(process.argv[2] ?? "/tmp/recipe2video-agent-workspace-check");
  const target = resolveAgentWorkspaceTarget();

  for (const rel of RELATIVE_PATHS) {
    const absolute = path.join(sourceRoot, rel);
    if (!fs.existsSync(absolute)) {
      throw new Error(`Missing source file: ${absolute}`);
    }
    const content = fs.readFileSync(absolute, "utf8");
    const result = await pushFileToAgentWorkspace({
      target,
      path: rel,
      content,
      commitMessage: `docs(seedance): ${rel} — durationTarget 5-15s (Runway seedance2)`,
    });
    console.log(rel, result.committed ? result.commitUrl ?? result.commitSha : result.skippedReason ?? result);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
