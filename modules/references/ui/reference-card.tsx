"use client";

import { AlertTriangle, ImageIcon } from "lucide-react";

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
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";

import {
  selectReferenceImageVariantAction,
  updateReferenceConditioningAction,
  updateReferencePromptAction,
} from "../actions";
import type {
  ConditioningAnchorPreview,
  ReferenceAssetReviewItem,
  ReferenceImageVariantItem,
} from "../reference.types";
import { ARTIFACT_STATUS_BADGE_VARIANT } from "@/modules/shared/ui/artifact-image-card";

import type { ReferenceSubstitutePickerOption } from "../reference.types";
import { CanonicalReferenceThumbnails } from "./canonical-reference-thumbnails";
import { ReferenceCardActions } from "./reference-card-actions";
import { ReferenceCardPreview } from "./reference-card-preview";
import { ReferenceSubstituteForm } from "./reference-substitute-form";

export function ReferenceCard({
  item,
  onExpandPreview,
  substitutePickerOptions = [],
  videoId,
}: {
  item: ReferenceAssetReviewItem;
  onExpandPreview?: () => void;
  substitutePickerOptions?: ReferenceSubstitutePickerOption[];
  videoId: string;
}) {
  const { mediaAsset, reference } = item;
  const isReadOnly = item.isLibraryGlobal === true;
  const isGenerating = reference.status === "generating";

  return (
    <Card size="sm">
      <ReferenceCardPreview
        alt={reference.canonicalName}
        onExpand={onExpandPreview}
        previewUrl={item.previewUrl}
      />
      <CardHeader>
        <CardAction className="flex items-center gap-2">
          {isReadOnly ? (
            <Badge variant="outline">Library · read-only</Badge>
          ) : null}
          <Badge variant={ARTIFACT_STATUS_BADGE_VARIANT[reference.status]}>
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

        {!isReadOnly && (item.imageVariants?.length ?? 0) > 1 ? (
          <ReferenceImageVariantsPanel item={item} videoId={videoId} />
        ) : null}

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
                Prompt{" "}
                {reference.prompt
                  ? "(edit)"
                  : "(missing — set to enable agent regeneration)"}
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
          <>
            <ReferenceSubstituteForm
              pickerOptions={substitutePickerOptions}
              referenceId={reference.id}
              videoId={videoId}
            />
            <ReferenceCardActions item={item} videoId={videoId} />
          </>
        )}
      </CardContent>
    </Card>
  );
}

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
        Library globals and other recipe reference frames passed to GPT-Image 2
        as `referenceImages[]` when (re)generating this reference. Each anchor
        is invoked from the prompt via its `@Tag` so the model grounds geometry,
        color, and palette on them instead of inventing from scratch. Recipe
        anchors must already be stored (generate and approve them first).
        Character library anchors (mascot, poses, expressions) are intentionally
        skipped for dish-state frames.
      </p>

      {anchors.length > 0 ? (
        <CanonicalReferenceThumbnails items={anchors} />
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
            These names do not match any library global or recipe reference
            with stored media on this video and will be ignored at generation
            time: {unresolved.join(", ")}. Fix the spelling, generate the
            frame first, or add the asset under /library.
          </AlertDescription>
        </Alert>
      ) : null}

      {excluded.length > 0 ? (
        <Alert className="mt-3">
          <AlertTitle className="text-xs">Skipped on purpose</AlertTitle>
          <AlertDescription className="text-[11px]">
            {excluded
              .map((entry) => `${entry.canonicalName} (${entry.category})`)
              .join(", ")}{" "}
            were declared but excluded because character-class entries cannot
            be sent as anchors for recipe-state images. Remove them from the
            list below to keep the plan clean.
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
          placeholder="KitchenIslandDefault, RawCroissantCrescentsFrame"
          rows={2}
        />
        <Button size="sm" type="submit" variant="outline">
          Save anchors
        </Button>
      </form>
    </details>
  );
}

function ReferenceImageVariantsPanel({
  item,
  videoId,
}: {
  item: ReferenceAssetReviewItem;
  videoId: string;
}) {
  const variants = item.imageVariants ?? [];

  return (
    <details className="rounded-lg border bg-background/60 p-3 text-xs" open>
      <summary className="cursor-pointer font-medium">
        Image variants ({variants.length}) — compare takes before approving
      </summary>
      <div className="mt-3 space-y-3">
        {variants.map((variant, index) => (
          <ReferenceImageVariantRow
            key={variant.mediaAsset.id}
            index={index}
            referenceId={item.reference.id}
            variant={variant}
            videoId={videoId}
          />
        ))}
      </div>
    </details>
  );
}

function ReferenceImageVariantRow({
  index,
  referenceId,
  variant,
  videoId,
}: {
  index: number;
  referenceId: string;
  variant: ReferenceImageVariantItem;
  videoId: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2 sm:flex-row sm:items-start">
      {variant.previewUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={`Variant ${index + 1}`}
          className="h-20 w-20 shrink-0 rounded object-cover"
          src={variant.previewUrl}
        />
      ) : (
        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed bg-muted/40">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">Variant {index + 1}</span>
          {variant.isActive ? <Badge>Active preview</Badge> : null}
        </div>
        <form action={selectReferenceImageVariantAction}>
          <input name="videoId" type="hidden" value={videoId} />
          <input name="referenceId" type="hidden" value={referenceId} />
          <input
            name="mediaAssetId"
            type="hidden"
            value={variant.mediaAsset.id}
          />
          <Button
            disabled={variant.isActive}
            size="sm"
            type="submit"
            variant="outline"
          >
            Use this image
          </Button>
        </form>
      </div>
    </div>
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
