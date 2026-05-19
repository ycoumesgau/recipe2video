import {
  AlertTriangle,
  CheckCircle2,
  Clapperboard,
  ListChecks,
  ListTree,
  Lock,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LicornKpiCard } from "@/components/ui/licorn-kpi-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { VIDEO_STATUS_LABELS } from "@/modules/videos/video-status";
import type { VideoProject } from "@/modules/videos/video.types";
import { RUNWAY_SEEDANCE2_CREDITS_PER_SECOND } from "@/modules/generation/runway.constants";

import {
  buildSegmentLabelByPersistedSceneId,
  listLogicalScenesForSegment,
} from "../services/resolve-logical-scene-ids";
import type { LogicalScene, SeedanceSegment } from "../storyboard.types";
import { StoryboardActions } from "./storyboard-actions";
import { StoryboardStructureFlow } from "./storyboard-structure-flow";

export function StoryboardReview({
  compactPageHeading = false,
  dataError,
  logicalScenes,
  project,
  seedanceSegments,
}: {
  /** When true, skip the main H2 and description (provided by the route page). */
  compactPageHeading?: boolean;
  dataError?: string | null;
  logicalScenes: LogicalScene[];
  project: VideoProject | null;
  seedanceSegments: SeedanceSegment[];
}) {
  const hasStoryboard = logicalScenes.length > 0 && seedanceSegments.length > 0;
  const isApproved = project?.status === "storyboard_approved";
  const totalDuration = seedanceSegments.reduce(
    (total, segment) => total + segment.durationTarget,
    0,
  );
  const totalEstimatedCredits = seedanceSegments.reduce(
    (total, segment) => total + estimateSeedanceCredits(segment.durationTarget),
    0,
  );

  if (!project) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Project unavailable</AlertTitle>
        <AlertDescription>
          Open an existing video project before reviewing a storyboard.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {compactPageHeading ? (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant={isApproved ? "default" : "outline"}>
            {VIDEO_STATUS_LABELS[project.status]}
          </Badge>
          <Badge variant="secondary">{project.selectedVideoModel}</Badge>
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Badge variant={isApproved ? "default" : "outline"}>
                {VIDEO_STATUS_LABELS[project.status]}
              </Badge>
              <Badge variant="secondary">{project.selectedVideoModel}</Badge>
            </div>
            <h2 className="licorn-page-title">
              Storyboard review
            </h2>
            <p className="max-w-3xl text-muted-foreground">
              Validate the editorial logical scenes separately from the Seedance
              generation segments before spending Runway credits.
            </p>
          </div>
        </div>
      )}

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Storyboard data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="Logical scenes" value={String(logicalScenes.length)} />
        <MetricCard label="Seedance segments" value={String(seedanceSegments.length)} />
        <MetricCard label="Planned duration" value={formatSeconds(totalDuration)} />
        <MetricCard label="Estimated credits" value={String(totalEstimatedCredits)} />
      </div>

      <Alert>
        <Lock className="h-4 w-4" />
        <AlertTitle>No generation before approval</AlertTitle>
        <AlertDescription>
          This screen exposes review, approval, and revision intent only. Segment
          generation is intentionally disabled in this issue.
        </AlertDescription>
      </Alert>

      {!hasStoryboard ? (
        <Card>
          <CardHeader>
            <CardTitle>Load a fixture storyboard</CardTitle>
            <CardDescription>
              Use the public-safe Paris-Brest fixture to demo the review and
              approval checkpoint without calling OpenAI or Runway.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StoryboardActions
              canApprove={false}
              canLoadFixture
              isApproved={false}
              videoId={project.id}
            />
          </CardContent>
        </Card>
      ) : (
        <>
          <StoryboardActions
            canApprove={hasStoryboard}
            canLoadFixture={false}
            isApproved={isApproved}
            videoId={project.id}
          />

          <Tabs defaultValue="structure">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="structure">
                <ListTree />
                Structure
              </TabsTrigger>
              <TabsTrigger value="logical-scenes">
                <ListChecks />
                Logical scenes
              </TabsTrigger>
              <TabsTrigger value="seedance-segments">
                <Clapperboard />
                Seedance segments
              </TabsTrigger>
            </TabsList>

            <TabsContent className="space-y-4" value="structure">
              <StoryboardStructureFlow
                logicalScenes={logicalScenes}
                seedanceSegments={seedanceSegments}
              />
            </TabsContent>

            <TabsContent className="space-y-4" value="logical-scenes">
              <LogicalScenesTable
                logicalScenes={logicalScenes}
                seedanceSegments={seedanceSegments}
              />
            </TabsContent>

            <TabsContent className="space-y-4" value="seedance-segments">
              <SeedanceSegmentCards
                logicalScenes={logicalScenes}
                seedanceSegments={seedanceSegments}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function LogicalScenesTable({
  logicalScenes,
  seedanceSegments,
}: {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  const segmentLabelBySceneId = buildSegmentLabelByPersistedSceneId(
    seedanceSegments,
    logicalScenes,
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logical scenes</CardTitle>
        <CardDescription>
          Editorial plan with scene type, arc, visual description, background,
          zoom, duration, and notes.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Segment</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Arc</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Background</TableHead>
              <TableHead>Zoom</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Note</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logicalScenes.map((scene) => (
              <TableRow key={scene.id}>
                <TableCell>{scene.position}</TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={cn(
                      scene.position % 2 === 0 &&
                        "border-border bg-muted hover:bg-muted",
                    )}
                  >
                    {segmentLabelBySceneId.get(scene.id) ?? "-"}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{scene.sceneType}</Badge>
                </TableCell>
                <TableCell className="min-w-36 whitespace-normal">
                  {scene.arc}
                </TableCell>
                <TableCell className="min-w-80 whitespace-normal">
                  {scene.description}
                </TableCell>
                <TableCell className="min-w-40 whitespace-normal">
                  {scene.bg ?? "-"}
                </TableCell>
                <TableCell className="min-w-36 whitespace-normal">
                  {scene.zoom ?? "-"}
                </TableCell>
                <TableCell>{formatSeconds(scene.durationTarget ?? 0)}</TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  {scene.note ?? "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function SeedanceSegmentCards({
  logicalScenes,
  seedanceSegments,
}: {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {seedanceSegments.map((segment) => {
        const includedScenes = listLogicalScenesForSegment(
          segment,
          logicalScenes,
          seedanceSegments,
        );

        return (
          <Card key={segment.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle>
                    S{segment.position}. {segment.title}
                  </CardTitle>
                  <CardDescription>{segment.arc}</CardDescription>
                </div>
                <Badge variant="outline">{segment.status}</Badge>
              </div>
            </CardHeader>
            <CardContent className="min-h-0 space-y-4">
              <div className="grid gap-3 text-sm md:grid-cols-3">
                <SegmentFact
                  label="Duration"
                  value={formatSeconds(segment.durationTarget)}
                />
                <SegmentFact
                  label="Estimated credits"
                  value={String(estimateSeedanceCredits(segment.durationTarget))}
                />
                <SegmentFact label="Mode" value={segment.mode} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">
                  Included logical scenes
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {includedScenes.map((scene) => (
                    <Badge key={scene.id} variant="secondary">
                      {scene.position}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Planned references</p>
                <div className="flex flex-wrap gap-1.5">
                  {segment.references.map((reference) => (
                    <Badge key={reference.id ?? reference.label} variant="outline">
                      @{reference.label}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="min-h-0 min-w-0 rounded-lg border bg-muted/30 p-3">
                <p className="mb-2 text-sm font-medium">Prompt preview</p>
                <div
                  className="max-h-36 min-h-0 min-w-0 overflow-y-auto overscroll-y-contain [-webkit-overflow-scrolling:touch] pr-1"
                  tabIndex={0}
                >
                  <p className="whitespace-pre-wrap break-words font-mono text-sm text-muted-foreground">
                    {segment.prompt}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                <QaBadge
                  checked={segment.qaChecklist.referencesWithinLimit}
                  label="<= 9 refs"
                />
                <QaBadge
                  checked={segment.qaChecklist.globalKitchenReferencePresent}
                  label="Kitchen ref"
                />
                <QaBadge
                  checked={segment.qaChecklist.hardCutsSpecified}
                  label="Hard cuts"
                />
                <QaBadge
                  checked={segment.qaChecklist.noSpeechVoiceoverOrMusic}
                  label="No speech/music"
                />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <LicornKpiCard label={label} value={value} />;
}

function SegmentFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function QaBadge({ checked, label }: { checked: boolean; label: string }) {
  return (
    <Badge variant={checked ? "secondary" : "destructive"}>
      {checked ? <CheckCircle2 /> : <AlertTriangle />}
      {label}
    </Badge>
  );
}

function estimateSeedanceCredits(durationSeconds: number) {
  return Math.ceil(durationSeconds * RUNWAY_SEEDANCE2_CREDITS_PER_SECOND);
}

function formatSeconds(seconds: number) {
  if (seconds <= 0) {
    return "-";
  }

  return `${Number(seconds.toFixed(1))}s`;
}

