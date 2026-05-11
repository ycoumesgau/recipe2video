import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { sumRunwayCreditsUsed } from "@/modules/costs/repositories/cost.repository";
import { fetchRunwayOrganizationBalance } from "@/modules/costs/runway-organization-balance";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";
import { getProjectThumbnailPlaybackIds } from "@/modules/media-assets/repositories/media-asset.repository";
import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";
import { VideoLibraryDashboard } from "@/modules/videos/ui/video-library-dashboard";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string }>;
}) {
  const { archived } = await searchParams;
  const libraryMode = archived === "1" ? "archived" : "active";
  const dataMode = await readDashboardDataMode();
  const [{ projects, thumbnailByProjectId }, runwayBalance, runwayCreditsUsedLogged] =
    await Promise.all([
      loadProjectsForDashboard(libraryMode),
      fetchRunwayOrganizationBalance(),
      loadRunwayCreditsUsedLogged(),
    ]);
  const thumbnailUrlByProjectId = buildThumbnailUrlMap(thumbnailByProjectId);
  const data = getVideoDashboardData(projects, thumbnailUrlByProjectId, {
    includeSeededDemos: dataMode === "mock" && libraryMode === "active",
    runwayBalance,
    runwayCreditsUsedLogged,
  });

  return <VideoLibraryDashboard data={data} libraryMode={libraryMode} />;
}

async function loadProjectsForDashboard(libraryMode: "active" | "archived") {
  try {
    const supabase = createSupabaseAdminClient();
    const projects = await listVideoProjects(supabase, {
      limit: 12,
      archiveFilter: libraryMode === "archived" ? "archived" : "active",
    });
    const thumbnailByProjectId = await getProjectThumbnailPlaybackIds(
      supabase,
      projects.map((project) => project.id),
    );
    return { projects, thumbnailByProjectId };
  } catch {
    return {
      projects: [],
      thumbnailByProjectId: new Map<string, string>(),
    };
  }
}

function buildThumbnailUrlMap(playbackIdByVideoId: Map<string, string>) {
  const result = new Map<string, string>();
  for (const [videoId, playbackId] of playbackIdByVideoId) {
    result.set(videoId, `https://image.mux.com/${playbackId}/thumbnail.jpg`);
  }
  return result;
}

async function loadRunwayCreditsUsedLogged() {
  try {
    const supabase = createSupabaseAdminClient();
    return await sumRunwayCreditsUsed(supabase);
  } catch {
    return 0;
  }
}
