import assert from "node:assert/strict";
import test from "node:test";

import type { ReferenceAsset } from "../reference.types";
import { buildSegmentReadiness } from "./reference-readiness";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

test("buildSegmentReadiness treats segment references with runwayUri as ready", () => {
  const readiness = buildSegmentReadiness([], [
    segment({
      runwayUri: "runway://kitchen",
    }),
  ]);

  assert.equal(readiness[0]?.exceedsReferenceLimit, false);
  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, []);
});

test("buildSegmentReadiness treats uploaded reference assets as ready", () => {
  const readiness = buildSegmentReadiness(
    [referenceAsset("KitchenIslandDefault", "runway://kitchen")],
    [
      segment({
        runwayUri: null,
      }),
    ],
  );

  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, []);
});

test("buildSegmentReadiness reports approved references missing stored media", () => {
  const readiness = buildSegmentReadiness(
    [referenceAsset("KitchenIslandDefault", null, "approved", null)],
    [
      segment({
        runwayUri: null,
      }),
    ],
  );

  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, ["KitchenIslandDefault"]);
});

test("buildSegmentReadiness treats approved references with stored media as ready without runwayUri", () => {
  const readiness = buildSegmentReadiness(
    [
      referenceAsset(
        "OrecchietteAlDenteReference",
        null,
        "approved",
        "media-variant-1",
      ),
    ],
    [
      segment({
        runwayUri: null,
        referenceName: "OrecchietteAlDenteReference",
      }),
    ],
  );

  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, []);
});

test("buildSegmentReadiness treats library globals as ready even without runwayUri", () => {
  // Library globals are uploaded to Runway just-in-time via signed URLs
  // (resolveSegmentSeedanceReferences). They must NEVER appear in
  // missingRunwayUploads — that would force users to hunt for a manual
  // upload button that does not (and should not) exist for globals.
  const readiness = buildSegmentReadiness(
    [
      {
        ...referenceAsset("KitchenIslandDefault", null, "approved"),
        source: "asset_library",
      },
    ],
    [segment({ runwayUri: null })],
  );

  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, []);
});

test("buildSegmentReadiness matches a segment reference declared by alias against the canonical asset", () => {
  // The agent typically writes `KitchenIslandDefault` in
  // `seedance-segments.json` even though the asset_library canonical is
  // `island_default`. The matcher must follow aliases on either side.
  const readiness = buildSegmentReadiness(
    [
      {
        ...referenceAsset("island_default", null, "approved"),
        aliases: ["KitchenIslandDefault"],
        source: "asset_library",
      },
    ],
    [segment({ runwayUri: null })],
  );

  assert.deepEqual(readiness[0]?.missingApprovedReferences, []);
  assert.deepEqual(readiness[0]?.missingRunwayUploads, []);
});

function segment(input: {
  runwayUri: string | null;
  referenceName?: string;
}): SeedanceSegment {
  const referenceName = input.referenceName ?? "KitchenIslandDefault";
  return {
    id: "segment-1",
    videoId: "video-1",
    position: 1,
    title: "Hook",
    arc: "opening",
    mode: "References",
    logicalSceneIds: ["scene-1"],
    description: "Hook",
    prompt: "Prompt",
    promptInitial: "Prompt",
    references: [
      {
        role: "global Licorn kitchen environment",
        name: referenceName,
        label: referenceName,
        runwayUri: input.runwayUri,
        required: true,
      },
    ],
    beats: [],
    timing: [],
    continuity: "",
    risk: "",
    audioPrompt: "",
    negatives: [],
    qaChecklist: {
      referencesWithinLimit: true,
      globalKitchenReferencePresent: true,
      referenceRolesExplicit: true,
      promptWithinPracticalLimit: true,
      hardCutsSpecified: true,
      mandatoryTimingSpecified: true,
      noSpeechVoiceoverOrMusic: true,
      fragileFoodPhysicsHandled: true,
      nonStandardGeometryHandled: true,
      sourcePoliciesApplied: [],
    },
    durationTarget: 5,
    status: "ready",
  };
}

function referenceAsset(
  canonicalName: string,
  runwayUri: string | null,
  status: ReferenceAsset["status"] = "uploaded_to_runway",
  mediaAssetId: string | null = "media-default",
): ReferenceAsset {
  return {
    id: `reference-${canonicalName}`,
    videoId: "video-1",
    mediaAssetId,
    type: "kitchen",
    canonicalName,
    source: "agent_reference_plan",
    runwayUri,
    prompt: null,
    status,
    createdAt: "2026-05-10T00:00:00.000Z",
  };
}
