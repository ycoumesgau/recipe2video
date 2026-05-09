import Link from "next/link";
import { AlertTriangle, ArrowLeft, Clapperboard } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { AgentChatPanel } from "@/modules/feedback/ui/agent-chat-panel";
import { listSegmentFeedbacksBySegmentId } from "@/modules/feedback/repositories/feedback.repository";
import { listGenerationsBySegmentId } from "@/modules/generation/repositories/generation.repository";
import { listMediaAssetsByVideoId } from "@/modules/media-assets/repositories/media-asset.repository";
import { RecipeMuxPlayer } from "@/modules/media-assets/ui/mux-player";
import { getSegmentById } from "@/modules/storyboard/repositories/segment.repository";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function SegmentReviewPage({
  params,
}: {
  params: Promise<{ videoId: string; segmentId: string }>;
}) {
  const { videoId, segmentId } = await params;
  const data = await loadSegmentReviewData(videoId, segmentId);

  if (data.error || !data.project || !data.segment) {
    return (
      <div className="space-y-4">
        <Button asChild variant="outline">
          <Link href={`/videos/${videoId}`}>
            <ArrowLeft />
            Back to project
          </Link>
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Segment unavailable</AlertTitle>
          <AlertDescription>
            {data.error ?? "Unable to load this segment review."}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { feedbacks, generations, mediaAssets, project, segment } = data;
  const selectedGenerationId =
    segment.selectedGenerationId ?? generations[0]?.id ?? null;
  const selectedGeneration =
    generations.find((generation) => generation.id === selectedGenerationId) ??
    generations[0] ??
    null;
  const selectedMediaAsset = selectedGeneration
    ? mediaAssets.find((asset) => asset.generationId === selectedGeneration.id)
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <Button asChild className="mb-4" variant="outline">
            <Link href={`/videos/${videoId}`}>
              <ArrowLeft />
              Back to project
            </Link>
          </Button>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">Segment {segment.position}</Badge>
            <Badge variant="secondary">{segment.status}</Badge>
            <Badge>{project.selectedVideoModel}</Badge>
          </div>
          <h2 className="text-3xl font-semibold tracking-tight">
            {segment.title}
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Review variants, inspect the current prompt, submit feedback, and
            approve a diff before regenerating this Seedance segment.
          </p>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_1fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Selected variant</CardTitle>
              <CardDescription>
                Mux playback is for review only; Supabase Storage remains the
                durable source of truth.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <RecipeMuxPlayer
                playbackId={selectedMediaAsset?.muxPlaybackId}
                title={`${project.title} segment ${segment.position}`}
              />
              {selectedGeneration ? (
                <div className="grid gap-3 text-sm md:grid-cols-2">
                  <Fact label="Generation" value={selectedGeneration.id} />
                  <Fact label="Status" value={selectedGeneration.status} />
                  <Fact label="Model" value={selectedGeneration.model} />
                  <Fact
                    label="Cost"
                    value={
                      selectedGeneration.costCredits
                        ? `${selectedGeneration.costCredits} credits`
                        : "-"
                    }
                  />
                </div>
              ) : (
                <Alert>
                  <Clapperboard className="h-4 w-4" />
                  <AlertTitle>No generation variant yet</AlertTitle>
                  <AlertDescription>
                    The chat is disabled until a generation row exists for this
                    segment.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Variants</CardTitle>
              <CardDescription>
                Current variants for this segment. Selection controls can be
                expanded by the segment review issue.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {generations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No generated variants are stored for this segment yet.
                </p>
              ) : (
                generations.map((generation) => {
                  const asset = mediaAssets.find(
                    (item) => item.generationId === generation.id,
                  );

                  return (
                    <div className="rounded-lg border p-3" key={generation.id}>
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <Badge
                          variant={
                            generation.id === selectedGenerationId
                              ? "default"
                              : "outline"
                          }
                        >
                          {generation.id === selectedGenerationId
                            ? "Selected"
                            : generation.status}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(generation.createdAt)}
                        </span>
                      </div>
                      <RecipeMuxPlayer
                        className="aspect-video"
                        playbackId={asset?.muxPlaybackId}
                        title={`${project.title} variant ${generation.id}`}
                      />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Prompt and model</CardTitle>
            <CardDescription>
              The selected model is visible before any regeneration request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 text-sm">
              <Fact label="Video model" value={project.selectedVideoModel} />
              <Fact label="Duration target" value={`${segment.durationTarget}s`} />
              <Fact label="Mode" value={segment.mode} />
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">References</p>
              <div className="flex flex-wrap gap-1.5">
                {segment.references.length === 0 ? (
                  <Badge variant="outline">No references</Badge>
                ) : (
                  segment.references.map((reference) => (
                    <Badge key={reference.id ?? reference.label} variant="outline">
                      @{reference.label}
                    </Badge>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="mb-2 text-sm font-medium">Current prompt</p>
              <p className="max-h-[620px] overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
                {segment.prompt}
              </p>
            </div>
          </CardContent>
        </Card>

        <AgentChatPanel
          feedbacks={feedbacks}
          generationId={selectedGenerationId}
          segmentId={segment.id}
          videoId={videoId}
        />
      </div>
    </div>
  );
}

async function loadSegmentReviewData(videoId: string, segmentId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const [project, segment, generations, feedbacks, mediaAssets] =
      await Promise.all([
        getVideoProjectById(supabase, videoId),
        getSegmentById(supabase, segmentId),
        listGenerationsBySegmentId(supabase, segmentId),
        listSegmentFeedbacksBySegmentId(supabase, segmentId),
        listMediaAssetsByVideoId(supabase, videoId),
      ]);

    if (segment && segment.videoId !== videoId) {
      throw new Error("Segment does not belong to this video.");
    }

    return {
      project,
      segment,
      generations,
      feedbacks,
      mediaAssets: mediaAssets.filter((asset) => asset.segmentId === segmentId),
      error: null,
    };
  } catch (error) {
    return {
      project: null,
      segment: null,
      generations: [],
      feedbacks: [],
      mediaAssets: [],
      error:
        error instanceof Error
          ? error.message
          : "Unable to load segment review data.",
    };
  }
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-all font-medium">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
