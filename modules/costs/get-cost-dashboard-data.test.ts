import assert from "node:assert/strict";
import test from "node:test";

import { SEEDED_COST_LOGS } from "./cost.fixtures";
import {
  getCostDashboardData,
  getRunwayBudgetState,
} from "./get-cost-dashboard-data";

test("getCostDashboardData aggregates logs by provider, model, and segment", () => {
  const data = getCostDashboardData({
    logs: SEEDED_COST_LOGS,
    scope: "global",
  });

  assert.equal(data.byProvider.find((row) => row.key === "runway")?.creditsUsed, 2684);
  assert.equal(
    data.byModel.find((row) => row.key === "runway:seedance2")?.creditsUsed,
    2664,
  );
  assert.equal(
    data.bySegment.find((row) => row.key === "paris-brest-segment-3")?.creditsUsed,
    720,
  );
});

test("getCostDashboardData separates failed and rejected generation spend", () => {
  const data = getCostDashboardData({
    logs: SEEDED_COST_LOGS,
    scope: "global",
  });

  assert.equal(data.failedOrRejected.creditsUsed, 740);
  assert.equal(data.failedOrRejected.logCount, 2);
});

test("getRunwayBudgetState warns at 20% and 10% remaining credits", () => {
  assert.equal(
    getRunwayBudgetState(39_999, {
      runwayCreditBalance: 10_001,
      maxMonthlyCreditSpend: 50_000,
    }).warningLevel,
    null,
  );
  assert.equal(
    getRunwayBudgetState(40_000, {
      runwayCreditBalance: 10_000,
      maxMonthlyCreditSpend: 50_000,
    }).warningLevel,
    20,
  );
  assert.equal(
    getRunwayBudgetState(45_000, {
      runwayCreditBalance: 5_000,
      maxMonthlyCreditSpend: 50_000,
    }).warningLevel,
    10,
  );
});
