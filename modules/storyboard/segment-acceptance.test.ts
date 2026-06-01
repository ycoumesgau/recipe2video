import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  segmentHasAcceptedVariant,
  segmentStatusAfterFailedGeneration,
} from "./segment-status";

describe("segmentHasAcceptedVariant", () => {
  it("treats a slot as accepted when selected_generation_id is set", () => {
    assert.equal(
      segmentHasAcceptedVariant({
        status: "failed",
        selectedGenerationId: "gen-1",
      }),
      true,
    );
  });

  it("falls back to status accepted when no selected generation is stored", () => {
    assert.equal(
      segmentHasAcceptedVariant({
        status: "accepted",
        selectedGenerationId: null,
      }),
      true,
    );
  });

  it("returns false when there is no accepted variant", () => {
    assert.equal(
      segmentHasAcceptedVariant({
        status: "failed",
        selectedGenerationId: null,
      }),
      false,
    );
  });
});

describe("segmentStatusAfterFailedGeneration", () => {
  it("keeps accepted when a prior variant is still selected", () => {
    assert.equal(
      segmentStatusAfterFailedGeneration({
        status: "generating",
        selectedGenerationId: "gen-1",
      }),
      "accepted",
    );
  });

  it("marks the segment failed when nothing was accepted", () => {
    assert.equal(
      segmentStatusAfterFailedGeneration({
        status: "generating",
        selectedGenerationId: null,
      }),
      "failed",
    );
  });
});
