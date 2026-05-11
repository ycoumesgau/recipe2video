import type { LogicalScene, SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

/**
 * Fallback when `recipe_data.sunoPrompt` / `sunoPromptV2` are not synced yet.
 * Does not encode video duration as song length — operators generate a full
 * track (≈2–3 minutes) for streaming, then trim for short-form edits.
 */
export function buildSunoPrompt(input: {
  project: VideoProject | null;
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  const title = input.project?.title ?? "Recipe2Video cooking short";
  const arcSummary = summarizeArcs(input.seedanceSegments);
  const textureMoments = summarizeTextureMoments(input.logicalScenes);

  return [
    "[Fallback — Recipe Agent has not synced suno-prompt.md yet]",
    "",
    "Ask the Recipe Agent for a Suno revision (stage: Revise Suno prompt) so the full Custom Mode pack (style, excludes, title, auto lyrics, short edit plan) is written to the workspace and synced here.",
    "",
    `Recipe context (for the agent, not a final Suno paste): ${title}.`,
    `Storyboard arc hints: ${arcSummary}.`,
    `Texture / beat hints: ${textureMoments}.`,
    "",
    "Product intent:",
    "- Target a real song length of about 2–3 minutes for Spotify-style distribution.",
    "- Export a 45–90 second lift for the vertical edit separately (see agent template short-version section).",
    "- Do not treat the video runtime as the song length.",
  ].join("\n");
}

function summarizeArcs(seedanceSegments: SeedanceSegment[]) {
  const arcs = seedanceSegments
    .map((segment) => segment.arc || segment.title)
    .filter(Boolean);

  return unique(arcs).slice(0, 6).join(", ") || "hook, preparation, texture payoff, final hero shot";
}

function summarizeTextureMoments(logicalScenes: LogicalScene[]) {
  const candidates = logicalScenes
    .filter((scene) => scene.sceneType === "detail" || scene.note)
    .map((scene) => scene.note || scene.description)
    .filter(Boolean);

  return (
    unique(candidates)
      .slice(0, 4)
      .join("; ") ||
    "crisp ingredient close-ups, creamy assembly, golden bake, satisfying final reveal"
  );
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}
