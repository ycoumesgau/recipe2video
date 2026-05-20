import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { loadRunwayBudgetSnapshot } from "@/modules/costs/load-runway-budget-snapshot";
import { readDashboardDataMode } from "@/modules/dashboard/dashboard-data-mode";
import { getProjectThumbnailPlaybackIds } from "@/modules/media-assets/repositories/media-asset.repository";
import { getVideoDashboardData } from "@/modules/videos/get-video-dashboard-data";
import { resolveProjectCardThumbnailUrls } from "@/modules/videos/use-cases/resolve-project-card-thumbnail-urls";
import { getVideoLibraryStats } from "@/modules/videos/get-video-library-stats";
import { listVideoProjects } from "@/modules/videos/repositories/video.repository";
import { loadVideoLibraryCardMetrics } from "@/modules/videos/use-cases/load-video-library-card-metrics";
import { VideoLibraryDashboard } from "@/modules/videos/ui/video-library-dashboard";

export const dynamic = "force-dynamic";

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

  const [{ projects, thumbnailByProjectId, libraryStats, page }, runwaySnapshot] =
    await Promise.all([
      loadProjectsForDashboard(libraryMode, requestedPage),
      loadRunwayBudgetSnapshot(),
    ]);

  const includeSeededDemos =
    dataMode === "mock" && libraryMode === "active" && page === 1;

  const supabase = createSupabaseAdminClient();
  const [thumbnailUrlByProjectId, cardMetricsByVideoId] = await Promise.all([
    resolveProjectCardThumbnailUrls(
      supabase,
      projects.map((project) => project.id),
      thumbnailByProjectId,
    ),
    loadVideoLibraryCardMetrics(supabase, projects),
  ]);
  const data = getVideoDashboardData(projects, thumbnailUrlByProjectId, {
    includeSeededDemos,
    runwayBalance: runwaySnapshot.runwayBalance,
    runwayCreditsUsedLogged: runwaySnapshot.creditsUsed,
    libraryStats,
    cardMetricsByVideoId,
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

