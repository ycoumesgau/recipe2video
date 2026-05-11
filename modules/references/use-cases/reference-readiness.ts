import { RUNWAY_MAX_SEEDANCE_REFERENCES } from "@/modules/generation/runway.constants";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import { matchesReference, normalizeReferenceName } from "../reference-matching";
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
            // Library globals are streamed to Runway just-in-time via signed
            // URLs (see `resolveSegmentSeedanceReferences`). They never carry
            // a persisted `runwayUri`, so flagging them as "needs Runway
            // upload" misled users into hunting for a button that does not
            // exist. Recipe-specific approved references still need an
            // explicit upload (`uploadReferenceToRunwayAction`).
            !isLibraryGlobal(asset) &&
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

  // Match against the canonical name AND every alias on either side. A
  // library entry stores `canonical_name = "island_default"` with
  // `aliases = ["KitchenIslandDefault"]`; segments typically reference it
  // by alias. We also fall back to `type` and `role` because some legacy
  // segments still use those.
  const candidateNames = [
    segmentReference.name,
    segmentReference.label,
    segmentReference.role,
  ];

  if (
    candidateNames.some((name) =>
      matchesReference(
        { canonicalName: reference.canonicalName, aliases: reference.aliases },
        name,
      ),
    )
  ) {
    return true;
  }

  // Last-resort fallback for malformed legacy data: normalize the reference
  // type / id so a stale row that lost its canonical name still resolves.
  const normalizedReferenceFallback = new Set(
    [reference.type, reference.id].map(normalizeReferenceName).filter(Boolean),
  );
  return candidateNames.some((name) =>
    normalizedReferenceFallback.has(normalizeReferenceName(name)),
  );
}

function isApprovedReference(reference: ReferenceAsset | undefined) {
  return (
    reference?.status === "approved" ||
    reference?.status === "uploaded_to_runway"
  );
}

function isLibraryGlobal(reference: ReferenceAsset | undefined) {
  return reference?.source === "asset_library";
}
