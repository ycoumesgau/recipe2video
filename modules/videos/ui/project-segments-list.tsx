import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

export function ProjectSegmentsList({
  seedanceSegments,
  videoId,
}: {
  seedanceSegments: SeedanceSegment[];
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Segment review</CardTitle>
        <CardDescription>
          Open a Seedance segment to compare variants, play Mux review copies,
          submit feedback, and approve prompt diffs before regeneration.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {seedanceSegments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No Seedance segments are available yet. Load or generate a
            storyboard before reviewing variants.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {seedanceSegments.map((segment) => (
              <Card key={segment.id} size="sm">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle>
                      S{segment.position}. {segment.title}
                    </CardTitle>
                    <Badge variant="outline">{segment.status}</Badge>
                  </div>
                  <CardDescription>{segment.arc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid gap-2 text-sm md:grid-cols-3">
                    <OverviewItem
                      label="Duration"
                      value={formatSeconds(segment.durationTarget)}
                    />
                    <OverviewItem
                      label="References"
                      value={String(segment.references.length)}
                    />
                    <OverviewItem
                      label="Accepted"
                      value={segment.selectedGenerationId ? "yes" : "no"}
                    />
                  </div>
                  <Button asChild>
                    <Link href={`/videos/${videoId}/segments/${segment.id}`}>
                      Review segment
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function OverviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function formatSeconds(seconds: number) {
  if (seconds <= 0) {
    return "-";
  }

  return `${Number(seconds.toFixed(1))}s`;
}
