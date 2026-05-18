import assert from "node:assert/strict";
import test from "node:test";

import {
  RUNWAY_TAG_MAX_LENGTH,
  deriveRunwayTag,
  makeRunwayTagsUnique,
} from "./derive-runway-tag";

test("RUNWAY_TAG_MAX_LENGTH matches the live API contract (16)", () => {
  // Verified against `POST /v1/text_to_image` on 2026-05-18:
  //   "Too big: expected string to have <=16 characters"
  assert.equal(RUNWAY_TAG_MAX_LENGTH, 16);
});

test("deriveRunwayTag truncates aliases longer than 16 chars", () => {
  // `KitchenIslandDefault` is already PascalCase; truncation keeps the
  // first 16 chars.
  assert.equal(deriveRunwayTag("KitchenIslandDefault"), "KitchenIslandDef");
  // Mixed-case word boundaries get capitalized so the @-mention reads
  // cleanly in Runway logs.
  assert.equal(
    deriveRunwayTag("Luma-threeQuarterRight-pose"),
    "LumaThreeQuarter",
  );
});

test("deriveRunwayTag strips hyphens and underscores while preserving word boundaries", () => {
  // GPT-Image 2's @-mention parser only sees identifier-friendly chars.
  // Anything else in the canonical name (snake_case, kebab-case) is
  // removed so the `@Tag` in the prompt and the `referenceImages.tag`
  // payload stay in sync.
  assert.equal(deriveRunwayTag("Character-sheet"), "CharacterSheet");
  assert.equal(deriveRunwayTag("baking_dish"), "BakingDish");
  // `FacialExpressions` (17 chars merged) → truncate to 16: drops the
  // trailing `s`. Documenting the expected output so a future reader
  // doesn't think it's a typo.
  assert.equal(deriveRunwayTag("Facial-expressions"), "FacialExpression");
  assert.equal(
    deriveRunwayTag("Facial-expressions").length,
    16,
  );
});

test("deriveRunwayTag preserves intentional casing when the alias is already valid", () => {
  // `KitchenWide` is 11 chars and already alphanumeric — no transformation.
  assert.equal(deriveRunwayTag("KitchenWide"), "KitchenWide");
});

test("deriveRunwayTag handles all-non-alphanumeric input gracefully", () => {
  assert.equal(deriveRunwayTag("---"), "");
  assert.equal(deriveRunwayTag(""), "");
});

test("makeRunwayTagsUnique passes through unique inputs unchanged", () => {
  assert.deepEqual(
    makeRunwayTagsUnique(["KitchenWide", "BakingDish", "CharacterSheet"]),
    ["KitchenWide", "BakingDish", "CharacterSheet"],
  );
});

test("makeRunwayTagsUnique suffixes collisions with the smallest integer", () => {
  // Two library aliases truncate to the same base. `KitchenLayoutCo` is
  // 15 chars so the collision suffix (`2`, `3`, …) leaves the result at
  // the 16-char cap.
  assert.deepEqual(
    makeRunwayTagsUnique(["KitchenLayoutCo", "KitchenLayoutCo", "KitchenLayoutCo"]),
    ["KitchenLayoutCo", "KitchenLayoutCo2", "KitchenLayoutCo3"],
  );
});

test("makeRunwayTagsUnique always keeps every tag within the 16-char cap", () => {
  // Even when an input is already at the maximum, the collision suffix
  // must shorten the prefix to fit instead of letting the tag overflow.
  const inputs = Array.from({ length: 12 }, () => "KitchenIslandDef"); // 16 chars
  const tags = makeRunwayTagsUnique(inputs);

  assert.equal(tags.length, 12);
  for (const tag of tags) {
    assert.ok(
      tag.length <= RUNWAY_TAG_MAX_LENGTH,
      `tag ${tag} exceeds ${RUNWAY_TAG_MAX_LENGTH} chars`,
    );
  }
  // All tags must be unique.
  assert.equal(new Set(tags).size, tags.length);
});

test("makeRunwayTagsUnique preserves order: first occurrence keeps the clean tag", () => {
  const tags = makeRunwayTagsUnique(["dup", "uniq", "dup"]);
  assert.equal(tags[0], "dup");
  assert.equal(tags[1], "uniq");
  assert.notEqual(tags[2], "dup");
});
