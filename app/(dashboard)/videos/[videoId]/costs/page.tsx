import { loadProjectCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import { CostDashboard } from "@/modules/costs/ui/cost-dashboard";

export default async function VideoCostsPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const data = await loadProjectCostDashboardData(videoId);

  return <CostDashboard data={data} />;
}
