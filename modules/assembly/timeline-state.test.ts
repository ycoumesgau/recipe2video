import assert from "node:assert/strict";
import test from "node:test";

import type { AssemblySegmentClip } from "./assembly.types";
import {
  applySegmentTrims,
  createDefaultAudioClip,
  getEmptyTimelineState,
  projectLegacyAudioSync,
  readTimelineState,
} from "./timeline-state";

const buildSegment = (
  overrides: Partial<AssemblySegmentClip> = {},
): AssemblySegmentClip => ({
  segmentId: overrides.segmentId ?? "seg_1",
  mediaAssetId: overrides.mediaAssetId ?? "asset_1",
  generationId: null,
  title: overrides.title ?? "Segment",
  position: overrides.position ?? 0,
  durationSeconds: overrides.durationSeconds ?? 5,
  inSeconds: overrides.inSeconds ?? 0,
  outSeconds: overrides.outSeconds ?? overrides.durationSeconds ?? 5,
  sourceUrl: "https://example.com/clip.mp4",
  storageBucket: "accepted_clips",
  storagePath: "clip.mp4",
});

test("readTimelineState returns empty state on null", () => {
  assert.deepEqual(
    readTimelineState(null, {}),
    getEmptyTimelineState(),
  );
});

test("readTimelineState parses new schema with segment trims and audio clips", () => {
  const result = readTimelineState(
    {
      schema: "timeline_v2",
      segmentTrims: { seg_1: { inSeconds: 1, outSeconds: 4 } },
      audioClips: [
        {
          id: "clip_a",
          mediaAssetId: "asset_a",
          startOnTimelineSeconds: 2,
          inSeconds: 0.5,
          outSeconds: 10,
          volume: 0.75,
          fadeInSeconds: 0.5,
          fadeOutSeconds: 1,
        },
      ],
    },
    {},
  );

  assert.equal(result.schema, "timeline_v2");
  assert.deepEqual(result.segmentTrims, {
    seg_1: { inSeconds: 1, outSeconds: 4 },
  });
  assert.equal(result.audioClips.length, 1);
  assert.equal(result.audioClips[0]?.startOnTimelineSeconds, 2);
  assert.equal(result.audioClips[0]?.volume, 0.75);
});

test("readTimelineState migrates legacy AssemblyAudioSync into one audio clip", () => {
  const result = readTimelineState(
    {
      offsetSeconds: 3,
      cutFromSeconds: 1,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 0.25,
    },
    { audioMediaAssetId: "asset_legacy", audioDurationSeconds: 30 },
  );

  assert.equal(result.audioClips.length, 1);
  const clip = result.audioClips[0]!;
  assert.equal(clip.mediaAssetId, "asset_legacy");
  assert.equal(clip.startOnTimelineSeconds, 3);
  assert.equal(clip.inSeconds, 1);
  assert.equal(clip.outSeconds, 30);
  assert.equal(clip.fadeInSeconds, 0.5);
  assert.equal(clip.fadeOutSeconds, 0.25);
});

test("readTimelineState legacy with negative offset clamps to 0", () => {
  const result = readTimelineState(
    {
      offsetSeconds: -10,
      cutFromSeconds: 0,
      fadeInSeconds: 0,
      fadeOutSeconds: 0,
    },
    { audioMediaAssetId: "asset_legacy", audioDurationSeconds: 30 },
  );

  assert.equal(result.audioClips[0]?.startOnTimelineSeconds, 0);
});

test("readTimelineState legacy without audio asset returns empty audio clips", () => {
  const result = readTimelineState(
    { offsetSeconds: 0, cutFromSeconds: 0, fadeInSeconds: 0, fadeOutSeconds: 0 },
    {},
  );

  assert.deepEqual(result.audioClips, []);
});

test("readTimelineState drops audio clips without mediaAssetId", () => {
  const result = readTimelineState(
    {
      schema: "timeline_v2",
      segmentTrims: {},
      audioClips: [{ id: "ghost", inSeconds: 0, outSeconds: 1 }],
    },
    {},
  );

  assert.equal(result.audioClips.length, 0);
});

test("applySegmentTrims clamps negative inSeconds and over-long outSeconds", () => {
  const result = applySegmentTrims(
    [buildSegment({ durationSeconds: 5 })],
    { seg_1: { inSeconds: -1, outSeconds: 50 } },
  );

  assert.equal(result[0]?.inSeconds, 0);
  assert.equal(result[0]?.outSeconds, 5);
});

test("applySegmentTrims defaults to full clip when no trim is stored", () => {
  const result = applySegmentTrims(
    [buildSegment({ durationSeconds: 7 })],
    {},
  );

  assert.equal(result[0]?.inSeconds, 0);
  assert.equal(result[0]?.outSeconds, 7);
});

test("applySegmentTrims keeps a 0.1s minimum window when in >= out", () => {
  const result = applySegmentTrims(
    [buildSegment({ durationSeconds: 5 })],
    { seg_1: { inSeconds: 4, outSeconds: 4 } },
  );

  const clip = result[0]!;
  assert.ok(clip.outSeconds - clip.inSeconds >= 0.099);
});

test("projectLegacyAudioSync returns zero defaults when no clip", () => {
  const sync = projectLegacyAudioSync([]);
  assert.equal(sync.offsetSeconds, 0);
  assert.equal(sync.cutFromSeconds, 0);
  assert.equal(sync.fadeInSeconds, 0);
  assert.equal(sync.fadeOutSeconds, 0);
});

test("projectLegacyAudioSync mirrors the first clip", () => {
  const sync = projectLegacyAudioSync([
    {
      id: "c1",
      mediaAssetId: "asset",
      startOnTimelineSeconds: 1.25,
      inSeconds: 0.5,
      outSeconds: 12,
      volume: 1,
      fadeInSeconds: 0.5,
      fadeOutSeconds: 1.5,
    },
  ]);

  assert.equal(sync.offsetSeconds, 1.25);
  assert.equal(sync.cutFromSeconds, 0.5);
  assert.equal(sync.fadeInSeconds, 0.5);
  assert.equal(sync.fadeOutSeconds, 1.5);
});

test("createDefaultAudioClip uses provided duration", () => {
  const clip = createDefaultAudioClip({
    mediaAssetId: "asset_x",
    durationSeconds: 42,
  });
  assert.equal(clip.outSeconds, 42);
  assert.equal(clip.startOnTimelineSeconds, 0);
  assert.equal(clip.volume, 1);
});

test("createDefaultAudioClip falls back to 30s when duration is missing", () => {
  const clip = createDefaultAudioClip({ mediaAssetId: "asset_y" });
  assert.equal(clip.outSeconds, 30);
});
