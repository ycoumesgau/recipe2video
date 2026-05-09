import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getLatestCompositionByVideoId } from "@/modules/assembly/repositories/assembly.repository";
import { SunoAssemblyPanel } from "@/modules/assembly/ui/suno-assembly-panel";
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

  if (data.error) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Assembly data unavailable</AlertTitle>
        <AlertDescription>{data.error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight">
          Assembly and Suno music
        </h2>
        <p className="text-muted-foreground">
          Generate the manual Suno prompt, upload the track, and keep the
          Supabase original linked to this project.
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
    </div>
  );
}

async function loadAssemblyPageData(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, storyboardData, mediaAssets, composition] =
      await Promise.all([
        getVideoProjectById(supabase, videoId),
        getStoryboardReviewData(videoId),
        listMediaAssetsByVideoId(supabase, videoId),
        getLatestCompositionByVideoId(supabase, videoId),
      ]);

    return {
      project,
      logicalScenes: storyboardData.logicalScenes,
      seedanceSegments: storyboardData.seedanceSegments,
      sunoAudioAssets: mediaAssets.filter((asset) => asset.type === "suno_audio"),
      composition,
      error: null,
    };
  } catch (error) {
    return {
      project: null,
      logicalScenes: [],
      seedanceSegments: [],
      sunoAudioAssets: [],
      composition: null,
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
