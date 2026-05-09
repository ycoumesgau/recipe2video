import Link from "next/link";
import { AlertTriangle } from "lucide-react";

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { loadProjectCostDashboardData } from "@/modules/costs/load-cost-dashboard-data";
import { CostDashboard } from "@/modules/costs/ui/cost-dashboard";
import { StoryboardReview } from "@/modules/storyboard/ui/storyboard-review";
import { getStoryboardReviewData } from "@/modules/storyboard/use-cases/load-storyboard-fixture";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const {
    project,
    costData,
    dataError,
    logicalScenes,
    seedanceSegments,
    storyboardError,
  } = await loadProject(videoId);

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Project {project?.status ?? videoId}
        </Badge>
        <h2 className="text-3xl font-semibold tracking-tight">
          {project?.title ?? "Project overview"}
        </h2>
        <p className="text-muted-foreground">
          This cockpit reserves the structure for storyboard, references,
          segments, assembly, costs, and logs.
        </p>
      </div>

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="storyboard">Storyboard</TabsTrigger>
          <TabsTrigger value="references">References</TabsTrigger>
          <TabsTrigger value="segments">Segments</TabsTrigger>
          <TabsTrigger value="assembly">Assembly</TabsTrigger>
          <TabsTrigger value="costs">Costs and Logs</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Next required action</CardTitle>
              <CardDescription>
                The draft is ready for recipe ingest once the planning workflow
                is connected.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {project ? (
                <div className="grid gap-3 md:grid-cols-2">
                  <OverviewItem label="Status" value={project.status} />
                  <OverviewItem
                    label="Video model"
                    value={project.selectedVideoModel}
                  />
                  <OverviewItem
                    label="Image model"
                    value={project.selectedImageModel}
                  />
                  <OverviewItem
                    label="TTS model"
                    value={project.selectedTtsModel}
                  />
                  <OverviewItem
                    label="SFX model"
                    value={project.selectedSfxModel}
                  />
                  <OverviewItem
                    label="Runway credits used"
                    value={String(project.totalCostCredits)}
                  />
                </div>
              ) : (
                <p className="text-muted-foreground">
                  No project data is loaded yet.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline">
                  <Link href="/">Back to dashboard</Link>
                </Button>
                <Button disabled>Recipe ingest pending</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="storyboard">
          <StoryboardReview
            dataError={storyboardError}
            logicalScenes={logicalScenes}
            project={project}
            seedanceSegments={seedanceSegments}
          />
        </TabsContent>
        <TabsContent value="references">
          <Card>
            <CardHeader>
              <CardTitle>Reference checkpoint</CardTitle>
              <CardDescription>
                Review global and recipe-specific references before any Seedance
                generation is launched.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Approvals require a stored Supabase reference image. Runway
                uploads are explicit so the selected model and media source stay
                visible.
              </p>
              <Button asChild>
                <Link href={`/videos/${videoId}/references`}>
                  Open references
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="segments">
          <Card>
            <CardHeader>
              <CardTitle>Segment review</CardTitle>
              <CardDescription>
                Open a Seedance segment to compare variants, play Mux review
                copies, submit feedback, and approve prompt diffs before
                regeneration.
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
                          <Link
                            href={`/videos/${videoId}/segments/${segment.id}`}
                          >
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
        </TabsContent>
        <TabsContent value="assembly">
          <Card>
            <CardHeader>
              <CardTitle>Assembly and Suno music</CardTitle>
              <CardDescription>
                Generate the manual Suno prompt, upload audio, preview accepted
                Supabase originals in Remotion, and preserve final exports.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                Remotion assembly uses Supabase Storage originals for preview
                and export handoff. Uploaded Suno audio is stored as a
                `suno_audio` media asset. Mux is only used after the final MP4
                is stored for playback.
              </p>
              <Button asChild>
                <Link href={`/videos/${videoId}/assembly`}>Open assembly</Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="costs">
          <CostDashboard data={costData} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

async function loadProject(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const project = await getVideoProjectById(supabase, videoId);
    const [{ logicalScenes, seedanceSegments }, costData] = await Promise.all([
      getStoryboardReviewData(videoId),
      loadProjectCostDashboardData(videoId),
    ]);

    return {
      project,
      costData,
      dataError: null,
      logicalScenes,
      seedanceSegments,
      storyboardError: null,
    };
  } catch (error) {
    return {
      project: null,
      costData: await loadProjectCostDashboardData(videoId),
      logicalScenes: [],
      seedanceSegments: [],
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load project data.",
      storyboardError:
        error instanceof Error
          ? error.message
          : "Unable to load storyboard data.",
    };
  }
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
