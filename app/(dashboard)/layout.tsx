import { redirect } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import {
  getCurrentProfile,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { loadRunwayBudgetSnapshot } from "@/modules/costs/load-runway-budget-snapshot";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";
import { countActiveGenerations } from "@/modules/generation/repositories/generation.repository";
import { countGeneratingReferenceAssets } from "@/modules/references/repositories/reference.repository";

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
  const dataMode = await readDashboardDataMode();

  return (
    <AppShell
      activeTaskCount={headerData.activeTaskCount}
      creditsRemaining={headerData.creditsRemaining}
      creditsUsed={headerData.creditsUsed}
      dashboardDataMode={dataMode}
      userEmail={profile.email}
    >
      {children}
    </AppShell>
  );
}

async function loadHeaderState() {
  try {
    const supabase = createSupabaseAdminClient();
    const [snapshot, seedanceActiveCount, referenceImageActiveCount] =
      await Promise.all([
        loadRunwayBudgetSnapshot(),
        countActiveGenerations(supabase),
        countGeneratingReferenceAssets(supabase),
      ]);
    const activeTaskCount = seedanceActiveCount + referenceImageActiveCount;

    return {
      creditsUsed: snapshot.creditsUsed,
      creditsRemaining: snapshot.budget.runwayBalanceKnown
        ? snapshot.budget.creditsRemaining
        : null,
      activeTaskCount,
    };
  } catch {
    return {
      creditsUsed: 0,
      creditsRemaining: null,
      activeTaskCount: 0,
    };
  }
}
