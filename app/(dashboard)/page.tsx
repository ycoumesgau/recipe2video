import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";
import { VideoLibraryDashboard } from "@/modules/videos/ui/video-library-dashboard";

export default async function DashboardPage() {
  const projects = await loadProjectsForDashboard();
  const data = getVideoDashboardData(projects);

  return <VideoLibraryDashboard data={data} />;
}

async function loadProjectsForDashboard() {
  try {
    const supabase = createSupabaseAdminClient();
    return listVideoProjects(supabase, { limit: 12 });
  } catch {
    return [];
  }
}
