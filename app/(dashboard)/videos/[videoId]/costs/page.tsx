import { loadProjectCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import { CostDashboard } from "@/modules/costs/ui/cost-dashboard";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";

export default async function VideoCostsPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const dataMode = await readDashboardDataMode();
  const data = await loadProjectCostDashboardData(videoId, {
    useMockFallback: dataMode === "mock",
  });

  return <CostDashboard data={data} />;
}
