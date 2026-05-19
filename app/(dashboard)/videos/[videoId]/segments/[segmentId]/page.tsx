import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { GenerationRscSync } from "@/modules/generation/ui/generation-rsc-sync";
import { SegmentReview } from "@/modules/generation/ui/segment-review";
import { SegmentReviewHeadingNav } from "@/modules/generation/ui/segment-review-navigation";
import {
  getSegmentReviewData,
  type SegmentReviewData,
} from "@/modules/generation/use-cases/get-segment-review";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

function formatSegmentPageHeading(segment: SeedanceSegment) {
  return `S${segment.position}. ${segment.title}`;
}

export default async function SegmentReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string; segmentId: string }>;
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { segmentId, videoId } = await params;
  const query = await searchParams;
  const { data, dataError } = await loadSegmentReview(videoId, segmentId);

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Segment review
        </Badge>
        <SegmentReviewHeadingNav
          heading={
            <h2 className="licorn-page-title min-w-0">
              {data.segment
                ? formatSegmentPageHeading(data.segment)
                : "Segment review"}
            </h2>
          }
          navigation={data.navigation}
          videoId={videoId}
        />
        <p className="max-w-3xl text-muted-foreground">
          Compare generated variants, play Mux review copies, select the
          accepted take, and use agent feedback with visible prompt diffs
          before regeneration.
        </p>
      </div>

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Segment review data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      <SegmentReview
        data={data}
        dataError={dataError}
        notice={getNotice(query)}
        segmentId={segmentId}
        videoId={videoId}
      />

      <GenerationRscSync
        enabled={data.hasActiveGeneration || data.hasActiveReferenceImageGeneration}
        pollMs={4_000}
      />
    </div>
  );
}

async function loadSegmentReview(videoId: string, segmentId: string): Promise<{
  data: SegmentReviewData;
  dataError: string | null;
}> {
  try {
    const data = await getSegmentReviewData(createSupabaseAdminClient(), {
      videoId,
      segmentId,
    });

    return { data, dataError: null };
  } catch (error) {
    return {
      data: {
        project: null,
        segment: null,
        variants: [],
        hasActiveGeneration: false,
        hasActiveReferenceImageGeneration: false,
        feedbacks: [],
        referenceResolutions: [],
        isLastSegmentOfVideo: false,
        navigation: null,
      },
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load segment review data.",
    };
  }
}

function getNotice(query: {
  message?: string;
  notice?: string;
}): { type: "success" | "error"; message: string } | null {
  if (
    (query.notice !== "success" && query.notice !== "error") ||
    !query.message
  ) {
    return null;
  }

  return {
    type: query.notice,
    message: query.message,
  };
}
