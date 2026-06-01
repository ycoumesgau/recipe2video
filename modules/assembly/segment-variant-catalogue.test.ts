import assert from "node:assert/strict";
import test from "node:test";

import type { MediaAsset } from "@/modules/media-assets/media-asset.types";
import type { Generation } from "@/modules/generation/generation.types";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";

import {
  buildSegmentVariantCatalogue,
  formatAssemblyClipTitle,
  formatVariantLabel,
  groupCatalogueByStoryboardPosition,
} from "./segment-variant-catalogue";

test("formatVariantLabel uses 1-based indexing", () => {
  assert.equal(formatVariantLabel(1), "Variant 1");
  assert.equal(formatVariantLabel(3), "Variant 3");
});

test("formatAssemblyClipTitle appends variant only when several exist", () => {
  assert.equal(
    formatAssemblyClipTitle({
      baseTitle: "S2. Beat",
      variantLabel: "Variant 2",
      variantCountAtPosition: 1,
    }),
    "S2. Beat",
  );
  assert.equal(
    formatAssemblyClipTitle({
      baseTitle: "S2. Beat",
      variantLabel: "Variant 2",
      variantCountAtPosition: 2,
    }),
    "S2. Beat · Variant 2",
  );
});

test("buildSegmentVariantCatalogue stacks two variants for the same storyboard slot", () => {
  const segment: SeedanceSegment = {
    id: "seg_main",
    videoId: "vid",
    position: 2,
    title: "Beat",
    arc: "",
    mode: "References",
    logicalSceneIds: [],
    description: "",
    prompt: "",
    promptInitial: "",
    references: [],
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
    status: "accepted",
    selectedGenerationId: "gen_active",
  };

  const generations: Generation[] = [
    {
      id: "gen_active",
      segmentId: "seg_main",
      model: "seedance2",
      modelParams: {},
      status: "succeeded",
      mediaAssetId: "asset_active",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "gen_alt",
      segmentId: "seg_main",
      model: "seedance2",
      modelParams: {},
      status: "succeeded",
      mediaAssetId: "asset_alt",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  const mediaAssets: MediaAsset[] = [
    {
      id: "asset_active",
      videoId: "vid",
      segmentId: "seg_main",
      generationId: "gen_active",
      type: "accepted_clip",
      provider: "supabase",
      storageBucket: "accepted_clips",
      storagePath: "a.mp4",
      status: "stored",
      durationSeconds: 5,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "asset_alt",
      videoId: "vid",
      segmentId: "seg_main",
      generationId: "gen_alt",
      type: "runway_output",
      provider: "supabase",
      storageBucket: "accepted_clips",
      storagePath: "b.mp4",
      status: "stored",
      durationSeconds: 6,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  const entries = buildSegmentVariantCatalogue({
    allSegments: [segment],
    acceptedSegments: [segment],
    generations,
    mediaAssets,
    conversationNameBySegmentId: new Map(),
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.variantLabel, "Variant 1");
  assert.equal(entries[0]?.isActiveVariant, true);
  assert.equal(entries[0]?.mediaAssetId, "asset_active");
  assert.equal(entries[1]?.variantLabel, "Variant 2");
  assert.equal(entries[1]?.isActiveVariant, false);

  const groups = groupCatalogueByStoryboardPosition(entries);
  assert.equal(groups.length, 1);
  assert.equal(groups[0]?.variants.length, 2);
});

test("buildSegmentVariantCatalogue keeps the selected take when segment status is failed after a retry", () => {
  const segment: SeedanceSegment = {
    id: "seg_main",
    videoId: "vid",
    position: 1,
    title: "Hook",
    arc: "",
    mode: "References",
    logicalSceneIds: [],
    description: "",
    prompt: "",
    promptInitial: "",
    references: [],
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
    status: "failed",
    selectedGenerationId: "gen_accepted",
  };

  const generations: Generation[] = [
    {
      id: "gen_accepted",
      segmentId: "seg_main",
      model: "seedance2",
      modelParams: {},
      status: "succeeded",
      mediaAssetId: "asset_accepted",
      createdAt: "2026-01-02T00:00:00.000Z",
    },
    {
      id: "gen_failed_retry",
      segmentId: "seg_main",
      model: "seedance2",
      modelParams: {},
      status: "failed",
      createdAt: "2026-01-03T00:00:00.000Z",
    },
  ];

  const mediaAssets: MediaAsset[] = [
    {
      id: "asset_accepted",
      videoId: "vid",
      segmentId: "seg_main",
      generationId: "gen_accepted",
      type: "accepted_clip",
      provider: "supabase",
      storageBucket: "accepted_clips",
      storagePath: "hook.mp4",
      status: "stored",
      durationSeconds: 5,
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  const entries = buildSegmentVariantCatalogue({
    allSegments: [segment],
    acceptedSegments: [segment],
    generations,
    mediaAssets,
    conversationNameBySegmentId: new Map(),
  });

  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.mediaAssetId, "asset_accepted");
  assert.equal(entries[0]?.isActiveVariant, true);
});
