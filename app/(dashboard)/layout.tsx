import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import {
  getCurrentProfile,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getRunwayBudgetState } from "@/modules/costs/get-cost-dashboard-data";
import { sumRunwayCreditsUsed } from "@/modules/costs/repositories/cost.repository";
import { countActiveGenerations } from "@/modules/generation/repositories/generation.repository";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const profile = await getCurrentProfile().catch(async (error) => {
    if (isAuthAccessError(error) && error.code === "unauthorized") {
      redirect("/auth/sign-out?status=unauthorized");
    }

    throw error;
  });

  if (!profile) {
    redirect("/login");
  }

  const headerData = await loadHeaderState();

  return (
    <AppShell
      activeTaskCount={headerData.activeTaskCount}
      creditsRemaining={headerData.creditsRemaining}
      creditsUsed={headerData.creditsUsed}
      userEmail={profile.email}
    >
      {children}
    </AppShell>
  );
}

async function loadHeaderState() {
  // Best-effort: if Supabase is not configured during local rehearsals, fall
  // back to neutral defaults instead of crashing the layout.
  try {
    const supabase = createSupabaseAdminClient();
    const [creditsUsed, activeTaskCount] = await Promise.all([
      sumRunwayCreditsUsed(supabase),
      countActiveGenerations(supabase),
    ]);
    const budget = getRunwayBudgetState(creditsUsed);
    return {
      creditsUsed,
      creditsRemaining: budget.creditsRemaining,
      activeTaskCount,
    };
  } catch {
    return {
      creditsUsed: 0,
      creditsRemaining: 0,
      activeTaskCount: 0,
    };
  }
}
