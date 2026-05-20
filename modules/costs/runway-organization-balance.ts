import "server-only";

import { cache } from "react";

import { createRunwayClient } from "@/modules/generation/services/runway.service";

export interface RunwayOrganizationBalance {
  creditBalance: number;
  maxMonthlyCreditSpend: number | null;
}

export const fetchRunwayOrganizationBalance = cache(
  async (): Promise<RunwayOrganizationBalance | null> => {
  if (!process.env.RUNWAYML_API_SECRET) {
    return null;
  }

  try {
    const org = await createRunwayClient().organization.retrieve();
    const rawBalance = org.creditBalance;
    if (typeof rawBalance !== "number" || !Number.isFinite(rawBalance)) {
      return null;
    }

    const tier = org.tier as { maxMonthlyCreditSpend?: number } | undefined;
    const rawMonthly = tier?.maxMonthlyCreditSpend;
    const maxMonthlyCreditSpend =
      typeof rawMonthly === "number" && Number.isFinite(rawMonthly) && rawMonthly > 0
        ? Math.round(rawMonthly)
        : null;

    return {
      creditBalance: Math.max(0, Math.round(rawBalance)),
      maxMonthlyCreditSpend,
    };
  } catch {
    return null;
  }
  },
);
