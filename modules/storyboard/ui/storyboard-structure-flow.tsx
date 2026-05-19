"use client";

import { ArrowDown } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { listLogicalScenesForSegment } from "../services/resolve-logical-scene-ids";
import type { LogicalScene, SeedanceSegment } from "../storyboard.types";
import { SceneDetailTrigger } from "./scene-detail-trigger";

export function StoryboardStructureFlow({
  logicalScenes,
  seedanceSegments,
}: {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  const orderedSegments = [...seedanceSegments].sort(
    (left, right) => left.position - right.position,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Structure</CardTitle>
        <CardDescription>
          Segment-by-segment flow of logical scenes. Hover a scene on desktop or
          tap it on touch devices to see full scene details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mx-auto flex max-w-3xl flex-col items-center">
          {orderedSegments.map((segment, index) => {
            const includedScenes = listLogicalScenesForSegment(
              segment,
              logicalScenes,
              seedanceSegments,
            );

            return (
              <div key={segment.id} className="flex w-full flex-col items-center">
                <SegmentStructureCard
                  includedScenes={includedScenes}
                  segment={segment}
                />
                {index < orderedSegments.length - 1 ? (
                  <StructureFlowConnector />
                ) : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function SegmentStructureCard({
  segment,
  includedScenes,
}: {
  segment: SeedanceSegment;
  includedScenes: LogicalScene[];
}) {
  return (
    <article className="w-full rounded-xl border bg-card shadow-sm">
      <div className="grid gap-4 p-4 sm:grid-cols-[minmax(5rem,7rem)_1fr] sm:gap-6 sm:p-5">
        <header className="space-y-1 border-b pb-3 sm:border-b-0 sm:border-r sm:pb-0 sm:pr-4">
          <p className="text-2xl font-semibold tracking-tight">
            S{segment.position}
          </p>
          <p className="text-sm font-medium leading-snug">{segment.title}</p>
          <p className="text-xs text-muted-foreground">{segment.arc}</p>
        </header>

        <ol className="space-y-2">
          {includedScenes.map((scene) => (
            <li key={scene.id} className="flex gap-3 text-sm">
              <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                {scene.position}
              </span>
              <SceneDetailTrigger scene={scene} className="min-w-0 flex-1">
                <span className="line-clamp-2 text-foreground">
                  {scene.description}
                </span>
              </SceneDetailTrigger>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

function StructureFlowConnector() {
  return (
    <div
      aria-hidden
      className="flex flex-col items-center py-2 text-muted-foreground"
    >
      <ArrowDown className="h-5 w-5" strokeWidth={2} />
    </div>
  );
}
