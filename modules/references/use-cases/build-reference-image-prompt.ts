import type { ConditioningAnchor } from "./resolve-conditioning-anchors";

/**
 * Lines that the agent appends to the editorial prompt as bookkeeping but
 * that must NOT be sent to GPT-Image 2 — the model has no use for "Priority:
 * 1" or "Used in segments: segment-01, segment-07", and they pollute the
 * generation context.
 */
const EDITORIAL_METADATA_PREFIXES = [
  "role:",
  "priority:",
  "used in segments:",
];

export interface BuildReferenceImagePromptInput {
  /**
   * The stored prompt on `reference_assets.prompt`. This is the verbatim
   * blob produced by `buildReferencePrompt()` in the recipe-agent sync —
   * narrative prose followed by `Role:` / `Priority:` / `Used in segments:`
   * metadata lines.
   */
  storedPrompt: string;
  anchors: ConditioningAnchor[];
}

export interface BuildReferenceImagePromptResult {
  /**
   * The text that should be sent to Runway's `text_to_image` endpoint as
   * `promptText`. It contains the narrative description plus an explicit
   * instruction that names every anchor with its `@Tag` so the model is
   * forced to ground its output on the provided references.
   */
  promptText: string;
}

/**
 * Build the `promptText` payload for GPT-Image 2 when (re)generating a
 * recipe-specific reference asset.
 *
 * Goals:
 *   1. Strip bookkeeping metadata (`Role:` / `Priority:` / `Used in segments:`)
 *      from what gets sent to the model.
 *   2. Append a short, explicit composition rule referencing the
 *      conditioning anchors by `@Tag` (e.g. "Compose this still inside
 *      `@KitchenIslandDefault` using `@SquareBakingDish` as the pan…").
 *      Without this sentence, the model often ignores `referenceImages` and
 *      reinvents the scene from scratch.
 *   3. Append a Licorn style lock — same terrazzo countertop, same induction
 *      geometry, vertical 9:16 framing — so the anchor matches the visual
 *      identity of the surrounding Seedance segments even when the agent's
 *      narrative forgot to spell it out.
 */
export function buildReferenceImagePrompt(
  input: BuildReferenceImagePromptInput,
): BuildReferenceImagePromptResult {
  const narrative = stripEditorialMetadata(input.storedPrompt);
  const anchorsClause = renderAnchorsClause(input.anchors);
  const styleLock = renderStyleLock();

  const promptText = [narrative, anchorsClause, styleLock]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");

  return { promptText };
}

/**
 * Strip the bookkeeping lines `buildReferencePrompt()` appends to every
 * recipe-state prompt. Operates line-by-line so we keep multi-line
 * narrative bodies intact.
 */
export function stripEditorialMetadata(storedPrompt: string): string {
  if (!storedPrompt) {
    return "";
  }

  const lines = storedPrompt.split(/\r?\n/);
  const kept: string[] = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    const isMetadata = EDITORIAL_METADATA_PREFIXES.some((prefix) =>
      trimmed.toLowerCase().startsWith(prefix),
    );
    if (isMetadata) {
      continue;
    }
    kept.push(rawLine);
  }

  return kept.join("\n").trim();
}

function renderAnchorsClause(anchors: ConditioningAnchor[]): string {
  if (anchors.length === 0) {
    return "";
  }

  // The tag references are the contract with GPT-Image 2: the model treats
  // `@Tag` mentions as pointers to the matching `referenceImages[]` entry.
  // We make the instruction explicit so the model does not silently drop
  // them when the narrative does not mention them.
  const tagList = anchors.map((anchor) => `@${anchor.tag}`).join(", ");
  return [
    `Compose the image using the following Licorn-brand visual anchors: ${tagList}.`,
    "Preserve their geometry, materials, color palette, and proportions exactly. Do NOT replace them with stock equivalents.",
  ].join(" ");
}

function renderStyleLock(): string {
  // This lock mirrors the kitchen-invariant rules from the recipe agent's
  // instructions so that even reference images generated outside the
  // segment context inherit the same visual identity as Seedance outputs.
  return [
    "Style: macro food-porn lighting, light terrazzo countertop, neutral kitchen palette, soft window light, shallow depth of field.",
    "Framing: vertical 9:16 composition matching the surrounding Seedance segments.",
    "Negatives: no on-image text or watermarks, no extra cookware, no humans not declared in the anchors.",
  ].join("\n");
}
