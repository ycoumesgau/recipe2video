import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { AssemblyWorkspace } from "@/modules/assembly/ui/assembly-workspace";
import { getAssemblyPageData } from "@/modules/assembly/use-cases/get-assembly-data";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { VIDEO_STATUS_LABELS } from "@/modules/videos/video-status";

export default async function AssemblyPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const data = await loadAssemblyPageData(videoId);

  if (data.error || !data.assemblyData) {
    return (
      <div className="space-y-6">
        <div>
          <Badge className="mb-3" variant="outline">
            Assembly
          </Badge>
          <h2 className="licorn-page-title">Assembly</h2>
          <p className="max-w-3xl text-muted-foreground">
            Trim accepted clips on the timeline, balance audio, and upload the
            final MP4 to Supabase Storage with Mux playback.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assembly data unavailable</AlertTitle>
          <AlertDescription>
            {data.error ?? "Unable to load assembly data."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const assemblyTitle =
    data.project?.title ??
    data.assemblyData.projectTitle ??
    "Video project";

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Assembly</Badge>
          {data.project ? (
            <Badge variant="outline">
              {VIDEO_STATUS_LABELS[data.project.status]}
            </Badge>
          ) : null}
        </div>
        <h2 className="licorn-page-title">{assemblyTitle}</h2>
        <p className="max-w-3xl text-muted-foreground">
          Build the vertical edit in Remotion: timeline, clip audio mix, and
          optional Suno music. Upload prompts and audio on the{" "}
          <Link className="font-medium text-foreground underline" href={`/videos/${videoId}/music`}>
            Music
          </Link>{" "}
          page first when you need a custom track.
        </p>
      </div>

      <AssemblyWorkspace
        availableSegments={data.assemblyData.availableSegments}
        compositionExportStatus={
          data.assemblyData.composition?.exportStatus ?? "pending"
        }
        compositionId={data.assemblyData.composition?.id}
        finalExports={data.assemblyData.finalExports}
        initialRemotionProps={data.assemblyData.remotionProps}
        initialTimelineState={data.assemblyData.timelineState}
        missingAcceptedSegments={data.assemblyData.missingAcceptedSegments}
        projectStatus={data.assemblyData.projectStatus}
        projectTitle={data.assemblyData.projectTitle}
        renderProgress={data.assemblyData.renderProgress}
        videoId={videoId}
      />
    </div>
  );
}

async function loadAssemblyPageData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, assemblyData] = await Promise.all([
      getVideoProjectById(supabase, videoId),
      getAssemblyPageData(videoId),
    ]);

    return {
      project,
      assemblyData,
      error: null,
    };
  } catch (error) {
    return {
      project: null,
      assemblyData: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load assembly data.",
    };
  }
}
