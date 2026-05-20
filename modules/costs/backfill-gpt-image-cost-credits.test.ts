import assert from "node:assert/strict";
import test from "node:test";

import {
  planGptImageCostCreditsBackfill,
  resolveGptImageRatio,
} from "./backfill-gpt-image-cost-credits";
import type { CostLog } from "./cost.types";

function baseLog(overrides: Partial<CostLog> = {}): CostLog {
  return {
    id: "log-1",
    videoId: "video-1",
    provider: "runway",
    model: "gpt_image_2",
    operation: "reference_image_generation_started",
    creditsUsed: null,
    createdAt: "2026-05-08T18:00:00.000Z",
    ...overrides,
  };
}

test("planGptImageCostCreditsBackfill fills started reference logs at 20 credits", () => {
  const plan = planGptImageCostCreditsBackfill([
    baseLog({
      metadata: { ratio: "1440:2560", runwayTaskId: "task-a" },
    }),
  ]);

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]?.creditsUsed, 20);
  assert.equal(plan.candidates[0]?.ratio, "1440:2560");
});

test("planGptImageCostCreditsBackfill skips succeeded when started exists for same task", () => {
  const plan = planGptImageCostCreditsBackfill([
    baseLog({
      id: "started",
      operation: "reference_image_generation_started",
      metadata: { runwayTaskId: "task-a", ratio: "1440:2560" },
    }),
    baseLog({
      id: "succeeded",
      operation: "reference_image_generation_succeeded",
      metadata: { runwayTaskId: "task-a", ratio: "1440:2560" },
    }),
  ]);

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]?.logId, "started");
  assert.equal(
    plan.skipped.find((row) => row.logId === "succeeded")?.reason,
    "paired_started_log_exists",
  );
});

test("planGptImageCostCreditsBackfill fills succeeded-only legacy rows", () => {
  const plan = planGptImageCostCreditsBackfill([
    baseLog({
      operation: "reference_image_generation_succeeded",
      metadata: { runwayTaskId: "task-only", ratio: "1440:2560" },
    }),
  ]);

  assert.equal(plan.candidates.length, 1);
  assert.equal(plan.candidates[0]?.creditsUsed, 20);
});

test("resolveGptImageRatio uses the last ratioAttempts entry for album covers", () => {
  const ratio = resolveGptImageRatio(
    baseLog({
      operation: "album_cover_generation_started",
      metadata: { ratioAttempts: ["2880:2880", "2048:2048"] },
    }),
  );

  assert.equal(ratio, "2048:2048");
});
