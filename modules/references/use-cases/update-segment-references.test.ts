import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSegmentReferenceDraftsJson } from "./segment-reference-drafts";

describe("parseSegmentReferenceDraftsJson", () => {
  it("returns an empty list for blank input", () => {
    assert.deepEqual(parseSegmentReferenceDraftsJson(""), []);
    assert.deepEqual(parseSegmentReferenceDraftsJson("   "), []);
  });

  it("parses library and recipe targets", () => {
    const drafts = parseSegmentReferenceDraftsJson(
      JSON.stringify([
        {
          libraryAssetId: "lib-1",
          recipeReferenceId: null,
          role: "kitchen context",
          required: true,
        },
        {
          libraryAssetId: null,
          recipeReferenceId: "recipe-2",
          role: "dish anchor",
          required: false,
        },
      ]),
    );

    assert.equal(drafts.length, 2);
    assert.equal(drafts[0]?.libraryAssetId, "lib-1");
    assert.equal(drafts[0]?.recipeReferenceId, null);
    assert.equal(drafts[1]?.recipeReferenceId, "recipe-2");
    assert.equal(drafts[1]?.required, false);
  });

  it("rejects invalid JSON", () => {
    assert.throws(
      () => parseSegmentReferenceDraftsJson("{not-json"),
      /Invalid references payload/,
    );
  });
});
