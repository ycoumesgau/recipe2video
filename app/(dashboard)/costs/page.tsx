import { loadGlobalCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import { CostDashboard } from "@/modules/costs/ui/cost-dashboard";

export default async function CostsPage() {
  const data = await loadGlobalCostDashboardData();

  return <CostDashboard data={data} />;
}
