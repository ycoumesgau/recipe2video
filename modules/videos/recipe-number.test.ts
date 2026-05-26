import assert from "node:assert/strict";
import test from "node:test";

import { parseRecipeNumberInput } from "./recipe-number";

test("parseRecipeNumberInput accepts positive integers in range", () => {
  assert.equal(parseRecipeNumberInput("12"), 12);
  assert.equal(parseRecipeNumberInput(" 42 "), 42);
});

test("parseRecipeNumberInput rejects invalid values", () => {
  assert.equal(parseRecipeNumberInput(""), null);
  assert.equal(parseRecipeNumberInput("0"), null);
  assert.equal(parseRecipeNumberInput("-3"), null);
  assert.equal(parseRecipeNumberInput("12.5"), null);
  assert.equal(parseRecipeNumberInput("abc"), null);
});
