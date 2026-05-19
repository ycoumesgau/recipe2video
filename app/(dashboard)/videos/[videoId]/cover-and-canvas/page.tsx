import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { requestSongCoverPlanFromAgentAction } from "@/modules/song-cover/actions";
import { AlbumCoverCard } from "@/modules/song-cover/ui/album-cover-card";
import { SpotifyCanvasCard } from "@/modules/song-cover/ui/spotify-canvas-card";
import { getCoverAndCanvasPageData } from "@/modules/song-cover/use-cases/get-cover-and-canvas-page-data";

export default async function CoverAndCanvasPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ notice?: string; message?: string }>;
}) {
  const { videoId } = await params;
  const { notice, message } = await searchParams;
  const result = await loadPage(videoId);

  if (result.error || !result.data) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Cover & Canvas unavailable</AlertTitle>
          <AlertDescription>
            {result.error ?? "Unable to load Cover & Canvas data."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const data = result.data;

  return (
    <div className="space-y-8">
      <PageHeader />

      {renderNotice(notice, message)}

      {!data.hasAnyArtifact ? (
        <EmptyState videoId={videoId} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {data.albumCover ? (
            <AlbumCoverCard review={data.albumCover} videoId={videoId} />
          ) : (
            <PartialState
              label="Album cover"
              message="The agent did not include an albumCover entry in song-cover-plan.json."
            />
          )}
          {data.spotifyCanvas ? (
            <SpotifyCanvasCard review={data.spotifyCanvas} videoId={videoId} />
          ) : (
            <PartialState
              label="Spotify Canvas"
              message="The agent did not include a spotifyCanvas entry in song-cover-plan.json."
            />
          )}
        </div>
      )}

      <SpotifyPolicyHelp />
    </div>
  );
}

async function loadPage(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const data = await getCoverAndCanvasPageData(supabase, videoId);
    return { data, error: null as string | null };
  } catch (error) {
    return {
      data: null,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load Cover & Canvas data.",
    };
  }
}

function PageHeader() {
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline">Cover & Canvas</Badge>
      </div>
      <h2 className="licorn-page-title">Cover & Canvas</h2>
      <p className="max-w-3xl text-muted-foreground">
        Streaming-publication assets you upload alongside the Suno track:
        a 1:1 album cover (3000x3000 JPEG) and a 9:16 Spotify Canvas (MP4,
        5-8 s). Optional — the TikTok pipeline ships independently of this
        tab.
      </p>
    </div>
  );
}

function EmptyState({ videoId }: { videoId: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-8 text-center">
      <h3 className="text-lg font-semibold">
        The agent has not planned publication assets yet
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        Ask the agent to produce <code>song-cover-plan.json</code> for this
        recipe. The plan declares the album cover prompt, the Canvas prompt
        with its loop anchor, and the references both deliverables consume.
        Once the agent pushes the artifact, refresh this page to start
        generating.
      </p>
      <form action={requestSongCoverPlanFromAgentAction} className="mt-6">
        <input name="videoId" type="hidden" value={videoId} />
        <Button size="sm" type="submit">
          Ask the agent to plan Spotify assets
        </Button>
      </form>
    </div>
  );
}

function PartialState({
  label,
  message,
}: {
  label: string;
  message: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center">
      <h3 className="font-medium">{label} not planned</h3>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

function SpotifyPolicyHelp() {
  return (
    <details className="rounded-lg border bg-muted/30 p-4 text-sm">
      <summary className="cursor-pointer font-medium">
        Spotify Canvas content policy reminders
      </summary>
      <ul className="mt-3 list-inside list-disc space-y-1 text-muted-foreground">
        <li>No text on screen, no captions, no typography of any kind.</li>
        <li>No logo, no brand mark, no URL, no watermark.</li>
        <li>
          No human face talking, singing, or rapping; no lipsync of any kind
          (mascot included).
        </li>
        <li>No rapid cuts, no intense flashes, no strobing.</li>
        <li>
          Action stays in the upper half of the frame (Spotify controls cover
          the lower half) and away from the extreme edges (some phones crop).
        </li>
        <li>
          Mascot allowed and even encouraged on the album cover; appears at
          least once in the Canvas with a discrete reversible gesture.
        </li>
      </ul>
    </details>
  );
}

function renderNotice(notice?: string, message?: string) {
  if ((notice !== "success" && notice !== "error") || !message) return null;
  return (
    <Alert
      className="border"
      variant={notice === "error" ? "destructive" : "default"}
    >
      <AlertTitle>{notice === "error" ? "Error" : "Saved"}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
