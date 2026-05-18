import assert from "node:assert/strict";
import test from "node:test";

import {
  buildReferenceImagePrompt,
  stripEditorialMetadata,
} from "./build-reference-image-prompt";
import type { ConditioningAnchor } from "./resolve-conditioning-anchors";

const dumplingPrompt = [
  "Generate one vertical-reference still of a compact 8 in / 20 cm square steamed dumpling lasagna in a small square pan on a light terrazzo kitchen island.",
  "Role: finished compact dumpling-lasagna top and cutaway geometry",
  "Priority: 1",
  "Used in segments: segment-01, segment-07, segment-08",
].join("\n");

const anchor = (tag: string): ConditioningAnchor => ({
  canonicalName: tag.toLowerCase(),
  requestedName: tag,
  tag,
  uri: `https://example.invalid/${tag}.png`,
});

test("stripEditorialMetadata removes Role / Priority / Used in segments lines", () => {
  const cleaned = stripEditorialMetadata(dumplingPrompt);

  assert.ok(
    cleaned.startsWith("Generate one vertical-reference still"),
    "narrative body is preserved",
  );
  assert.ok(!/role:/i.test(cleaned), "Role line is removed");
  assert.ok(!/priority:/i.test(cleaned), "Priority line is removed");
  assert.ok(
    !/used in segments:/i.test(cleaned),
    "Used in segments line is removed",
  );
});

test("stripEditorialMetadata is case-insensitive on metadata prefixes", () => {
  const cleaned = stripEditorialMetadata(
    [
      "Body paragraph.",
      "ROLE: cutaway",
      "priority: 2",
      "USED IN SEGMENTS: segment-04",
    ].join("\n"),
  );

  assert.equal(cleaned, "Body paragraph.");
});

test("stripEditorialMetadata handles empty input", () => {
  assert.equal(stripEditorialMetadata(""), "");
});

test("buildReferenceImagePrompt injects @-tags and style lock when anchors are present", () => {
  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: dumplingPrompt,
    anchors: [
      anchor("KitchenIslandDefault"),
      anchor("SquareBakingDish"),
      anchor("Character-sheet"),
    ],
  });

  assert.ok(promptText.includes("Generate one vertical-reference still"));
  assert.ok(promptText.includes("@KitchenIslandDefault"));
  assert.ok(promptText.includes("@SquareBakingDish"));
  assert.ok(promptText.includes("@Character-sheet"));
  assert.ok(
    /macro food-porn lighting/i.test(promptText),
    "style lock is appended",
  );
  assert.ok(
    /vertical 9:16/i.test(promptText),
    "framing lock is appended",
  );
  assert.ok(
    !/used in segments:/i.test(promptText),
    "metadata lines must never reach GPT-Image 2",
  );
});

test("buildReferenceImagePrompt omits the anchors clause when no anchors are provided", () => {
  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: dumplingPrompt,
    anchors: [],
  });

  assert.ok(
    !promptText.includes("visual anchors"),
    "anchors sentence is omitted entirely",
  );
  // The style lock is still appended so an ungrounded reference at least
  // matches the Licorn aesthetic instead of producing random imagery.
  assert.ok(/macro food-porn lighting/i.test(promptText));
});

test("buildReferenceImagePrompt deduplicates the same tag passed twice in the prompt body", () => {
  // The agent's narrative already mentions @KitchenIslandDefault inline; we
  // must still add the explicit composition sentence so GPT-Image 2 cannot
  // silently drop the reference.
  const { promptText } = buildReferenceImagePrompt({
    storedPrompt: "Show @KitchenIslandDefault as the background.",
    anchors: [anchor("KitchenIslandDefault")],
  });

  // Body keeps its single mention; the appended sentence adds the second.
  const matches = promptText.match(/@KitchenIslandDefault/g) ?? [];
  assert.equal(matches.length, 2);
});
