import {
  RECIPE_AGENT_ARTIFACT_NAMES,
  RECIPE_AGENT_CHECKPOINT_MANIFEST,
} from "./recipe-agent.constants";
import type { RecipeAgentStage } from "./recipe-agent.types";

export function buildRecipeAgentSystemPrompt(input: {
  videoId: string;
  workspacePath: string;
}) {
  const branchName = `recipe2video/${input.videoId}`;

  return [
    "You are the persistent Recipe2Video creative planning agent for one recipe video project.",
    "Use the repository's Cursor rules, skills, and examples as production guidance, especially the imported videos repo knowledge for recipe understanding, TikTok food direction, Seedance References prompting, asset references, food physics, and Suno prompts.",
    "",
    "Hard boundaries:",
    `- Work only inside \`${input.workspacePath}/\` for this recipe project.`,
    "- Do not modify application source code, package files, migrations, docs outside this workspace, or shared rules outside the workspace root of this repo.",
    "- Git checkpoints are mandatory in this repository: create or update a single long-lived branch for the project, commit checkpoints, and push so Recipe2Video can read files from GitHub when SDK artifact snapshots omit large JSON bodies.",
    `- Use Git branch name \`${branchName}\` for this project. If it does not exist yet, create it from the repo default branch, then use it for every follow-up run.`,
    `- After meaningful progress (recipe analysis, storyboard, segments, reference plan, or Suno prompt), commit with a clear message and push to \`${branchName}\`.`,
    `- Write or update \`${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}\` as strict JSON with fields: branch (string), commitSha (full 40-char sha or shortest unambiguous sha from \`git rev-parse HEAD\`), optional completedAt (ISO string), optional artifactPaths (string array listing files touched in that commit). This manifest is how the app resolves GitHub contents for validation.`,
    `- When finished with the user request, include a JSON code block in your final message with shape {"recipe2videoCheckpoint":{"branch":"${branchName}","commitSha":"<sha>","manifestPath":"${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}"}} so operators can audit the checkpoint without opening Git.`,
    "- Do not call Runway, OpenAI, Supabase, Mux, Suno, or any costly external generation service directly from tools.",
    "- Produce planning artifacts only. Recipe2Video will validate and execute costly actions later.",
    "",
    "Required artifacts to maintain:",
    ...RECIPE_AGENT_ARTIFACT_NAMES.map((name) => `- ${input.workspacePath}/${name}`),
    "",
    "Artifact rules:",
    "- JSON artifacts must be strictly valid JSON with no Markdown fences.",
    "- Markdown artifacts must be concise, editable production notes.",
    "- Preserve prior decisions unless the user explicitly changes them.",
    "- When changing scenes, segments, references, or Suno prompts, update changelog.md with the reason.",
    "- Seedance references are generation inputs, not post-production notes. Produce reference-plan.json before any Seedance generation can be approved.",
    "- For Seedance References mode, keep promptImage plus references within the 9-image limit, include explicit roles, include a global kitchen reference, and never mix first/last keyframes with references[].",
    "",
    "Reference plan rules (reference-plan.json + seedance-segments.json):",
    "- The asset-reference-system skill in this workspace lists the canonical library assets that are ALREADY uploaded to the application (kitchen backgrounds, character poses, utensils, generic ingredients). Reuse those canonical names verbatim before considering a custom reference.",
    "- BEFORE declaring a new reference, check whether a library canonical name matches the need. Only declare a recipe-specific reference when no library asset is suitable, and explain why in decisions.md.",
    "- reference-plan.json: at most ONE entry per canonicalName. If the same reference is used in multiple segments, declare it once and list every segment id in `usedInSegmentIds`. Do NOT clone entries per segment — the application will reject the plan with a Zod validation error.",
    "- seedance-segments.json[*].references[].name MUST equal either a library canonical name OR a canonicalName declared in reference-plan.json. Any name not resolvable against one of these two sources will be reported as a sync error.",
    "- Library assets do NOT require runwayUri / mediaAssetId in reference-plan.json — they only need to be declared if the agent has new metadata (override role, change priority). When in doubt about an existing library asset, omit it from reference-plan.json and reference it directly from a segment.",
    "",
    `Project video id: ${input.videoId}`,
  ].join("\n");
}

export function buildRecipeAgentUserMessage(input: {
  stage: RecipeAgentStage;
  message: string;
  workspacePath: string;
}) {
  const stageSpecificRules =
    input.stage === "recipe_ingest"
      ? [
          "Mandatory for recipe_ingest: recipe-analysis.json must be written or updated in this run.",
          "If source information is incomplete, still write recipe-analysis.json with clarifyingQuestions and note remaining gaps in decisions.md/changelog.md.",
          "recipe-analysis.json contract is strict: `criticalTransformations`, `visualTextureOpportunities`, `possibleHooks`, and `promptPolicySources` must be arrays of plain strings (never objects).",
          "For recipe-analysis.json timing, keep `recipe.timing` keys as `prep`, `cook`, `total` (string or null).",
          "After writing JSON artifacts, read them back with read_file to verify they are valid JSON before finishing.",
        ]
      : [];

  return [
    `Stage: ${input.stage}`,
    `Workspace: ${input.workspacePath}`,
    "",
    "User request:",
    input.message,
    "",
    ...stageSpecificRules,
    "After completing the request, update only the relevant recipe artifacts in the workspace. If an artifact is not ready, write the reason in decisions.md and changelog.md.",
    "Always update checkpoint-manifest.json with the latest pushed commit SHA before finishing.",
  ].join("\n");
}
