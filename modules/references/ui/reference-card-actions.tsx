"use client";

import type { ReactNode } from "react";
import { Sparkles, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

import {
  approveReferenceAction,
  generateReferenceImageAction,
  rejectReferenceAction,
  uploadReferenceToRunwayAction,
} from "../actions";
import type { ReferenceAssetReviewItem } from "../reference.types";
import type { ReferenceStatus } from "../reference-status";
import { ReferenceFormSubmitButton } from "./reference-form-submit-button";

const PENDING_GENERATION_STATUSES: ReferenceStatus[] = ["planned", "failed"];

export function ReferenceCardActions({
  item,
  videoId,
}: {
  item: ReferenceAssetReviewItem;
  videoId: string;
}) {
  if (item.isLibraryGlobal === true) {
    return null;
  }

  const { mediaAsset, reference } = item;
  const hasImage = Boolean(item.previewUrl);
  const isPendingGeneration = PENDING_GENERATION_STATUSES.includes(
    reference.status,
  );
  const isGenerating = reference.status === "generating";

  return (
    <div className="flex flex-wrap gap-2">
      <form action={generateReferenceImageAction}>
        <input name="videoId" type="hidden" value={videoId} />
        <input name="referenceId" type="hidden" value={reference.id} />
        <ReferenceFormSubmitButton
          disabled={isGenerating || !reference.prompt}
          icon={<Sparkles className="h-4 w-4" />}
          pendingLabel="Generating…"
        >
          {isGenerating
            ? "Generating…"
            : hasImage
              ? "Regenerate (keeps previous variants)"
              : "Generate image"}
        </ReferenceFormSubmitButton>
      </form>
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
