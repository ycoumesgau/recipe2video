import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { VideoStatus } from "@/modules/videos/video-status";

import {
  generateAllMissingReferencesAction,
  markReferencesReadyAction,
  uploadManualReferenceAction,
} from "../actions";
import type {
  ReferenceAssetReviewItem,
  ReferenceReviewData,
  SegmentReferenceReadiness,
} from "../reference.types";
import type { ReferenceStatus } from "../reference-status";
import { ReferenceSectionGrid } from "./reference-section-grid";

/**
 * Statuses that mean "this card is asking GPT-Image 2 to (re)produce the
 * image". When in either of these states the operator cannot click
 * Generate / Regenerate again — the per-reference Inngest worker is
 * already running. Must mirror the filter on the server-side action.
 */
const PENDING_GENERATION_STATUSES: ReferenceStatus[] = ["planned", "failed"];

export function ReferenceReviewWorkflow({
  data,
  notice,
  projectStatus,
  videoId,
}: {
  data: ReferenceReviewData;
  notice?: { type: "success" | "error"; message: string } | null;
  projectStatus?: VideoStatus | null;
  videoId: string;
}) {
  const pendingRecipeReferenceCount = data.recipeReferences.filter(
    (item) =>
      Boolean(item.reference.prompt) &&
      PENDING_GENERATION_STATUSES.includes(item.reference.status),
  ).length;

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert variant={notice.type === "error" ? "destructive" : "default"}>
          {notice.type === "error" ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          <AlertTitle>
            {notice.type === "error" ? "Reference action failed" : "Reference updated"}
          </AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
        <div className="space-y-4">
          {data.missingReferences.length > 0 ? (
            <ReferenceSection
              description="References that still need to be approved, generated, or uploaded to Runway before the next Seedance generation."
              emptyCopy="No outstanding references."
              items={data.missingReferences}
              title="Missing references"
              titleVariant="warning"
              videoId={videoId}
            />
          ) : null}
          <ReferenceSection
            emptyCopy="Global kitchen, mascot, expression, pose, and utensil references will appear here once seeded."
            items={data.globalReferences}
            title="Global references"
            videoId={videoId}
          />
          <ReferenceSection
            emptyCopy="Upload recipe-specific raw, baked, filled, cut, glazed, or final states for this project."
            items={data.recipeReferences}
            title="Recipe-specific references"
            videoId={videoId}
          />
          <ReferenceSection
            emptyCopy="Rejected references remain visible for audit and can be planned again."
            items={data.rejectedReferences}
            title="Rejected references"
            videoId={videoId}
          />
        </div>

        <div className="space-y-4">
          <BulkGenerateCard
            pendingCount={pendingRecipeReferenceCount}
            videoId={videoId}
          />
          <ContinueToSegmentsCard
            projectStatus={projectStatus}
            readiness={data.segmentReadiness}
            videoId={videoId}
          />
          <ManualReferenceUploadCard videoId={videoId} />
          <SegmentReadinessCard readiness={data.segmentReadiness} />
        </div>
      </div>
    </div>
  );
}

/**
 * Top-right card that kicks GPT-Image 2 for every recipe-specific
 * reference whose status is `planned` or `failed`. Independent from the
 * "Mark references ready" button so the operator can iterate on anchors
 * before flipping the project status.
 */
function BulkGenerateCard({
  pendingCount,
  videoId,
}: {
  pendingCount: number;
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          Generate recipe-specific anchors
        </CardTitle>
        <CardDescription>
          Runs GPT-Image 2 on every recipe-specific reference that has a
          prompt and is still `planned` or `failed`. Project status is NOT
          changed — use this freely while iterating on anchors.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form action={generateAllMissingReferencesAction}>
          <input name="videoId" type="hidden" value={videoId} />
          <Button disabled={pendingCount === 0} type="submit">
            <Sparkles className="h-4 w-4" />
            {pendingCount === 0
              ? "Nothing to generate"
              : `Generate ${pendingCount} pending reference${pendingCount === 1 ? "" : "s"}`}
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Each anchor is generated as a vertical 9:16 still grounded on the
          library globals declared in its conditioning list. Approve and
          upload to Runway from the card once you are happy with the result.
        </p>
      </CardContent>
    </Card>
  );
}

function ContinueToSegmentsCard({
  projectStatus,
  readiness,
  videoId,
}: {
  projectStatus: VideoStatus | null | undefined;
  readiness: SegmentReferenceReadiness[];
  videoId: string;
}) {
  // The card is the ONLY entry point that flips a project from
  // `storyboard_approved` to `references_ready`. Without it, projects
  // whose references are all library globals (so there's nothing to
  // approve / upload manually) silently get stuck on this page forever.
  const blockingSegments = readiness.filter(
    (segment) =>
      segment.exceedsReferenceLimit ||
      segment.missingApprovedReferences.length > 0 ||
      segment.missingRunwayUploads.length > 0,
  );

  if (
    projectStatus === "references_ready" ||
    projectStatus === "generating" ||
    projectStatus === "review" ||
    projectStatus === "assembling" ||
    projectStatus === "exported"
  ) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            References ready
          </CardTitle>
          <CardDescription>
            This checkpoint is already validated. Move on to the segments tab
            to generate or review variants.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (projectStatus !== "storyboard_approved") {
    return null;
  }

  const isBlocked = blockingSegments.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Continue to segments</CardTitle>
        <CardDescription>
          {isBlocked
            ? "Resolve the blocking segments below before marking references ready."
            : "All segments resolve their references. Mark them ready to unlock Seedance generation."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isBlocked ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>
              {blockingSegments.length} segment
              {blockingSegments.length === 1 ? "" : "s"} still blocked
            </AlertTitle>
            <AlertDescription>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-xs">
                {blockingSegments.slice(0, 5).map((segment) => (
                  <li key={segment.segmentId}>
                    <span className="font-medium">{segment.segmentTitle}</span>:{" "}
                    {[
                      segment.exceedsReferenceLimit
                        ? "exceeds 9 references"
                        : null,
                      segment.missingApprovedReferences.length > 0
                        ? `missing approval — ${segment.missingApprovedReferences.join(", ")}`
                        : null,
                      segment.missingRunwayUploads.length > 0
                        ? `missing Runway upload — ${segment.missingRunwayUploads.join(", ")}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join("; ")}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        ) : null}
        <form action={markReferencesReadyAction}>
          <input name="videoId" type="hidden" value={videoId} />
          <Button disabled={isBlocked} type="submit">
            <ArrowRight className="h-4 w-4" />
            Mark references ready
          </Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Auto-generates any planned recipe reference that still has a prompt,
          then flips the project to `references_ready`. Use the bulk
          Generate button above to iterate on anchors without committing.
        </p>
      </CardContent>
    </Card>
  );
}

function ReferenceSection({
  description,
  emptyCopy,
  items,
  title,
  titleVariant,
  videoId,
}: {
  description?: string;
  emptyCopy: string;
  items: ReferenceAssetReviewItem[];
  title: string;
  titleVariant?: "warning";
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {titleVariant === "warning" ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : null}
          {title}
        </CardTitle>
        <CardDescription>
          {description ??
            "Cards show storage status, Runway upload status, and segment usage."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            {emptyCopy}
          </div>
        ) : (
          <ReferenceSectionGrid items={items} videoId={videoId} />
        )}
      </CardContent>
    </Card>
  );
}


function ManualReferenceUploadCard({ videoId }: { videoId: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload manual reference</CardTitle>
        <CardDescription>
          Stores the original image in Supabase Storage before any Runway upload.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={uploadManualReferenceAction} className="space-y-4">
          <input name="videoId" type="hidden" value={videoId} />
          <div className="space-y-2">
            <Label htmlFor="canonicalName">Reference name</Label>
            <Input
              id="canonicalName"
              name="canonicalName"
              placeholder="Baked choux crown"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role">Role in prompts</Label>
            <Input
              id="role"
              name="role"
              placeholder="recipe final state"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prompt">Optional generation prompt notes</Label>
            <Textarea
              id="prompt"
              name="prompt"
              placeholder="What this reference should preserve for Seedance."
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="file">Reference image</Label>
            <Input
              accept="image/jpeg,image/png,image/webp"
              id="file"
              name="file"
              required
              type="file"
            />
          </div>
          <Button type="submit">
            <Upload className="h-4 w-4" />
            Upload reference
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function SegmentReadinessCard({
  readiness,
}: {
  readiness: SegmentReferenceReadiness[];
}) {
  const blockedCount = readiness.filter(
    (segment) =>
      segment.exceedsReferenceLimit ||
      segment.missingApprovedReferences.length > 0 ||
      segment.missingRunwayUploads.length > 0,
  ).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Segment readiness</CardTitle>
        <CardDescription>
          Checks Seedance reference inputs before generation. The count maps to
          `promptImage + references[]` and must stay within the 9 image limit.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {readiness.length === 0 ? (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>No Seedance segments yet</AlertTitle>
            <AlertDescription>
              Segment readiness appears after storyboard segmentation creates
              references.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <Alert variant={blockedCount > 0 ? "destructive" : "default"}>
              {blockedCount > 0 ? (
                <AlertTriangle className="h-4 w-4" />
              ) : (
                <CheckCircle2 className="h-4 w-4" />
              )}
              <AlertTitle>
                {blockedCount > 0
                  ? `${blockedCount} segment${blockedCount === 1 ? "" : "s"} blocked`
                  : "All segments have reference coverage"}
              </AlertTitle>
              <AlertDescription>
                Seedance References mode uses the first uploaded image as
                `promptImage` and the remaining images as `references[]`.
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead>Seedance inputs</TableHead>
                  <TableHead>Missing</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {readiness.map((segment) => (
                  <TableRow key={segment.segmentId}>
                    <TableCell>
                      <p className="font-medium">{segment.segmentTitle}</p>
                      {segment.exceedsReferenceLimit ? (
                        <p className="text-xs text-destructive">
                          Exceeds 9 references
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell>{segment.referenceCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatMissing(segment)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatMissing(segment: SegmentReferenceReadiness) {
  const missing = [
    ...segment.missingApprovedReferences.map((item) => `${item} approval`),
    ...segment.missingRunwayUploads.map((item) => `${item} Runway URI`),
  ];

  return missing.length > 0 ? missing.join(", ") : "Ready";
}
