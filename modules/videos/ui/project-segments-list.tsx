"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { AlertTriangle, PlayCircle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenerationRscSync } from "@/modules/generation/ui/generation-rsc-sync";
import { launchSelectedSegmentsAction } from "@/modules/generation/actions";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

export function ProjectSegmentsList({
  generationCountsByPosition,
  hasGeneratingRecipeReferences,
  seedanceSegments,
  videoId,
}: {
  generationCountsByPosition: Record<number, number>;
  hasGeneratingRecipeReferences: boolean;
  seedanceSegments: SeedanceSegment[];
  videoId: string;
}) {
  const selectableSegmentIds = useMemo(
    () =>
      seedanceSegments
        .filter((segment) => isBatchLaunchEligible(segment.status))
        .map((segment) => segment.id),
    [seedanceSegments],
  );
  const [selectedSegmentIds, setSelectedSegmentIds] = useState<string[]>(
    selectableSegmentIds,
  );
  const [launchConfirmOpen, setLaunchConfirmOpen] = useState(false);
  const launchFormRef = useRef<HTMLFormElement>(null);
  const selectableSet = new Set(selectableSegmentIds);
  const effectiveSelectedSegmentIds = selectedSegmentIds.filter((id) =>
    selectableSet.has(id),
  );
  const hasSelection = effectiveSelectedSegmentIds.length > 0;
  const allSelected =
    selectableSegmentIds.length > 0 &&
    effectiveSelectedSegmentIds.length === selectableSegmentIds.length;
  const hasActiveGeneration = seedanceSegments.some((segment) =>
    ["queued", "generating"].includes(segment.status),
  );
  const shouldPollRsc =
    hasActiveGeneration || hasGeneratingRecipeReferences;

  const selectedSet = new Set(effectiveSelectedSegmentIds);

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Seedance segments</CardTitle>
        <CardDescription>
          Open a Seedance segment to compare variants, play Mux review copies,
          submit feedback, and approve prompt diffs before regeneration. You
          can launch selected segments in batch when they are ready.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GenerationRscSync enabled={shouldPollRsc} />

        {seedanceSegments.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No Seedance segments are available yet. Load or generate a
            storyboard before reviewing variants.
          </div>
        ) : (
          <form
            ref={launchFormRef}
            action={launchSelectedSegmentsAction}
            className="space-y-4"
          >
            <input name="videoId" type="hidden" value={videoId} />

            <div className="hidden flex-wrap items-center justify-between gap-3 rounded-lg border p-3 md:flex">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={allSelected}
                  disabled={selectableSegmentIds.length === 0}
                  onChange={(event) => {
                    setSelectedSegmentIds(
                      event.target.checked ? selectableSegmentIds : [],
                    );
                  }}
                  type="checkbox"
                />
                Select all ready segments
              </label>
              <Button
                disabled={!hasSelection}
                onClick={() => setLaunchConfirmOpen(true)}
                size="sm"
                type="button"
              >
                <PlayCircle className="h-4 w-4" />
                Launch selected ({effectiveSelectedSegmentIds.length})
              </Button>
            </div>

            <BatchLaunchConfirmDialog
              onConfirm={() => {
                setLaunchConfirmOpen(false);
                launchFormRef.current?.requestSubmit();
              }}
              onOpenChange={setLaunchConfirmOpen}
              open={launchConfirmOpen}
              segmentCount={effectiveSelectedSegmentIds.length}
            />

            <div className="grid gap-4 md:grid-cols-2">
              {seedanceSegments.map((segment) => {
                const selectable = isBatchLaunchEligible(segment.status);
                const checked = selectedSet.has(segment.id);

                return (
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
                      <div className="grid gap-2 text-sm md:grid-cols-4">
                        <OverviewItem
                          label="Duration"
                          value={formatSeconds(segment.durationTarget)}
                        />
                        <OverviewItem
                          label="References"
                          value={String(segment.references.length)}
                        />
                        <OverviewItem
                          label="Variants"
                          value={String(
                            generationCountsByPosition[segment.position] ?? 0,
                          )}
                        />
                        <OverviewItem
                          label="Accepted"
                          value={segment.selectedGenerationId ? "yes" : "no"}
                        />
                      </div>

                      <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          checked={checked}
                          disabled={!selectable}
                          name="segmentIds"
                          onChange={(event) => {
                            const next = new Set(selectedSet);
                            if (event.target.checked) {
                              next.add(segment.id);
                            } else {
                              next.delete(segment.id);
                            }
                            setSelectedSegmentIds(Array.from(next));
                          }}
                          type="checkbox"
                          value={segment.id}
                        />
                        {selectable
                          ? "Include in batch launch"
                          : "Not launchable in current state"}
                      </label>

                      <Button asChild>
                        <Link href={`/videos/${videoId}/segments/${segment.id}`}>
                          Review segment
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 md:hidden">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
                <input
                  checked={allSelected}
                  disabled={selectableSegmentIds.length === 0}
                  onChange={(event) => {
                    setSelectedSegmentIds(
                      event.target.checked ? selectableSegmentIds : [],
                    );
                  }}
                  type="checkbox"
                />
                Select all ready segments
              </label>
              <Button
                disabled={!hasSelection}
                onClick={() => setLaunchConfirmOpen(true)}
                size="sm"
                type="button"
              >
                <PlayCircle className="h-4 w-4" />
                Launch selected ({effectiveSelectedSegmentIds.length})
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function BatchLaunchConfirmDialog({
  open,
  onOpenChange,
  segmentCount,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  segmentCount: number;
  onConfirm: () => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent showCloseButton>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Launch {segmentCount} Seedance segment
            {segmentCount === 1 ? "" : "s"}?
          </DialogTitle>
          <DialogDescription className="text-left">
            This queues a paid Runway generation for each selected segment.
            Accidental taps on mobile are costly — confirm only if you intend
            to launch all {segmentCount} segment
            {segmentCount === 1 ? "" : "s"} now.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button onClick={onConfirm} type="button">
            <PlayCircle className="h-4 w-4" />
            Yes, launch {segmentCount} segment{segmentCount === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function isBatchLaunchEligible(status: SeedanceSegment["status"]) {
  return ["ready", "review", "rejected", "failed", "accepted"].includes(status);
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
