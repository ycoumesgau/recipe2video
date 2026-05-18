import assert from "node:assert/strict";
import test from "node:test";

import { parseConditioningNames } from "./parse-conditioning-names";

test("parseConditioningNames returns an empty array for empty input", () => {
  assert.deepEqual(parseConditioningNames(""), []);
});

test("parseConditioningNames splits on commas and newlines", () => {
  assert.deepEqual(
    parseConditioningNames("KitchenIslandDefault, SquareBakingDish\nCharacter-sheet"),
    ["KitchenIslandDefault", "SquareBakingDish", "Character-sheet"],
  );
});

test("parseConditioningNames trims whitespace around each token", () => {
  assert.deepEqual(
    parseConditioningNames("   KitchenIslandDefault   ,   SquareBakingDish "),
    ["KitchenIslandDefault", "SquareBakingDish"],
  );
});

test("parseConditioningNames strips the @ prefix copied from the skill markdown", () => {
  // The asset-reference-system skill documents anchors as `@Tag`. The
  // operator should be able to paste straight from the skill without
  // hand-editing the @ off each name.
  assert.deepEqual(
    parseConditioningNames("@KitchenIslandDefault, @@SquareBakingDish"),
    ["KitchenIslandDefault", "SquareBakingDish"],
  );
});

test("parseConditioningNames removes duplicates while preserving order", () => {
  assert.deepEqual(
    parseConditioningNames("KitchenIslandDefault, SquareBakingDish, KitchenIslandDefault"),
    ["KitchenIslandDefault", "SquareBakingDish"],
  );
});

test("parseConditioningNames ignores empty tokens from trailing separators", () => {
  assert.deepEqual(
    parseConditioningNames(",,KitchenIslandDefault,,,\n\n"),
    ["KitchenIslandDefault"],
  );
});

test("parseConditioningNames preserves casing for library alias lookup", () => {
  // The lookup is case-insensitive against canonical_name AND aliases, but
  // keeping the operator's casing makes diffs in decisions.md readable.
  assert.deepEqual(
    parseConditioningNames("kitchenislanddefault"),
    ["kitchenislanddefault"],
  );
});
