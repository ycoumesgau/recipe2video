import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
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
  const { projects, thumbnailByProjectId } =
    await loadProjectsForDashboard(libraryMode);
  const thumbnailUrlByProjectId = buildThumbnailUrlMap(thumbnailByProjectId);
  const data = getVideoDashboardData(projects, thumbnailUrlByProjectId, {
    includeSeededDemos: libraryMode === "active",
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
