import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { sumRunwayCreditsUsed } from "@/modules/costs/repositories/cost.repository";
import { fetchRunwayOrganizationBalance } from "@/modules/costs/runway-organization-balance";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";
import { getProjectThumbnailPlaybackIds } from "@/modules/media-assets/repositories/media-asset.repository";
import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { getVideoLibraryStats } from "@/modules/videos/get-video-library-stats";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";
import { VideoLibraryDashboard } from "@/modules/videos/ui/video-library-dashboard";

export const VIDEO_LIBRARY_PAGE_SIZE = 12;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; page?: string }>;
}) {
  const { archived, page: pageParam } = await searchParams;
  const libraryMode = archived === "1" ? "archived" : "active";
  const requestedPage = parseLibraryPage(pageParam);
  const dataMode = await readDashboardDataMode();

  const [
    { projects, thumbnailByProjectId, libraryStats, page },
    runwayBalance,
    runwayCreditsUsedLogged,
  ] = await Promise.all([
    loadProjectsForDashboard(libraryMode, requestedPage),
    fetchRunwayOrganizationBalance(),
    loadRunwayCreditsUsedLogged(),
  ]);

  const includeSeededDemos =
    dataMode === "mock" && libraryMode === "active" && page === 1;

  const thumbnailUrlByProjectId = buildThumbnailUrlMap(thumbnailByProjectId);
  const data = getVideoDashboardData(projects, thumbnailUrlByProjectId, {
    includeSeededDemos,
    runwayBalance,
    runwayCreditsUsedLogged,
    libraryStats,
    pagination: {
      page,
      pageSize: VIDEO_LIBRARY_PAGE_SIZE,
      totalProjects: libraryStats.total,
    },
  });

  return (
    <VideoLibraryDashboard
      data={data}
      libraryMode={libraryMode}
      libraryPage={page}
    />
  );
}

function parseLibraryPage(pageParam: string | undefined) {
  const parsed = Number.parseInt(pageParam ?? "1", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 1;
  }
  return parsed;
}

async function loadProjectsForDashboard(
  libraryMode: "active" | "archived",
  requestedPage: number,
) {
  const archiveFilter = libraryMode === "archived" ? "archived" : "active";

  try {
    const supabase = createSupabaseAdminClient();
    const libraryStats = await getVideoLibraryStats(supabase, archiveFilter);
    const totalPages = Math.max(
      1,
      Math.ceil(libraryStats.total / VIDEO_LIBRARY_PAGE_SIZE),
    );
    const page = Math.min(requestedPage, totalPages);
    const offset = (page - 1) * VIDEO_LIBRARY_PAGE_SIZE;

    const projects = await listVideoProjects(supabase, {
      limit: VIDEO_LIBRARY_PAGE_SIZE,
      offset,
      archiveFilter,
    });

    const thumbnailByProjectId = await getProjectThumbnailPlaybackIds(
      supabase,
      projects.map((project) => project.id),
    );

    return { projects, thumbnailByProjectId, libraryStats, page };
  } catch {
    return {
      projects: [],
      thumbnailByProjectId: new Map<string, string>(),
      libraryStats: {
        total: 0,
        activeVideos: 0,
        projectsWaitingForReview: 0,
        videosCompleted: 0,
      },
      page: 1,
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
