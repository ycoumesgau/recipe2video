"use client";

import { Progress } from "@/components/ui/progress";

/**
 * Shared Runway progress widget for any artifact that polls a
 * `text_to_image` or `text_to_video` task: reference images, album
 * covers, Spotify Canvases. Keeps the visual contract aligned across
 * tabs.
 *
 * `runwayProgress` is the 0-100 percentage Runway reports (mirrored from
 * `runway_task_status` rows). When Runway has not surfaced a progress
 * value yet (PENDING / THROTTLED / RUNNING before the first delta), we
 * fall back to a sensible static value driven by the textual status so
 * the bar is never empty.
 */
export function ArtifactRunwayProgress({
  runwayProgress,
  runwayTaskStatus,
}: {
  runwayProgress: number | null | undefined;
  runwayTaskStatus: string | null | undefined;
}) {
  const value = clampRunwayProgress(runwayProgress, runwayTaskStatus);

  return (
    <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-medium">Runway progress</p>
      <Progress value={value} />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
        <span>{runwayTaskStatus ?? "starting"}</span>
        {typeof runwayProgress === "number" ? (
          <span>{runwayProgress.toFixed(0)}%</span>
        ) : (
          <span>queued / running</span>
        )}
      </div>
    </div>
  );
}

export function clampRunwayProgress(
  runwayProgress: number | null | undefined,
  runwayTaskStatus: string | null | undefined,
): number {
  if (typeof runwayProgress === "number") {
    return Math.max(0, Math.min(100, runwayProgress));
  }
  if (runwayTaskStatus === "RUNNING") {
    return 55;
  }
  if (runwayTaskStatus === "THROTTLED") {
    return 18;
  }
  if (runwayTaskStatus === "PENDING") {
    return 25;
  }
  return 15;
}
