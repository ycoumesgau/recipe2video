import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ImageIcon,
  RefreshCcw,
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

import {
  approveReferenceAction,
  rejectReferenceAction,
  requestReferenceRegenerationAction,
  uploadManualReferenceAction,
  uploadReferenceToRunwayAction,
} from "../actions";
import type {
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
};

export function ReferenceReviewWorkflow({
  data,
  notice,
  videoId,
}: {
  data: ReferenceReviewData;
  notice?: { type: "success" | "error"; message: string } | null;
  videoId: string;
}) {
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
          <ManualReferenceUploadCard videoId={videoId} />
          <SegmentReadinessCard readiness={data.segmentReadiness} />
        </div>
      </div>
    </div>
  );
}

function ReferenceSection({
  emptyCopy,
  items,
  title,
  videoId,
}: {
  emptyCopy: string;
  items: ReferenceAssetReviewItem[];
  title: string;
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>
          Cards show storage status, Runway upload status, and segment usage.
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
        <CardAction>
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
            value={reference.runwayUri ? "runway URI stored" : "not uploaded"}
          />
        </div>

        {item.usedInSegments.length > 0 ? (
          <div className="rounded-lg border bg-muted/30 p-3 text-xs">
            <p className="font-medium">Used in segments</p>
            <p className="mt-1 text-muted-foreground">
              {item.usedInSegments.join(", ")}
            </p>
          </div>
        ) : null}

        {reference.prompt ? (
          <div className="rounded-lg border bg-background/60 p-3 text-xs">
            <p className="font-medium">Prompt</p>
            <p className="mt-1 text-muted-foreground">{reference.prompt}</p>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <ReferenceActionButton
            action={approveReferenceAction}
            label="Approve"
            referenceId={reference.id}
            videoId={videoId}
          />
          <ReferenceActionButton
            action={rejectReferenceAction}
            label="Reject"
            referenceId={reference.id}
            variant="outline"
            videoId={videoId}
          />
          <ReferenceActionButton
            action={requestReferenceRegenerationAction}
            icon={<RefreshCcw className="h-4 w-4" />}
            label="Regenerate"
            referenceId={reference.id}
            variant="outline"
            videoId={videoId}
          />
          <ReferenceActionButton
            action={uploadReferenceToRunwayAction}
            disabled={!mediaAsset?.storagePath}
            icon={<Upload className="h-4 w-4" />}
            label="Upload to Runway"
            referenceId={reference.id}
            variant="outline"
            videoId={videoId}
          />
        </div>
      </CardContent>
    </Card>
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
          Detects missing approved references and missing Runway upload URIs.
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
                The Runway limit remains 9 references per Seedance segment.
              </AlertDescription>
            </Alert>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Segment</TableHead>
                  <TableHead>Refs</TableHead>
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
