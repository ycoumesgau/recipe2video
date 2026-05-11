import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getLatestCompositionByVideoId } from "@/modules/assembly/repositories/assembly.repository";
import { SunoAssemblyPanel } from "@/modules/assembly/ui/suno-assembly-panel";
import { AssemblyWorkspace } from "@/modules/assembly/ui/assembly-workspace";
import { getAssemblyPageData } from "@/modules/assembly/use-cases/get-assembly-data";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function AssemblyPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ notice?: string; message?: string }>;
}) {
  const { videoId } = await params;
  const { notice, message } = await searchParams;
  const data = await loadAssemblyPageData(videoId);

  if (data.error || !data.assemblyData) {
    return (
      <div className="space-y-6">
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">
          Assembly and Suno music
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Generate the manual Suno prompt, upload the track, preview accepted
          Supabase originals in Remotion, and preserve final exports through
          Supabase Storage before Mux playback.
        </p>
      </div>

      <SunoAssemblyPanel
        composition={data.composition}
        logicalScenes={data.logicalScenes}
        notice={buildNotice(notice, message)}
        project={data.project}
        seedanceSegments={data.seedanceSegments}
        sunoAudioAssets={data.sunoAudioAssets}
        videoId={videoId}
      />

      <AssemblyWorkspace
        compositionId={data.assemblyData.composition?.id}
        finalExports={data.assemblyData.finalExports}
        initialRemotionProps={data.assemblyData.remotionProps}
        missingAcceptedSegments={data.assemblyData.missingAcceptedSegments}
        projectStatus={data.assemblyData.projectStatus}
        projectTitle={data.assemblyData.projectTitle}
        videoId={videoId}
      />
    </div>
  );
}

async function loadAssemblyPageData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, storyboardData, mediaAssets, composition, assemblyData] =
      await Promise.all([
        getVideoProjectById(supabase, videoId),
        getStoryboardReviewData(videoId),
        listMediaAssetsByVideoId(supabase, videoId),
        getLatestCompositionByVideoId(supabase, videoId),
        getAssemblyPageData(videoId),
      ]);

    return {
      project,
      logicalScenes: storyboardData.logicalScenes,
      seedanceSegments: storyboardData.seedanceSegments,
      sunoAudioAssets: mediaAssets.filter((asset) => asset.type === "suno_audio"),
      composition,
      assemblyData,
      error: null,
    };
  } catch (error) {
    return {
      project: null,
      logicalScenes: [],
      seedanceSegments: [],
      sunoAudioAssets: [],
      composition: null,
      assemblyData: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load assembly data.",
    };
  }
}

function buildNotice(
  notice?: string,
  message?: string,
): { type: "success" | "error"; message: string } | null {
  if ((notice !== "success" && notice !== "error") || !message) {
    return null;
  }

  return {
    type: notice,
    message,
  };
}
