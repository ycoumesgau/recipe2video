import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { ProjectSegmentsList } from "@/modules/videos/ui/project-segments-list";

export default async function ProjectSegmentsPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const { project, dataError, seedanceSegments } =
    await loadSegmentsPageData(videoId);

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Segments
        </Badge>
        <h2 className="licorn-page-title">
          {project?.title ?? "Segments"}
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Review each Seedance segment, compare variants, and accept takes before
          assembly.
        </p>
      </div>

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Segment data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      {!project && !dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project not found</AlertTitle>
          <AlertDescription>
            No project metadata was found for this ID.
          </AlertDescription>
        </Alert>
      ) : null}

      {project ? (
        <ProjectSegmentsList
          seedanceSegments={seedanceSegments}
          videoId={videoId}
        />
      ) : null}
    </div>
  );
}

async function loadSegmentsPageData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, storyboardData] = await Promise.all([
      getVideoProjectById(supabase, videoId),
      getStoryboardReviewData(videoId),
    ]);

    return {
      project,
      dataError: null,
      seedanceSegments: storyboardData.seedanceSegments,
    };
  } catch (error) {
    return {
      project: null,
      seedanceSegments: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load segment list.",
    };
  }
}
