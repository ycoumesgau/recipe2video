import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeSegmentProgressByPosition } from "./segment.repository";

describe("summarizeSegmentProgressByPosition", () => {
  it("dedupes accepted/total by storyboard position across conversations", () => {
    const summary = summarizeSegmentProgressByPosition([
      {
        id: "a1",
        videoId: "v1",
        position: 1,
        status: "accepted",
        selectedGenerationId: "gen-a1",
      },
      {
        id: "a2",
        videoId: "v1",
        position: 1,
        status: "review",
        selectedGenerationId: null,
      },
      {
        id: "b1",
        videoId: "v1",
        position: 2,
        status: "review",
        selectedGenerationId: null,
      },
      {
        id: "b2",
        videoId: "v1",
        position: 2,
        status: "review",
        selectedGenerationId: null,
      },
      {
        id: "c1",
        videoId: "v1",
        position: 6,
        status: "accepted",
        selectedGenerationId: "gen-c1",
      },
      {
        id: "c2",
        videoId: "v1",
        position: 6,
        status: "accepted",
        selectedGenerationId: "gen-c2",
      },
      {
        id: "d1",
        videoId: "v1",
        position: 7,
        status: "accepted",
        selectedGenerationId: "gen-d1",
      },
    ]);

    assert.equal(summary.acceptedCount, 3);
    assert.equal(summary.totalCount, 4);
  });

  it("counts a slot as accepted when status is failed but a variant is still selected", () => {
    const summary = summarizeSegmentProgressByPosition([
      {
        id: "s1",
        videoId: "v1",
        position: 1,
        status: "failed",
        selectedGenerationId: "gen-old",
      },
      {
        id: "s2",
        videoId: "v1",
        position: 2,
        status: "failed",
        selectedGenerationId: null,
      },
    ]);

    assert.equal(summary.acceptedCount, 1);
    assert.equal(summary.totalCount, 2);
  });
});
