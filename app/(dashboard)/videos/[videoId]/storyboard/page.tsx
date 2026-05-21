import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { loadRecipeAgentContext } from "@/modules/recipe-agent/load-recipe-agent-context";
import { StoryboardReview } from "@/modules/storyboard/ui/storyboard-review";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function StoryboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ conversation?: string }>;
}) {
  const { videoId } = await params;
  const query = await searchParams;
  const { project, dataError, logicalScenes, seedanceSegments } =
    await loadStoryboardPageData(videoId, query.conversation);

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

async function loadStoryboardPageData(
  videoId: string,
  requestedConversationId?: string,
) {
  try {
    const supabase = createSupabaseAdminClient();
    const project = await getVideoProjectById(supabase, videoId);
    const agentContext = project
      ? await loadRecipeAgentContext(supabase, videoId, requestedConversationId)
      : null;
    const storyboardData = await getStoryboardReviewData(
      videoId,
      agentContext?.storyboardScope ?? { activeOnly: true },
    );

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
