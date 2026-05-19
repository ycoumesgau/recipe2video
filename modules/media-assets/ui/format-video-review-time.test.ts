import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatVideoReviewTime,
  formatVideoReviewTimeRange,
} from "./format-video-review-time";

test("formatVideoReviewTime shows seconds with hundredths", () => {
  assert.equal(formatVideoReviewTime(3.456), "3.46");
  assert.equal(formatVideoReviewTime(0), "0.00");
  assert.equal(formatVideoReviewTime(-1), "0.00");
  assert.equal(formatVideoReviewTime(Number.NaN), "0.00");
});

test("formatVideoReviewTimeRange joins current and total", () => {
  assert.equal(formatVideoReviewTimeRange(3.1, 6), "3.10\u00a0/\u00a06.00");
});
