import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  Diff,
  Film,
  FlaskConical,
  Images,
  ListChecks,
  Music,
  PlayCircle,
} from "lucide-react";

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
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  getParisBrestDemoFixture,
  type DemoReference,
  type DemoSegmentGeneration,
} from "@/modules/demo/paris-brest-demo.fixture";
import type { CostLog } from "@/modules/costs/cost.types";
import type { PromptDiff } from "@/modules/feedback/feedback.types";
import type {
  LogicalScene,
  SeedanceSegment,
} from "@/modules/storyboard/storyboard.types";

export default function DemoModePage() {
  const fixture = getParisBrestDemoFixture();
  const acceptedSegments = fixture.seedanceSegments.filter(
    (segment) => segment.status === "accepted",
  ).length;
  const totalCredits = fixture.costLogs.reduce(
    (total, log) => total + (log.creditsUsed ?? 0),
    0,
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge variant="outline">Issue #19</Badge>
            <Badge variant="secondary">Fixture-backed</Badge>
            <Badge variant="outline">No live generation required</Badge>
          </div>
          <h2 className="licorn-page-title">Demo Mode</h2>
          <p className="max-w-3xl text-muted-foreground">
            Walk through the Paris-Brest project with storyboard, references,
            segment review, prompt diff, costs, and assembly preview without
            depending on active Runway generation.
          </p>
        </div>
      </section>

      <Alert>
        <FlaskConical className="h-4 w-4" />
        <AlertTitle>Demo mode is a backup path, not a fake live flow.</AlertTitle>
        <AlertDescription>
          Fixture clips and public-safe metadata are labeled as demo assets. The
          production contract still requires authenticated users, visible model
          selection, Supabase Storage originals, and Mux playback copies for real
          generated media.
        </AlertDescription>
      </Alert>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Project status" value={fixture.project.status} />
        <MetricCard
          label="Storyboard"
          value={`${fixture.logicalScenes.length} scenes`}
        />
        <MetricCard
          label="Segments"
          value={`${acceptedSegments}/${fixture.seedanceSegments.length} accepted`}
        />
        <MetricCard label="Fixture credits" value={`${totalCredits} cr`} />
      </section>

      <Tabs defaultValue="storyboard">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="storyboard">
            <ListChecks />
            Storyboard
          </TabsTrigger>
          <TabsTrigger value="references">
            <Images />
            References
          </TabsTrigger>
          <TabsTrigger value="segments">
            <PlayCircle />
            Segment review
          </TabsTrigger>
          <TabsTrigger value="diff">
            <Diff />
            Prompt diff
          </TabsTrigger>
          <TabsTrigger value="costs">
            <CircleDollarSign />
            Costs
          </TabsTrigger>
          <TabsTrigger value="assembly">
            <Film />
            Assembly
          </TabsTrigger>
        </TabsList>

        <TabsContent className="space-y-4" value="storyboard">
          <StoryboardSection
            logicalScenes={fixture.logicalScenes}
            seedanceSegments={fixture.seedanceSegments}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="references">
          <ReferencesSection references={fixture.references} />
        </TabsContent>

        <TabsContent className="space-y-4" value="segments">
          <SegmentReviewSection generations={fixture.generations} />
        </TabsContent>

        <TabsContent className="space-y-4" value="diff">
          <PromptDiffSection
            diff={fixture.promptDiff.diff}
            feedbackMessage={fixture.promptDiff.feedbackMessage}
            promptAfter={fixture.promptDiff.promptAfter}
            promptBefore={fixture.promptDiff.promptBefore}
          />
        </TabsContent>

        <TabsContent className="space-y-4" value="costs">
          <CostsSection costLogs={fixture.costLogs} />
        </TabsContent>

        <TabsContent className="space-y-4" value="assembly">
          <AssemblySection
            finalPreviewUrl={fixture.assembly.finalPreviewUrl}
            selectedSegmentIds={fixture.assembly.selectedSegmentIds}
            seedanceSegments={fixture.seedanceSegments}
            storagePlan={fixture.assembly.storagePlan}
            sunoPrompt={fixture.sunoPrompt}
            totalDurationSeconds={fixture.assembly.totalDurationSeconds}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StoryboardSection({
  logicalScenes,
  seedanceSegments,
}: {
  logicalScenes: LogicalScene[];
  seedanceSegments: SeedanceSegment[];
}) {
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clapperboard className="h-5 w-5" />
            Seedance segment plan
          </CardTitle>
          <CardDescription>
            Logical scenes remain editorial; Seedance segments are the generation
            units with selected model, timing, references, and prompt preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 xl:grid-cols-2">
          {seedanceSegments.map((segment) => (
            <Card key={segment.id} size="sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      S{segment.position}. {segment.title}
                    </CardTitle>
                    <CardDescription>{segment.arc}</CardDescription>
                  </div>
                  <Badge variant={segment.status === "accepted" ? "secondary" : "outline"}>
                    {segment.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-3">
                  <Fact label="Model" value="seedance2" />
                  <Fact label="Mode" value={segment.mode} />
                  <Fact label="Duration" value={`${segment.durationTarget}s`} />
                </div>
                <div>
                  <p className="mb-2 font-medium">Logical scenes</p>
                  <div className="flex flex-wrap gap-1.5">
                    {segment.logicalSceneIds.map((sceneId) => (
                      <Badge key={sceneId} variant="secondary">
                        {sceneId.replace("demo-scene-", "")}
                      </Badge>
                    ))}
                  </div>
                </div>
                <p className="line-clamp-5 whitespace-pre-wrap text-muted-foreground">
                  {segment.prompt}
                </p>
              </CardContent>
            </Card>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logical scene storyboard</CardTitle>
          <CardDescription>
            The fixture keeps 30 public-safe editorial scenes with texture
            cadence and final hero payoff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Arc</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Note</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logicalScenes.map((scene) => (
                <TableRow key={scene.id}>
                  <TableCell>{scene.position}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{scene.sceneType}</Badge>
                  </TableCell>
                  <TableCell className="min-w-40">{scene.arc}</TableCell>
                  <TableCell className="min-w-96 whitespace-normal">
                    {scene.description}
                  </TableCell>
                  <TableCell className="min-w-60 whitespace-normal">
                    {scene.note}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function ReferencesSection({ references }: { references: DemoReference[] }) {
  const readyCount = references.filter(
    (reference) => reference.status === "uploaded_to_runway",
  ).length;

  return (
    <>
      <Alert variant={readyCount === references.length ? "default" : "destructive"}>
        {readyCount === references.length ? (
          <CheckCircle2 className="h-4 w-4" />
        ) : (
          <AlertTriangle className="h-4 w-4" />
        )}
        <AlertTitle>
          {readyCount}/{references.length} references have Runway URIs
        </AlertTitle>
        <AlertDescription>
          Demo mode still shows missing upload status instead of hiding readiness
          gaps.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {references.map((reference) => (
          <Card key={reference.id}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt={reference.canonicalName}
              className="mx-3 h-40 rounded-lg object-cover"
              src={reference.previewUrl}
            />
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>{reference.canonicalName}</CardTitle>
                  <CardDescription>{reference.role}</CardDescription>
                </div>
                <Badge
                  variant={
                    reference.status === "uploaded_to_runway"
                      ? "secondary"
                      : "outline"
                  }
                >
                  {reference.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Fact label="Storage" value={reference.storageBucket} />
              <Fact label="Path" value={reference.storagePath} />
              <div>
                <p className="mb-2 font-medium">Used in segments</p>
                <div className="flex flex-wrap gap-1.5">
                  {reference.usedInSegments.map((segment) => (
                    <Badge key={segment} variant="outline">
                      {segment}
                    </Badge>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

function SegmentReviewSection({
  generations,
}: {
  generations: DemoSegmentGeneration[];
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      {generations.map((generation) => (
        <Card key={generation.id}>
          <div className="mx-3 overflow-hidden rounded-lg border bg-black">
            <video
              className="aspect-[9/16] h-80 w-full object-cover"
              controls
              muted
              playsInline
              preload="metadata"
            >
              <source src={generation.clipUrl} type="video/mp4" />
            </video>
          </div>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>{generation.title}</CardTitle>
                <CardDescription>{generation.id}</CardDescription>
              </div>
              <Badge variant={generation.selected ? "secondary" : "outline"}>
                {generation.selected ? "selected" : generation.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid gap-2 sm:grid-cols-2">
              <Fact label="Model" value={generation.model} />
              <Fact label="Credits" value={`${generation.costCredits ?? 0} cr`} />
              <Fact label="Media status" value={generation.mediaAsset.status} />
              <Fact
                label="Storage bucket"
                value={generation.mediaAsset.storageBucket ?? "-"}
              />
            </div>
            <Progress value={generation.selected ? 100 : 70} />
            <p className="text-muted-foreground">
              Fixture playback is local to demo mode. Real outputs must be
              stored in Supabase Storage and uploaded to Mux for review.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function PromptDiffSection({
  diff,
  feedbackMessage,
  promptAfter,
  promptBefore,
}: {
  diff: PromptDiff;
  feedbackMessage: string;
  promptAfter: string;
  promptBefore: string;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Card>
        <CardHeader>
          <CardTitle>Feedback and prompt proposal</CardTitle>
          <CardDescription>
            Prompt changes stay visible before any regeneration request.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Fact label="User feedback" value={feedbackMessage} />
          <Fact label="Prompt before" value={promptBefore} />
          <Fact label="Prompt after" value={promptAfter} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diff</CardTitle>
          <CardDescription>
            This fixture mirrors the `scene_feedbacks.diff` contract.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {diff.lines.map((line, index) => (
            <div
              className={`rounded-md border p-3 text-sm ${
                line.type === "added"
                  ? "border-emerald-500/30 bg-emerald-500/10"
                  : line.type === "removed"
                    ? "border-destructive/30 bg-destructive/10"
                    : "bg-muted/30"
              }`}
              key={`${line.type}-${index}`}
            >
              <span className="mr-2 font-mono">
                {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
              </span>
              {line.text}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function CostsSection({ costLogs }: { costLogs: CostLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Fixture cost logs</CardTitle>
        <CardDescription>
          Costs are sample records for the demo path and remain append-only in
          the real data contract.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Model</TableHead>
              <TableHead>Operation</TableHead>
              <TableHead>Credits</TableHead>
              <TableHead>USD</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {costLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell>{log.provider}</TableCell>
                <TableCell>{log.model}</TableCell>
                <TableCell>{log.operation}</TableCell>
                <TableCell>{log.creditsUsed ?? "-"}</TableCell>
                <TableCell>
                  {log.costDollars == null ? "-" : `$${log.costDollars.toFixed(2)}`}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function AssemblySection({
  finalPreviewUrl,
  seedanceSegments,
  selectedSegmentIds,
  storagePlan,
  sunoPrompt,
  totalDurationSeconds,
}: {
  finalPreviewUrl: string;
  seedanceSegments: SeedanceSegment[];
  selectedSegmentIds: string[];
  storagePlan: string;
  sunoPrompt: string;
  totalDurationSeconds: number;
}) {
  const selectedSegments = seedanceSegments.filter((segment) =>
    selectedSegmentIds.includes(segment.id),
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
      <Card>
        <CardHeader>
          <CardTitle>Assembly preview</CardTitle>
          <CardDescription>{storagePlan}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="overflow-hidden rounded-lg border bg-black">
            <video
              className="aspect-[9/16] max-h-[520px] w-full object-cover"
              controls
              muted
              playsInline
              preload="metadata"
            >
              <source src={finalPreviewUrl} type="video/mp4" />
            </video>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <Fact label="Selected segments" value={String(selectedSegments.length)} />
            <Fact label="Preview duration" value={`${totalDurationSeconds}s`} />
            <Fact label="Audio" value="Suno prompt ready" />
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Selected segment order</CardTitle>
            <CardDescription>
              Demo ordering is fixed; the real assembly screen owns drag and
              drop controls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {selectedSegments.map((segment, index) => (
              <div
                className="flex items-center justify-between rounded-lg border p-3 text-sm"
                key={segment.id}
              >
                <span>
                  {index + 1}. {segment.title}
                </span>
                <Badge variant="secondary">{segment.durationTarget}s</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Music className="h-5 w-5" />
              Suno prompt
            </CardTitle>
            <CardDescription>
              Suno remains a manual workflow. No unsupported API call is exposed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-sm">
              {sunoPrompt}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <LicornKpiCard label={label} value={value} />;
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}
