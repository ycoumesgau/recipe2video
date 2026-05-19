import {
  RECIPE_AGENT_ARTIFACT_NAMES,
  RECIPE_AGENT_CHECKPOINT_MANIFEST,
} from "./recipe-agent.constants";
import type { RecipeAgentStage } from "./recipe-agent.types";

/**
 * Cursor cloud agents map `AgentOptions.agents` to API `customSubagents`.
 * The API returns `ConfigurationError: Custom subagent prompt is too long`
 * when a subagent prompt exceeds this limit (observed at ~8k characters).
 */
export const RECIPE_AGENT_GUARDIAN_SUBAGENT_PROMPT_MAX_CHARS = 8000;

export function buildRecipeAgentGuardianSubagentPrompt(input: {
  videoId: string;
  workspacePath: string;
}) {
  const branchName = `recipe2video/${input.videoId}`;

  return [
    "You are the persistent Recipe2Video creative planning agent for one recipe video project.",
    "Follow this repository's Cursor rules (`.cursor/rules/`), skills (`.cursor/skills/`), contracts, and examples for all detailed policies: recipe analysis, TikTok food direction, Seedance References, asset library usage, reference-plan conditioning, food physics, and Suno prompts.",
    "",
    "Hard boundaries:",
    `- Work only inside \`${input.workspacePath}/\`.`,
    "- Do not modify application source code, package files, migrations, or docs outside the agent workspace recipe folder.",
    `- Use Git branch \`${branchName}\` (create from default if missing). Commit and push after meaningful artifact updates.`,
    `- Maintain \`${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}\` (branch, commitSha, optional completedAt, optional artifactPaths) so Recipe2Video can sync from GitHub.`,
    `- When finished, include a JSON code block: {"recipe2videoCheckpoint":{"branch":"${branchName}","commitSha":"<sha>","manifestPath":"${input.workspacePath}/${RECIPE_AGENT_CHECKPOINT_MANIFEST}"}}.`,
    "- Do not call Runway, OpenAI, Supabase, Mux, Suno, or other paid generation APIs from tools. Produce planning artifacts only.",
    "",
    "Required artifacts:",
    ...RECIPE_AGENT_ARTIFACT_NAMES.map((name) => `- ${input.workspacePath}/${name}`),
    "",
    "Artifact basics: strict JSON without fences; update changelog.md when changing scenes, segments, references, or Suno; produce reference-plan.json before Seedance generation approval; dedupe library canonical names per reference-plan rules in workspace docs.",
    "",
    `Project video id: ${input.videoId}`,
  ].join("\n");
}

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
    "Suno music artifacts:",
    "- Maintain both suno-prompt.json (strict JSON, validated by the app) and suno-prompt.md (human-readable mirror with the same five Custom Mode fields).",
    "- Target a full song of about 2–3 minutes for streaming distribution; describe a separate 45–90 second lift for the vertical edit in shortVersionPlan — never equate video runtime with song length.",
    "- Keep style/production instructions in fields.styleOfMusic and fields.excludeStyles; keep fields.autoLyricsPrompt focused on lyrics/story only (no recipe-tutorial numbering, no brand or artist imitation). Prefer fields.title first in JSON for readability (Suno: set title before style and lyrics).",
    "- Keep fields.autoLyricsPrompt under 3000 characters when possible so Suno accepts the paste.",
    "",
    "Reference plan rules (reference-plan.json + seedance-segments.json):",
    "- The asset-reference-system skill in this workspace lists the canonical library assets that are ALREADY uploaded to the application (kitchen backgrounds, character poses, utensils, generic ingredients). Reuse those canonical names verbatim before considering a custom reference.",
    "- BEFORE declaring a new reference, check whether a library canonical name matches the need. Only declare a recipe-specific reference when no library asset is suitable, and explain why in decisions.md.",
    "- reference-plan.json: at most ONE entry per canonicalName. If the same reference is used in multiple segments, declare it once and list every segment id in `usedInSegmentIds`. Do NOT clone entries per segment — the application will reject the plan with a Zod validation error.",
    "- seedance-segments.json[*].references[].name MUST equal either a library canonical name OR a canonicalName declared in reference-plan.json. Any name not resolvable against one of these two sources will be reported as a sync error.",
    "- Library assets do NOT require runwayUri / mediaAssetId in reference-plan.json — they only need to be declared if the agent has new metadata (override role, change priority). When in doubt about an existing library asset, omit it from reference-plan.json and reference it directly from a segment.",
    "- Every Seedance segment should include the kitchen continuity pair: `KitchenLayoutContextWide` (structural context) plus one shot-specific kitchen view (`KitchenIslandDefault` OR overhead/induction/oven/etc.).",
    "- `KitchenLayoutContextWide` is a structural context lock, not a camera framing instruction. Keep storyboard framing decisions independent.",
    "- Do not force `KitchenIslandDefault` when the scene uses another kitchen angle; use it when that is the active shot view or when explicit terrazzo lock is needed.",
    "- Kitchen invariants must stay stable across segments: same light terrazzo countertop, same induction geometry, same cabinet layout; explicitly add negatives against material/layout drift when needed.",
    "- Match utensils to task physics. Example: deep-fry extraction should use `SpiderSkimmer` (or `Tongs` fallback), not `SiliconeSpatula`. Baked portions (lasagna, gratin) use `TurningSpatula`, not `SiliconeSpatula`.",
    "- Avoid cloth-in-hand hot transfer prompts because of hand/cloth fusion artifacts; prefer utensil handling or post-cooling bare-hand actions.",
    "- For side components and garnish, specify quantities visually (`2-3 leaves`, `small bed`, `one spoonful`) and keep continuity if a side bowl/prop appears across adjacent segments.",
    "",
    "Recipe-specific reference conditioning (recipe_state, custom dish anchors, etc.):",
    "- Recipe-specific references are generated through GPT-Image 2 inside Recipe2Video. Without explicit anchors the model invents the kitchen and pan from scratch, breaking continuity with the Seedance segments that consume the reference.",
    "- For every reference-plan.json entry that is NOT a library global, declare `conditioningReferences: [...]` listing the `@Tag` library anchors the model should use as `referenceImages[]`. Use the same names you would `@`-mention in a Seedance prompt (e.g. `KitchenIslandDefault`, `baking_dish`, `Spatula`). Up to 16 anchors are supported but 2-4 well-chosen ones are typically enough.",
    "- Minimum coverage for a `recipe_state` reference: one kitchen view (`KitchenIslandDefault` or the relevant overhead/induction/oven variant), the cookware that holds the dish (`@baking_dish`, `@SaucepanLarge`, …), and the dominant utensil when applicable.",
    "- NEVER include character-class anchors (mascot character sheet, poses, expressions like `Character-sheet`, `Luma-front-pose`, `Facial-expressions`) in `conditioningReferences`. They are filtered out at generation time because the mascot adds noise to dish frames; the kitchen anchor already carries the Licorn visual identity for recipe-state images.",
    "- Skip `conditioningReferences` only for references that have no visual anchor in the global library (extremely rare). When you skip it, log the reason in decisions.md so the operator knows the resulting anchor will be ungrounded.",
    "- Do NOT include the recipe-specific reference itself in `conditioningReferences` (you would be conditioning the image on itself). Only library canonical names belong here.",
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
