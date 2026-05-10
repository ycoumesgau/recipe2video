import { RUNWAY_MAX_SEEDANCE_REFERENCES } from "@/modules/generation/runway.constants";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import type {
  ReferenceAsset,
  SegmentReferenceReadiness,
} from "../reference.types";

export function buildSegmentReadiness(
  references: ReferenceAsset[],
  segments: SeedanceSegment[],
): SegmentReferenceReadiness[] {
  return segments.map((segment) => {
    const requiredReferences = segment.references.filter(
      (reference) => reference.required !== false,
    );
    const matchedReferences = requiredReferences.map((segmentReference) => ({
      segmentReference,
      asset: findMatchingReferenceAsset(references, segmentReference),
    }));

    return {
      segmentId: segment.id,
      segmentTitle: segment.title,
      referenceCount: segment.references.length,
      exceedsReferenceLimit:
        segment.references.length > RUNWAY_MAX_SEEDANCE_REFERENCES,
      missingApprovedReferences: matchedReferences
        .filter(
          ({ asset, segmentReference }) =>
            !segmentReference.runwayUri && !isApprovedReference(asset),
        )
        .map(({ segmentReference }) => segmentReference.label || segmentReference.name),
      missingRunwayUploads: matchedReferences
        .filter(
          ({ asset, segmentReference }) =>
            !segmentReference.runwayUri &&
            isApprovedReference(asset) &&
            !asset?.runwayUri,
        )
        .map(({ segmentReference }) => segmentReference.label || segmentReference.name),
    };
  });
}

function findMatchingReferenceAsset(
  references: ReferenceAsset[],
  segmentReference: SeedanceSegment["references"][number],
) {
  return references.find((reference) =>
    doesSegmentReferenceMatch(reference, segmentReference),
  );
}

export function doesSegmentReferenceMatch(
  reference: ReferenceAsset,
  segmentReference: SeedanceSegment["references"][number],
) {
  if (segmentReference.id && segmentReference.id === reference.id) {
    return true;
  }

  const referenceKeys = [
    reference.canonicalName,
    reference.type,
    reference.id,
  ].map(normalizeReferenceKey);
  const segmentKeys = [
    segmentReference.name,
    segmentReference.label,
    segmentReference.role,
  ].map(normalizeReferenceKey);

  return segmentKeys.some((key) => key.length > 0 && referenceKeys.includes(key));
}

function isApprovedReference(reference: ReferenceAsset | undefined) {
  return (
    reference?.status === "approved" ||
    reference?.status === "uploaded_to_runway"
  );
}

function normalizeReferenceKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
