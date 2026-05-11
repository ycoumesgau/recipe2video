import { loadGlobalCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import { CostDashboard } from "@/modules/costs/ui/cost-dashboard";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";

export default async function CostsPage() {
  const dataMode = await readDashboardDataMode();
  const data = await loadGlobalCostDashboardData({
    useMockFallback: dataMode === "mock",
  });

  return <CostDashboard data={data} />;
}
