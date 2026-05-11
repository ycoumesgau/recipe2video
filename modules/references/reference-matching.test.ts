import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchableNameSet,
  matchesReference,
  normalizeReferenceName,
} from "./reference-matching";

test("normalizeReferenceName collapses casing, separators and accents", () => {
  assert.equal(normalizeReferenceName("KitchenIslandDefault"), "kitchenislanddefault");
  assert.equal(normalizeReferenceName("island_default"), "islanddefault");
  assert.equal(normalizeReferenceName("Character-sheet"), "charactersheet");
  assert.equal(normalizeReferenceName("Luma-topDown-pose"), "lumatopdownpose");
  assert.equal(normalizeReferenceName(""), "");
  assert.equal(normalizeReferenceName(null), "");
  assert.equal(normalizeReferenceName(undefined), "");
});

test("matchesReference accepts the canonical name and any alias", () => {
  const reference = {
    canonicalName: "island_default",
    aliases: ["KitchenIslandDefault"],
  };

  assert.equal(matchesReference(reference, "island_default"), true);
  assert.equal(matchesReference(reference, "KitchenIslandDefault"), true);
  assert.equal(matchesReference(reference, "kitchenislanddefault"), true);
  assert.equal(matchesReference(reference, "Kitchen-Island-Default"), true);
  assert.equal(matchesReference(reference, "PoseTopDown"), false);
  assert.equal(matchesReference(reference, ""), false);
  assert.equal(matchesReference(reference, null), false);
});

test("buildMatchableNameSet aggregates canonical names and aliases", () => {
  const set = buildMatchableNameSet([
    { canonicalName: "island_default", aliases: ["KitchenIslandDefault"] },
    { canonicalName: "Character-sheet", aliases: ["CharacterSheet"] },
    { canonicalName: "whisk", aliases: ["Whisk"] },
  ]);

  assert.equal(set.has(normalizeReferenceName("KitchenIslandDefault")), true);
  assert.equal(set.has(normalizeReferenceName("island_default")), true);
  assert.equal(set.has(normalizeReferenceName("CharacterSheet")), true);
  assert.equal(set.has(normalizeReferenceName("Character-sheet")), true);
  assert.equal(set.has(normalizeReferenceName("Whisk")), true);
  assert.equal(set.has(normalizeReferenceName("KitchenIslandOverhead")), false);
  assert.equal(set.has(""), false);
});
