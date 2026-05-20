import assert from "node:assert/strict";
import test from "node:test";

import { getRunwayBudgetState } from "./get-cost-dashboard-data";

test("getRunwayBudgetState exposes Runway creditBalance as creditsRemaining without subtracting logged usage", () => {
  const runwayCreditsUsed = 12_345;
  const runwayCreditBalance = 45_138;

  const budget = getRunwayBudgetState(runwayCreditsUsed, {
    runwayCreditBalance,
    maxMonthlyCreditSpend: 204_000,
  });

  assert.equal(budget.creditsRemaining, runwayCreditBalance);
  assert.notEqual(budget.creditsRemaining, runwayCreditBalance - runwayCreditsUsed);
});
