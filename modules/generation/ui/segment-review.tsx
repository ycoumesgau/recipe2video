import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  RefreshCcw,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentChatPanel } from "@/modules/feedback/ui/agent-chat-panel";
import { RecipeMuxPlayer } from "@/modules/media-assets/ui/mux-player";
import type { SegmentStatus } from "@/modules/storyboard/segment-status";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { VIDEO_MODEL_OPTIONS } from "@/modules/videos/video.constants";
import type { VideoProject } from "@/modules/videos/video.types";

import {
  acceptSegmentVariantAction,
  rejectSegmentVariantAction,
  requestSegmentRegenerationAction,
} from "../actions";
import type { GenerationStatus } from "../generation-status";
import type {
  SegmentReferenceResolutionItem,
  SegmentReviewData,
  SegmentVariantReviewItem,
} from "../use-cases/get-segment-review";
import type { SegmentFeedback } from "@/modules/feedback/feedback.types";

function formatSegmentHeading(segment: SeedanceSegment) {
  return `S${segment.position}. ${segment.title}`;
}

const generationStatusVariant: Record<
  GenerationStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  queued: "secondary",
  processing: "default",
  succeeded: "default",
  failed: "destructive",
  cancelled: "destructive",
  expired: "destructive",
};

const segmentStatusVariant: Record<
  SegmentStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  ready: "secondary",
  queued: "secondary",
  generating: "default",
  review: "default",
  accepted: "default",
  rejected: "destructive",
  failed: "destructive",
  blocked: "destructive",
};

export function SegmentReview({
  data,
  dataError,
  notice,
  segmentId,
  videoId,
}: {
  data: SegmentReviewData;
  dataError?: string | null;
  notice?: { type: "success" | "error"; message: string } | null;
  segmentId: string;
  videoId: string;
}) {
  if (!data.segment) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Segment not found</AlertTitle>
        <AlertDescription>
          No segment matching this project was found. Return to the project and
          open a generated Seedance segment.
        </AlertDescription>
      </Alert>
    );
  }

  const selectedVariant =
    data.variants.find(
      (variant) => variant.generation.id === data.segment?.selectedGenerationId,
    ) ?? data.variants[0];
  const selectedGenerationId = selectedVariant?.generation.id ?? null;

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
            {notice.type === "error" ? "Review action failed" : "Segment updated"}
          </AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {dataError ? (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Review data warning</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="hidden gap-4 lg:grid lg:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)_minmax(280px,0.65fr)]">
        <div className="space-y-4">
          <PlaybackCard
            segmentDisplayName={formatSegmentHeading(data.segment)}
            selectedVariant={selectedVariant}
          />
          <VariantList
            segmentId={segmentId}
            selectedGenerationId={data.segment.selectedGenerationId}
            variants={data.variants}
            videoId={videoId}
          />
        </div>

        <div className="space-y-4">
          <PromptPanel
            project={data.project}
            segment={data.segment}
            variantCount={data.variants.length}
            videoId={videoId}
          />
          <PromptHistoryCard
            currentPrompt={data.segment.prompt}
            feedbacks={data.feedbacks}
          />
          <ReferencesPanel resolutions={data.referenceResolutions} />
        </div>

        <div className="space-y-4">
          <StatusPanel
            project={data.project}
            segmentStatus={data.segment.status}
            variantCount={data.variants.length}
          />
          <AgentChatPanel
            feedbacks={data.feedbacks}
            generationId={selectedGenerationId}
            segmentId={segmentId}
            videoId={videoId}
          />
        </div>
      </div>

      <Tabs className="lg:hidden" defaultValue="video">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="video">Video</TabsTrigger>
          <TabsTrigger value="prompt">Prompt</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="variants">Variants</TabsTrigger>
        </TabsList>
        <TabsContent value="video">
          <PlaybackCard
            segmentDisplayName={formatSegmentHeading(data.segment)}
            selectedVariant={selectedVariant}
          />
        </TabsContent>
        <TabsContent value="prompt">
          <PromptPanel
            project={data.project}
            segment={data.segment}
            variantCount={data.variants.length}
            videoId={videoId}
          />
          <PromptHistoryCard
            currentPrompt={data.segment.prompt}
            feedbacks={data.feedbacks}
          />
        </TabsContent>
        <TabsContent value="chat">
          <AgentChatPanel
            feedbacks={data.feedbacks}
            generationId={selectedGenerationId}
            segmentId={segmentId}
            videoId={videoId}
          />
        </TabsContent>
        <TabsContent value="variants">
          <VariantList
            segmentId={segmentId}
            selectedGenerationId={data.segment.selectedGenerationId}
            variants={data.variants}
            videoId={videoId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PlaybackCard({
  selectedVariant,
  segmentDisplayName,
}: {
  selectedVariant?: SegmentVariantReviewItem;
  segmentDisplayName: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Mux playback</Badge>
          {selectedVariant ? (
            <Badge variant={generationStatusVariant[selectedVariant.generation.status]}>
              {selectedVariant.generation.status}
            </Badge>
          ) : null}
        </div>
        <CardTitle>Latest generation</CardTitle>
        <CardDescription>
          Mux is used for review playback only. Supabase Storage remains the
          durable media source.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {selectedVariant ? (
          <RecipeMuxPlayer
            playbackId={selectedVariant.mediaAsset?.muxPlaybackId}
            title={segmentDisplayName}
          />
        ) : (
          <div className="flex aspect-video items-center justify-center rounded-lg border border-dashed bg-muted/40 text-sm text-muted-foreground">
            No generated variants are available for this segment yet.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VariantList({
  segmentId,
  selectedGenerationId,
  variants,
  videoId,
}: {
  segmentId: string;
  selectedGenerationId?: string | null;
  variants: SegmentVariantReviewItem[];
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Variants</CardTitle>
        <CardDescription>
          Review each generation, accept the strongest take, or reject the current
          segment outcome before regenerating.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {variants.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            No variants found. Use the regeneration request to queue a protected
            Seedance workflow.
          </div>
        ) : (
          variants.map((variant, index) => (
            <VariantCard
              key={variant.generation.id}
              index={index}
              isSelected={selectedGenerationId === variant.generation.id}
              segmentId={segmentId}
              variant={variant}
              videoId={videoId}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function VariantCard({
  index,
  isSelected,
  segmentId,
  variant,
  videoId,
}: {
  index: number;
  isSelected: boolean;
  segmentId: string;
  variant: SegmentVariantReviewItem;
  videoId: string;
}) {
  const { generation, mediaAsset } = variant;

  return (
    <div className="space-y-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Variant {index + 1}</p>
            {isSelected ? <Badge>Accepted</Badge> : null}
            <Badge variant={generationStatusVariant[generation.status]}>
              {generation.status}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {generation.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VariantActionButton
            action={acceptSegmentVariantAction}
            disabled={generation.status !== "succeeded"}
            generationId={generation.id}
            label="Accept"
            segmentId={segmentId}
            videoId={videoId}
          >
            <ThumbsUp className="h-4 w-4" />
          </VariantActionButton>
          <VariantActionButton
            action={rejectSegmentVariantAction}
            generationId={generation.id}
            label="Reject"
            segmentId={segmentId}
            variant="outline"
            videoId={videoId}
          >
            <ThumbsDown className="h-4 w-4" />
          </VariantActionButton>
        </div>
      </div>

      <RecipeMuxPlayer
        playbackId={mediaAsset?.muxPlaybackId}
        title={mediaAsset?.originalFilename ?? generation.id}
      />

      <div className="grid gap-2 text-xs md:grid-cols-4">
        <Metric label="Model" value={generation.model} />
        <Metric
          label="Cost"
          value={
            generation.costCredits === null ||
            generation.costCredits === undefined
              ? "-"
              : `${generation.costCredits} credits`
          }
        />
        <Metric
          label="Duration"
          value={formatSeconds(generation.durationSeconds)}
        />
        <Metric label="Created" value={formatDate(generation.createdAt)} />
      </div>
      <div className="grid gap-2 text-xs md:grid-cols-2">
        <Metric
          label="Supabase original"
          value={mediaAsset?.storagePath ?? "missing"}
        />
        <Metric
          label="Mux playback ID"
          value={mediaAsset?.muxPlaybackId ?? "missing"}
        />
      </div>
    </div>
  );
}

function VariantActionButton({
  action,
  children,
  disabled,
  generationId,
  label,
  segmentId,
  variant,
  videoId,
}: {
  action: (formData: FormData) => Promise<void>;
  children: ReactNode;
  disabled?: boolean;
  generationId: string;
  label: string;
  segmentId: string;
  variant?: "default" | "outline";
  videoId: string;
}) {
  return (
    <form action={action}>
      <input name="videoId" type="hidden" value={videoId} />
      <input name="segmentId" type="hidden" value={segmentId} />
      <input name="generationId" type="hidden" value={generationId} />
      <Button disabled={disabled} size="sm" type="submit" variant={variant}>
        {children}
        {label}
      </Button>
    </form>
  );
}

function PromptPanel({
  project,
  segment,
  variantCount,
  videoId,
}: {
  project: VideoProject | null;
  segment: NonNullable<SegmentReviewData["segment"]>;
  variantCount: number;
  videoId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Prompt</Badge>
          <Badge variant="outline">{segment.mode}</Badge>
        </div>
        <CardTitle>Current Seedance prompt</CardTitle>
        <CardDescription>
          Prompt edits are handled by the prompt diff workflow, not directly on
          this screen.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Copy className="h-4 w-4" />
            Prompt text
          </p>
          <p className="max-h-96 overflow-auto whitespace-pre-wrap text-sm text-muted-foreground">
            {segment.prompt}
          </p>
        </div>
        <div className="grid gap-2 text-xs md:grid-cols-3">
          <Metric label="Segment duration" value={formatSeconds(segment.durationTarget)} />
          <Metric label="Logical scenes" value={segment.logicalSceneIds.join(", ")} />
          <Metric label="Reference count" value={String(segment.references.length)} />
        </div>
        <RegenerationForm
          hasExistingVariants={variantCount > 0}
          project={project}
          segmentId={segment.id}
          videoId={videoId}
        />
      </CardContent>
    </Card>
  );
}

function RegenerationForm({
  hasExistingVariants,
  project,
  segmentId,
  videoId,
}: {
  hasExistingVariants: boolean;
  project: VideoProject | null;
  segmentId: string;
  videoId: string;
}) {
  // The same `requestSegmentRegenerationAction` powers the very first
  // generation AND every subsequent retry. Calling the button "Request
  // regeneration" before any variant exists confused users into thinking
  // they had missed a primary "Generate" entry point. We adapt the label
  // and helper copy based on whether a variant has already been produced.
  return (
    <form action={requestSegmentRegenerationAction} className="space-y-3 rounded-lg border p-3">
      <input name="videoId" type="hidden" value={videoId} />
      <input name="segmentId" type="hidden" value={segmentId} />
      <div className="space-y-2">
        <Label htmlFor="selectedVideoModel">
          {hasExistingVariants ? "Regeneration model" : "Generation model"}
        </Label>
        <Select
          defaultValue={project?.selectedVideoModel ?? "seedance2"}
          name="selectedVideoModel"
        >
          <SelectTrigger className="w-full font-normal" id="selectedVideoModel">
            <SelectValue placeholder="Pick a video model" />
          </SelectTrigger>
          <SelectContent position="popper">
            {VIDEO_MODEL_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        The selected model is shown before queueing. The current workflow only
        queues the project generation model and never silently falls back.
      </p>
      <Button type="submit">
        <RefreshCcw className="h-4 w-4" />
        {hasExistingVariants ? "Request regeneration" : "Generate this segment"}
      </Button>
    </form>
  );
}

function PromptHistoryCard({
  currentPrompt,
  feedbacks,
}: {
  currentPrompt: string;
  feedbacks: SegmentFeedback[];
}) {
  const appliedHistory = feedbacks
    .filter((feedback) => feedback.applied)
    .slice()
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-4 w-4" />
          Prompt version history
        </CardTitle>
        <CardDescription>
          Each applied feedback creates a new prompt version. The current prompt
          stays at the top; older versions are auditable here.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-lg border bg-emerald-500/10 p-3 text-xs">
          <p className="mb-1 font-medium">Current prompt</p>
          <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">
            {currentPrompt}
          </p>
        </div>
        {appliedHistory.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No prior prompt versions: this segment has not been edited through
            the agent feedback loop yet.
          </p>
        ) : (
          appliedHistory.map((feedback) => (
            <details
              key={feedback.id}
              className="rounded-lg border bg-muted/20 p-3 text-xs"
            >
              <summary className="cursor-pointer font-medium">
                Replaced on {new Date(feedback.createdAt).toLocaleString()}
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-muted-foreground">
                  Feedback: {feedback.message}
                </p>
                <div>
                  <p className="font-medium">Prompt before</p>
                  <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">
                    {feedback.promptBefore}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Prompt after</p>
                  <p className="line-clamp-6 whitespace-pre-wrap text-muted-foreground">
                    {feedback.promptAfter}
                  </p>
                </div>
              </div>
            </details>
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ReferencesPanel({
  resolutions,
}: {
  resolutions: SegmentReferenceResolutionItem[];
}) {
  // The legacy `ReferencesPanel` displayed `runwayUri` from the segment's
  // JSON, which is never populated for library globals (those are streamed
  // to Runway just-in-time via signed URLs). The "Missing Runway URI"
  // string then falsely suggested an upload step that does not exist for
  // globals. The new panel reads the actual segment_references resolution
  // and reports whether each reference is ready, missing storage, or
  // unresolved.
  return (
    <Card>
      <CardHeader>
        <CardTitle>References</CardTitle>
        <CardDescription>
          Library globals are streamed to Runway with a fresh signed URL at
          generation time. Recipe-specific references must be approved before
          they show up here as ready.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {resolutions.length === 0 ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No references are attached to this segment.
          </div>
        ) : (
          resolutions.map((resolution) => (
            <ReferenceResolutionRow
              key={`${resolution.position ?? "unresolved"}-${resolution.declaredName}`}
              resolution={resolution}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}

function ReferenceResolutionRow({
  resolution,
}: {
  resolution: SegmentReferenceResolutionItem;
}) {
  const status = computeResolutionStatus(resolution);

  return (
    <div className="rounded-lg border bg-muted/20 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline">@{resolution.declaredLabel}</Badge>
        {resolution.required ? <Badge variant="secondary">required</Badge> : null}
        <Badge variant={status.variant} className="ml-auto">
          {status.label}
        </Badge>
      </div>
      <p className="mt-2 font-medium">{resolution.declaredName}</p>
      <p className="text-muted-foreground">{resolution.role}</p>
      <p className="mt-2 text-xs text-muted-foreground">{status.description}</p>
    </div>
  );
}

function computeResolutionStatus(resolution: SegmentReferenceResolutionItem): {
  label: string;
  description: string;
  variant: "default" | "secondary" | "destructive" | "outline";
} {
  if (!resolution.resolvedCanonicalName) {
    return {
      label: "not resolved",
      description:
        "This reference name is not in asset_library nor declared in reference-plan.json. Sync the agent or rename the reference to a known canonical / alias.",
      variant: "destructive",
    };
  }

  if (!resolution.hasStorage) {
    return {
      label: "no storage",
      description: `${resolution.resolvedCanonicalName} is wired but its media is missing in Supabase Storage. Upload or regenerate the source image before launching Seedance.`,
      variant: "destructive",
    };
  }

  if (resolution.resolvedSource === "asset_library") {
    return {
      label: "ready · library global",
      description: `Resolved to ${resolution.resolvedCanonicalName}. Streamed to Runway just-in-time with a fresh signed URL — no manual upload needed.`,
      variant: "secondary",
    };
  }

  return {
    label: "ready · recipe-specific",
    description: `Resolved to ${resolution.resolvedCanonicalName}. Will be streamed to Runway with a fresh signed URL at generation time.`,
    variant: "default",
  };
}

function StatusPanel({
  project,
  segmentStatus,
  variantCount,
}: {
  project: VideoProject | null;
  segmentStatus: SegmentStatus;
  variantCount: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Review status</CardTitle>
        <CardDescription>
          Every async state remains visible while the user can switch projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={segmentStatusVariant[segmentStatus]}>{segmentStatus}</Badge>
          <Badge variant="secondary">{variantCount} variants</Badge>
          {project ? <Badge variant="outline">{project.selectedVideoModel}</Badge> : null}
        </div>
        <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
          Accepted variants are stored as `segments.selected_generation_id`. Mux
          playback IDs stay on `media_assets`; original files remain in Supabase
          Storage.
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg border bg-background/60 p-2">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-1 break-words font-medium">{value}</p>
    </div>
  );
}

function formatSeconds(seconds?: number | null) {
  if (!seconds || seconds <= 0) {
    return "-";
  }

  return `${Number(seconds.toFixed(1))}s`;
}

function formatDate(value?: string | null) {
  if (!value) {
    return "-";
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Clock className="h-3 w-3" />
      {new Date(value).toLocaleString()}
    </span>
  );
}
