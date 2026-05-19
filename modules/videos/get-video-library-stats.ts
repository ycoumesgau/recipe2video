import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { ACTIONABLE_VIDEO_STATUSES } from "./video-status";
import { countVideoProjects } from "./repositories/video.repository";
import type { VideoLibraryStats, VideoProjectArchiveFilter } from "./video.types";

export async function getVideoLibraryStats(
  supabase: SupabaseDataClient,
  archiveFilter: VideoProjectArchiveFilter,
): Promise<VideoLibraryStats> {
  const filter =
    archiveFilter === "all" ? "active" : archiveFilter;

  const [total, activeVideos, projectsWaitingForReview, videosCompleted] =
    await Promise.all([
      countVideoProjects(supabase, { archiveFilter: filter }),
      countVideoProjects(supabase, {
        archiveFilter: filter,
        excludeStatuses: ["exported", "failed"],
      }),
      countVideoProjects(supabase, {
        archiveFilter: filter,
        status: [...ACTIONABLE_VIDEO_STATUSES],
      }),
      countVideoProjects(supabase, {
        archiveFilter: filter,
        status: "exported",
      }),
    ]);

  return {
    total,
    activeVideos,
    projectsWaitingForReview,
    videosCompleted,
  };
}
