import "server-only";

import { cache } from "react";

import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";

import type { CostBudgetState } from "./cost.types";
import { getRunwayBudgetState } from "./get-cost-dashboard-data";
import { sumRunwayCreditsUsed } from "./repositories/cost.repository";
import {
  fetchRunwayOrganizationBalance,
  type RunwayOrganizationBalance,
} from "./runway-organization-balance";

export interface RunwayBudgetSnapshot {
  creditsUsed: number;
  runwayBalance: RunwayOrganizationBalance | null;
  budget: CostBudgetState;
}

/**
 * Single per-request snapshot of Runway balance + logged usage so the header
 * badge and dashboard KPIs cannot diverge from duplicate API calls.
 */
export const loadRunwayBudgetSnapshot = cache(
  async (): Promise<RunwayBudgetSnapshot> => {
    try {
      const supabase = createSupabaseAdminClient();
      const [creditsUsed, runwayBalance] = await Promise.all([
        sumRunwayCreditsUsed(supabase),
        fetchRunwayOrganizationBalance(),
      ]);
      const budget = getRunwayBudgetState(creditsUsed, {
        runwayCreditBalance: runwayBalance?.creditBalance ?? null,
        maxMonthlyCreditSpend: runwayBalance?.maxMonthlyCreditSpend ?? null,
      });

      return { creditsUsed, runwayBalance, budget };
    } catch {
      return {
        creditsUsed: 0,
        runwayBalance: null,
        budget: getRunwayBudgetState(0),
      };
    }
  },
);
