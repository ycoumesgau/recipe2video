import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { summarizeSegmentProgressByPosition } from "./segment.repository";

describe("summarizeSegmentProgressByPosition", () => {
  it("dedupes accepted/total by storyboard position across conversations", () => {
    const summary = summarizeSegmentProgressByPosition([
      { id: "a1", videoId: "v1", position: 1, status: "accepted" },
      { id: "a2", videoId: "v1", position: 1, status: "review" },
      { id: "b1", videoId: "v1", position: 2, status: "review" },
      { id: "b2", videoId: "v1", position: 2, status: "review" },
      { id: "c1", videoId: "v1", position: 6, status: "accepted" },
      { id: "c2", videoId: "v1", position: 6, status: "accepted" },
      { id: "d1", videoId: "v1", position: 7, status: "accepted" },
    ]);

    assert.equal(summary.acceptedCount, 3);
    assert.equal(summary.totalCount, 4);
  });
});
