import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { SegmentReview } from "@/modules/generation/ui/segment-review";
import {
  getSegmentReviewData,
  type SegmentReviewData,
} from "@/modules/generation/use-cases/get-segment-review";

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
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Segment review
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Segment review
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Compare generated variants, play Mux review copies, select the
            accepted take, and use agent feedback with visible prompt diffs
            before regeneration.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/videos/${videoId}`}>Back to project</Link>
        </Button>
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
        feedbacks: [],
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
