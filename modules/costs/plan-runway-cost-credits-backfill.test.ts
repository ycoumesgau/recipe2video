import assert from "node:assert/strict";
import { test } from "node:test";

import type { CostLog } from "./cost.types";
import { planRunwayCostCreditsBackfill } from "./plan-runway-cost-credits-backfill";
import {
  RUNWAY_SEGMENT_GENERATION_REFUNDED,
  RUNWAY_SEGMENT_GENERATION_STARTED,
  RUNWAY_SEGMENT_GENERATION_SUCCEEDED,
} from "./runway-cost-operations";

function baseLog(overrides: Partial<CostLog>): CostLog {
  return {
    id: "log-1",
    videoId: "video-1",
    segmentId: "segment-1",
    provider: "runway",
    model: "seedance2",
    operation: RUNWAY_SEGMENT_GENERATION_STARTED,
    creditsUsed: 200,
    costDollars: null,
    tokensInput: null,
    tokensOutput: null,
    metadata: { generationId: "gen-1" },
    createdBy: "user-1",
    createdAt: "2026-05-09T00:00:00.000Z",
    ...overrides,
  };
}

test("planRunwayCostCreditsBackfill zeros started when succeeded already carries credits", () => {
  const plan = planRunwayCostCreditsBackfill({
    logs: [
      baseLog({
        id: "started",
        operation: RUNWAY_SEGMENT_GENERATION_STARTED,
        creditsUsed: 200,
      }),
      baseLog({
        id: "succeeded",
        operation: RUNWAY_SEGMENT_GENERATION_SUCCEEDED,
        creditsUsed: 200,
      }),
    ],
    generations: [],
  });

  assert.equal(plan.zeroCreditsPatches.length, 1);
  assert.equal(plan.zeroCreditsPatches[0]?.logId, "started");
  assert.equal(plan.zeroCreditsPatches[0]?.creditsUsed, 0);
  assert.equal(plan.refundInserts.length, 0);
});

test("planRunwayCostCreditsBackfill inserts partial refund for failed generations", () => {
  const plan = planRunwayCostCreditsBackfill({
    logs: [
      baseLog({
        id: "failed-start",
        creditsUsed: 200,
        metadata: { generationId: "gen-failed" },
      }),
    ],
    generations: [
      {
        id: "gen-failed",
        status: "failed",
        segmentId: "segment-1",
        videoId: "video-1",
        model: "seedance2",
        runwayTaskId: "task-1",
        triggeredBy: "user-1",
      },
    ],
  });

  assert.equal(plan.refundInserts.length, 1);
  assert.equal(plan.refundInserts[0]?.operation, RUNWAY_SEGMENT_GENERATION_REFUNDED);
  assert.equal(plan.refundInserts[0]?.creditsUsed, -124);
});

test("planRunwayCostCreditsBackfill zeros duplicate reference start logs", () => {
  const plan = planRunwayCostCreditsBackfill({
    logs: [
      baseLog({
        id: "ref-1",
        segmentId: null,
        model: "gpt_image_2",
        operation: "reference_image_generation_started",
        creditsUsed: 20,
        metadata: { referenceId: "ref-a", runwayTaskId: "task-a" },
        createdAt: "2026-05-09T00:00:00.000Z",
      }),
      baseLog({
        id: "ref-2",
        segmentId: null,
        model: "gpt_image_2",
        operation: "reference_image_generation_started",
        creditsUsed: 20,
        metadata: { referenceId: "ref-a", runwayTaskId: "task-a" },
        createdAt: "2026-05-09T01:00:00.000Z",
      }),
    ],
    generations: [],
  });

  assert.equal(plan.zeroCreditsPatches.length, 1);
  assert.equal(plan.zeroCreditsPatches[0]?.logId, "ref-2");
});
