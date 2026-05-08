import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { VideoLibraryDashboard } from "@/modules/videos/ui/video-library-dashboard";

export default function DashboardPage() {
  const data = getVideoDashboardData();

  return <VideoLibraryDashboard data={data} />;
}
