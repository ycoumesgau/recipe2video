import type { LogicalScene, SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import type { VideoProject } from "@/modules/videos/video.types";

export function buildSunoPrompt(input: {
  project: VideoProject | null;
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  const title = input.project?.title ?? "Recipe2Video cooking short";
  const durationSeconds = getTargetDurationSeconds(input.seedanceSegments);
  const arcSummary = summarizeArcs(input.seedanceSegments);
  const textureMoments = summarizeTextureMoments(input.logicalScenes);

  return [
    "Create an original instrumental music track for a vertical social cooking video.",
    `Recipe video: ${title}.`,
    `Target duration: around ${durationSeconds} seconds, easy to trim for a short-form edit.`,
    "",
    "Musical direction:",
    "- warm, playful, premium French patisserie energy",
    "- modern upbeat kitchen groove, polished but not corporate",
    "- light bounce that supports fast hard cuts and texture close-ups",
    "- subtle magical mascot feeling without becoming childish",
    "- no vocals, no lyrics, no spoken words, no voiceover",
    "",
    "Structure:",
    "- immediate 2-3 second hook",
    "- steady rhythmic bed for preparation and assembly",
    "- small lift for the hero reveal",
    "- clean ending that can fade out naturally",
    "",
    `Video arc cues: ${arcSummary}.`,
    `Texture cues to support: ${textureMoments}.`,
    "",
    "Avoid: dramatic trailer music, heavy EDM drops, melancholic piano, cinematic horror tension, generic ukulele ad music.",
  ].join("\n");
}

function getTargetDurationSeconds(seedanceSegments: SeedanceSegment[]) {
  const total = seedanceSegments.reduce(
    (sum, segment) => sum + (segment.durationTarget || 0),
    0,
  );

  return total > 0 ? Math.round(total) : 60;
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
