import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { StoryboardReview } from "@/modules/storyboard/ui/storyboard-review";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function StoryboardPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const { project, dataError, logicalScenes, seedanceSegments } =
    await loadStoryboardPageData(videoId);

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Storyboard
        </Badge>
        <h2 className="licorn-page-title">
          {project?.title ?? "Video project"}
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Validate the editorial logical scenes separately from the Seedance
          generation segments before spending Runway credits.
        </p>
      </div>
      <StoryboardReview
        compactPageHeading
        dataError={dataError}
        logicalScenes={logicalScenes}
        project={project}
        seedanceSegments={seedanceSegments}
      />
    </div>
  );
}

async function loadStoryboardPageData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, storyboardData] = await Promise.all([
      getVideoProjectById(supabase, videoId),
      getStoryboardReviewData(videoId),
    ]);

    return {
      project,
      dataError: null,
      logicalScenes: storyboardData.logicalScenes,
      seedanceSegments: storyboardData.seedanceSegments,
    };
  } catch (error) {
    return {
      project: null,
      logicalScenes: [],
      seedanceSegments: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load storyboard data.",
    };
  }
}
