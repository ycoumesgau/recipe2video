import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ImageIcon,
  Sparkles,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
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
import { Progress } from "@/components/ui/progress";
import type { VideoStatus } from "@/modules/videos/video-status";

import {
  approveReferenceAction,
  generateAllMissingReferencesAction,
  generateReferenceImageAction,
  markReferencesReadyAction,
  rejectReferenceAction,
  updateReferenceConditioningAction,
  updateReferencePromptAction,
  uploadManualReferenceAction,
  uploadReferenceToRunwayAction,
} from "../actions";
import type {
  ConditioningAnchorPreview,
  ReferenceAssetReviewItem,
  ReferenceReviewData,
  SegmentReferenceReadiness,
} from "../reference.types";
import type { ReferenceStatus } from "../reference-status";

const statusBadgeVariant: Record<
  ReferenceStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  planned: "outline",
  generating: "default",
  generated: "secondary",
  approved: "default",
  rejected: "destructive",
  uploaded_to_runway: "secondary",
  failed: "destructive",
  cancelled: "outline",
};

/**
 * Statuses that mean "this card is asking GPT-Image 2 to (re)produce the
 * image". When in either of these states the operator cannot click
 * Generate / Regenerate again — the per-reference Inngest worker is
 * already running. Must mirror the filter on the server-side action.
 */
const PENDING_GENERATION_STATUSES: ReferenceStatus[] = [
  "planned",
  "failed",
  "cancelled",
];

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
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((item) => (
              <ReferenceCard key={item.reference.id} item={item} videoId={videoId} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReferenceCard({
  item,
  videoId,
}: {
  item: ReferenceAssetReviewItem;
  videoId: string;
}) {
  const { mediaAsset, reference } = item;
  // Library globals are owned by the dedicated /library admin page. On this
  // per-video page we render them as a read-only card so users can confirm
  // what the storyboard pulls in, but we suppress every mutation: approving
  // or rejecting from here would silently change the library for every
  // future recipe.
  const isReadOnly = item.isLibraryGlobal === true;
  const hasImage = Boolean(item.previewUrl);
  const isPendingGeneration = PENDING_GENERATION_STATUSES.includes(
    reference.status,
  );
  const isGenerating = reference.status === "generating";

  return (
    <Card size="sm">
      {item.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={reference.canonicalName}
          className="mx-3 h-40 rounded-lg object-cover"
          src={item.previewUrl}
        />
      ) : (
        <div className="mx-3 flex h-40 items-center justify-center rounded-lg border border-dashed bg-muted/40">
          <ImageIcon className="h-8 w-8 text-muted-foreground" />
        </div>
      )}
      <CardHeader>
        <CardAction className="flex items-center gap-2">
          {isReadOnly ? (
            <Badge variant="outline">Library · read-only</Badge>
          ) : null}
          <Badge variant={statusBadgeVariant[reference.status]}>
            {reference.status}
          </Badge>
        </CardAction>
        <CardTitle className="pr-28">{reference.canonicalName}</CardTitle>
        <CardDescription>{reference.type}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Metric
            label="Storage"
            value={
              mediaAsset?.storagePath ? mediaAsset.status : "missing storage"
            }
          />
          <Metric
            label="Runway"
            value={
              isReadOnly
                ? "signed URL just-in-time"
                : reference.runwayUri
                  ? "runway URI stored"
                  : "not uploaded"
            }
          />
        </div>

        {isGenerating ? (
          <div className="space-y-1 rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium">Runway progress</p>
            <Progress
              value={progressForRecipeReferenceCard(
                reference.runwayProgress ?? null,
                reference.runwayTaskStatus ?? null,
              )}
            />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>{reference.runwayTaskStatus ?? "starting"}</span>
              {typeof reference.runwayProgress === "number" ? (
                <span>{reference.runwayProgress.toFixed(0)}%</span>
              ) : (
                <span>queued / running</span>
              )}
            </div>
          </div>
        ) : null}

        {item.usedInSegments.length > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Used in segments</p>
            <p className="mt-1 text-muted-foreground">
              {item.usedInSegments.join(", ")}
            </p>
          </div>
        ) : null}

        {isReadOnly ? (
          <div className="rounded-lg border border-dashed bg-background/60 p-3 text-xs text-muted-foreground">
            Managed by the global asset library. Use the{" "}
            <span className="font-medium text-foreground">/library</span>{" "}
            admin page to update this reference, or change the storyboard if
            you want this video to pick a different one.
          </div>
        ) : (
          <>
            <ConditioningPanel
              anchors={item.conditioningAnchors ?? []}
              excluded={item.conditioningExcluded ?? []}
              unresolved={item.conditioningUnresolved ?? []}
              reference={reference}
              videoId={videoId}
            />
            <details className="rounded-lg border bg-background/60 p-3 text-xs">
              <summary className="cursor-pointer font-medium">
                Prompt {reference.prompt ? "(edit)" : "(missing — set to enable agent regeneration)"}
              </summary>
              <p className="mt-2 text-muted-foreground">
                {reference.prompt ?? "No prompt set yet."}
              </p>
              <form
                action={updateReferencePromptAction}
                className="mt-3 space-y-2"
              >
                <input name="videoId" type="hidden" value={videoId} />
                <input name="referenceId" type="hidden" value={reference.id} />
                <Textarea
                  defaultValue={reference.prompt ?? ""}
                  name="prompt"
                  placeholder="Describe what this reference must preserve in the Seedance prompt."
                  rows={3}
                />
                <Button size="sm" type="submit" variant="outline">
                  Save prompt
                </Button>
              </form>
            </details>
          </>
        )}

        {isReadOnly ? null : (
          <div className="flex flex-wrap gap-2">
            {/*
              Generation flow:
                - When the card has no image yet (or the last try failed),
                  surface "Generate image" prominently — this is the new
                  primary action that actually calls GPT-Image 2.
                - When an image exists, the same call is rendered as
                  "Regenerate (new image)" so the operator knows clicking
                  it overwrites the current preview AND clears the Runway
                  URI (forcing a re-approve + re-upload before Seedance).
                - We disable the button while a generation is already in
                  flight to prevent a duplicate Runway charge from a
                  double-click.
            */}
            <ReferenceActionButton
              action={generateReferenceImageAction}
              disabled={isGenerating || !reference.prompt}
              icon={<Sparkles className="h-4 w-4" />}
              label={
                isGenerating
                  ? "Generating…"
                  : hasImage
                    ? "Regenerate (new image)"
                    : "Generate image"
              }
              referenceId={reference.id}
              videoId={videoId}
            />
            <ReferenceActionButton
              action={approveReferenceAction}
              disabled={!hasImage || reference.status === "approved"}
              label="Approve"
              referenceId={reference.id}
              variant="outline"
              videoId={videoId}
            />
            <ReferenceActionButton
              action={rejectReferenceAction}
              disabled={reference.status === "rejected"}
              label="Reject"
              referenceId={reference.id}
              variant="outline"
              videoId={videoId}
            />
            <ReferenceActionButton
              action={uploadReferenceToRunwayAction}
              disabled={!mediaAsset?.storagePath || isPendingGeneration}
              icon={<Upload className="h-4 w-4" />}
              label="Upload to Runway"
              referenceId={reference.id}
              variant="outline"
              videoId={videoId}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Surface the conditioning anchors (library globals that GPT-Image 2 will
 * consume as `referenceImages[]`) so the operator can audit them before
 * clicking Generate. Includes an inline editor: paste a comma-separated
 * list of canonical names or @-handles to override the agent's plan.
 */
function ConditioningPanel({
  anchors,
  excluded,
  reference,
  unresolved,
  videoId,
}: {
  anchors: ConditioningAnchorPreview[];
  excluded: Array<{ canonicalName: string; category: string }>;
  reference: ReferenceAssetReviewItem["reference"];
  unresolved: string[];
  videoId: string;
}) {
  const requested = reference.conditioningCanonicalNames ?? [];
  const defaultValue = requested.join(", ");

  return (
    <details className="rounded-lg border bg-background/60 p-3 text-xs">
      <summary className="cursor-pointer font-medium">
        Visual anchors ({anchors.length})
        {unresolved.length > 0 ? (
          <span className="ml-2 text-destructive">
            · {unresolved.length} unresolved
          </span>
        ) : null}
        {excluded.length > 0 ? (
          <span className="ml-2 text-muted-foreground">
            · {excluded.length} skipped on purpose
          </span>
        ) : null}
      </summary>
      <p className="mt-2 text-muted-foreground">
        Library globals passed to GPT-Image 2 as `referenceImages[]` when
        (re)generating this reference. Each anchor is invoked from the prompt
        via its `@Tag` so the model grounds geometry, color, and palette on
        them instead of inventing from scratch. Character anchors
        (mascot, poses, expressions) are intentionally skipped — the kitchen
        already carries the Licorn visual identity for dish-state frames.
      </p>

      {anchors.length > 0 ? (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {anchors.map((anchor) => (
            <div
              key={anchor.canonicalName}
              className="rounded-md border bg-background/40 p-1 text-[10px]"
            >
              {anchor.previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={anchor.tag}
                  className="aspect-square w-full rounded object-cover"
                  src={anchor.previewUrl}
                />
              ) : (
                <div className="flex aspect-square w-full items-center justify-center rounded bg-muted/40">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              )}
              <p className="mt-1 truncate font-medium" title={anchor.tag}>
                @{anchor.tag}
              </p>
              <p className="truncate text-muted-foreground" title={anchor.category}>
                {anchor.category}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-md border border-dashed p-2 text-muted-foreground">
          No anchors declared. GPT-Image 2 will invent the kitchen and pan
          from scratch. Add canonical names below (e.g.
          `KitchenIslandDefault, baking_dish`) before regenerating to keep
          the anchor in the Licorn visual identity.
        </p>
      )}

      {unresolved.length > 0 ? (
        <Alert className="mt-3" variant="destructive">
          <AlertTriangle className="h-3 w-3" />
          <AlertTitle className="text-xs">Unresolved anchors</AlertTitle>
          <AlertDescription className="text-[11px]">
            These names do not match any active library entry and will be
            ignored at generation time: {unresolved.join(", ")}. Fix the
            spelling below or add the missing asset under /library.
          </AlertDescription>
        </Alert>
      ) : null}

      {excluded.length > 0 ? (
        <Alert className="mt-3">
          <AlertTitle className="text-xs">
            Skipped on purpose
          </AlertTitle>
          <AlertDescription className="text-[11px]">
            {excluded
              .map((entry) => `${entry.canonicalName} (${entry.category})`)
              .join(", ")}{" "}
            were declared but excluded because character-class entries
            cannot be sent as anchors for recipe-state images. Remove
            them from the list below to keep the plan clean.
          </AlertDescription>
        </Alert>
      ) : null}

      <form
        action={updateReferenceConditioningAction}
        className="mt-3 space-y-2"
      >
        <input name="videoId" type="hidden" value={videoId} />
        <input name="referenceId" type="hidden" value={reference.id} />
        <Label
          className="text-[11px] uppercase text-muted-foreground"
          htmlFor={`conditioning-${reference.id}`}
        >
          Anchor canonical names
        </Label>
        <Textarea
          defaultValue={defaultValue}
          id={`conditioning-${reference.id}`}
          name="conditioningCanonicalNames"
          placeholder="KitchenIslandDefault, SquareBakingDish, Character-sheet"
          rows={2}
        />
        <Button size="sm" type="submit" variant="outline">
          Save anchors
        </Button>
      </form>
    </details>
  );
}

function ReferenceActionButton({
  action,
  disabled,
  icon,
  label,
  referenceId,
  variant,
  videoId,
}: {
  action: (formData: FormData) => Promise<void>;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  referenceId: string;
  variant?: "default" | "outline";
  videoId: string;
}) {
  return (
    <form action={action}>
      <input name="videoId" type="hidden" value={videoId} />
      <input name="referenceId" type="hidden" value={referenceId} />
      <Button disabled={disabled} size="sm" type="submit" variant={variant}>
        {icon}
        {label}
      </Button>
    </form>
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function formatMissing(segment: SegmentReferenceReadiness) {
  const missing = [
    ...segment.missingApprovedReferences.map((item) => `${item} approval`),
    ...segment.missingRunwayUploads.map((item) => `${item} Runway URI`),
  ];

  return missing.length > 0 ? missing.join(", ") : "Ready";
}

function progressForRecipeReferenceCard(
  runwayProgress: number | null,
  runwayTaskStatus: string | null,
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
