import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SunoAssemblyPanel } from "@/modules/assembly/ui/suno-assembly-panel";
import { getMusicPageData } from "@/modules/assembly/use-cases/get-music-page-data";
import {
  VIDEO_STATUS_BADGE_VARIANT,
  VIDEO_STATUS_LABELS,
} from "@/modules/videos/video-status";

export default async function MusicPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ notice?: string; message?: string }>;
}) {
  const { videoId } = await params;
  const { notice, message } = await searchParams;
  const data = await loadMusicPage(videoId);

  if (data.error || !data.musicData) {
    return (
      <div className="space-y-6">
        <div>
          <Badge className="mb-3" variant="outline">
            Music
          </Badge>
          <h2 className="licorn-page-title">Music</h2>
          <p className="max-w-3xl text-muted-foreground">
            Prepare Suno prompts and upload the project music track before
            editing on the Assembly page.
          </p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Music data unavailable</AlertTitle>
          <AlertDescription>
            {data.error ?? "Unable to load music workflow data."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const pageTitle = data.musicData.project?.title ?? "Video project";

  return (
    <div className="space-y-8">
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">Music</Badge>
          {data.musicData.project ? (
            <Badge
              variant={
                VIDEO_STATUS_BADGE_VARIANT[data.musicData.project.status]
              }
            >
              {VIDEO_STATUS_LABELS[data.musicData.project.status]}
            </Badge>
          ) : null}
        </div>
        <h2 className="licorn-page-title">{pageTitle}</h2>
        <p className="max-w-3xl text-muted-foreground">
          Copy the structured Suno fields, generate audio in Suno manually, then
          upload the track so Assembly can mix it with your accepted clips.
        </p>
      </div>

      <SunoAssemblyPanel
        composition={data.musicData.composition}
        logicalScenes={data.musicData.logicalScenes}
        notice={buildNotice(notice, message)}
        project={data.musicData.project}
        seedanceSegments={data.musicData.seedanceSegments}
        sunoAudioAssets={data.musicData.sunoAudioAssets}
        videoId={videoId}
      />

      <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          When the track is ready, open Assembly to trim clips, align the
          timeline, and export the final MP4.
        </p>
        <Button asChild variant="secondary">
          <Link href={`/videos/${videoId}/assembly`}>Open Assembly</Link>
        </Button>
      </div>
    </div>
  );
}

async function loadMusicPage(videoId: string) {
  try {
    const musicData = await getMusicPageData(videoId);
    return { musicData, error: null };
  } catch (error) {
    return {
      musicData: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load music workflow data.",
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
