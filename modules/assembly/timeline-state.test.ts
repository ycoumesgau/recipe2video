import assert from "node:assert/strict";
import test from "node:test";

import type { AssemblySegmentClip } from "./assembly.types";
import {
  buildClipsFromPlacements,
  computeDropInsertIndex,
  createDefaultAudioClip,
  defaultPlacementsForSegments,
  generatePlacementId,
  getEmptyTimelineState,
  insertPlacementAt,
  projectLegacyAudioSync,
  readPlacementsState,
  readTimelineState,
  serializePlacements,
  splitPlacementAtSourceSeconds,
} from "./timeline-state";

const buildSegmentMeta = (
  overrides: Partial<AssemblySegmentClip> = {},
): Omit<
  AssemblySegmentClip,
  "placementId" | "position" | "inSeconds" | "outSeconds"
> => ({
  segmentId: overrides.segmentId ?? "seg_1",
  mediaAssetId: overrides.mediaAssetId ?? "asset_1",
  generationId: null,
  title: overrides.title ?? "Segment",
  durationSeconds: overrides.durationSeconds ?? 5,
  sourceUrl: "https://example.com/clip.mp4",
  storageBucket: "accepted_clips",
  storagePath: "clip.mp4",
});

// ---------------------------------------------------------------------------
// readTimelineState — audio side
// ---------------------------------------------------------------------------

test("readTimelineState returns empty state on null", () => {
  assert.deepEqual(readTimelineState(null, {}), getEmptyTimelineState());
});

test("readTimelineState parses new schema audio clips and ignores any segmentTrims it carries", () => {
  const result = readTimelineState(
    {
      schema: "timeline_v2",
      // segmentTrims is the legacy post-#77 carrier — ignored by the audio
      // reader; consumed exclusively by readPlacementsState.
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
  assert.equal(result.audioClips.length, 1);
  assert.equal(result.audioClips[0]?.startOnTimelineSeconds, 2);
  assert.equal(result.audioClips[0]?.volume, 0.75);
  assert.ok(!("segmentTrims" in result));
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
      audioClips: [{ id: "ghost", inSeconds: 0, outSeconds: 1 }],
    },
    {},
  );
  assert.equal(result.audioClips.length, 0);
});

// ---------------------------------------------------------------------------
// readPlacementsState — three legacy shapes + clamping + orphan drop
// ---------------------------------------------------------------------------

test("readPlacementsState parses placements_v1 (current shape)", () => {
  const durations = new Map([
    ["seg_a", 8],
    ["seg_b", 5],
  ]);
  const result = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        {
          placementId: "p_1",
          segmentId: "seg_a",
          inSeconds: 0,
          outSeconds: 4,
        },
        {
          placementId: "p_2",
          segmentId: "seg_a",
          inSeconds: 4,
          outSeconds: 8,
        },
        {
          placementId: "p_3",
          segmentId: "seg_b",
          inSeconds: 1,
          outSeconds: 5,
        },
      ],
    },
    null,
    durations,
  );
  assert.equal(result.length, 3);
  assert.equal(result[0]?.placementId, "p_1");
  assert.equal(result[1]?.segmentId, "seg_a");
  assert.equal(result[2]?.outSeconds, 5);
});

test("readPlacementsState upgrades the post-#77 'string[] + segmentTrims' shape", () => {
  const durations = new Map([
    ["seg_a", 8],
    ["seg_b", 5],
  ]);
  const placements = readPlacementsState(
    ["seg_a", "seg_b"],
    {
      schema: "timeline_v2",
      segmentTrims: { seg_a: { inSeconds: 0, outSeconds: 4 } },
      audioClips: [],
    },
    durations,
  );
  assert.equal(placements.length, 2);
  assert.equal(placements[0]?.segmentId, "seg_a");
  assert.equal(placements[0]?.inSeconds, 0);
  assert.equal(placements[0]?.outSeconds, 4);
  // No trim stored for seg_b → defaults to [0, durationSeconds].
  assert.equal(placements[1]?.segmentId, "seg_b");
  assert.equal(placements[1]?.inSeconds, 0);
  assert.equal(placements[1]?.outSeconds, 5);
});

test("readPlacementsState upgrades the pre-#77 bare 'string[]' shape", () => {
  const durations = new Map([
    ["seg_a", 6],
    ["seg_b", 3],
  ]);
  const placements = readPlacementsState(["seg_a", "seg_b"], null, durations);
  assert.equal(placements.length, 2);
  assert.equal(placements[0]?.outSeconds, 6);
  assert.equal(placements[1]?.outSeconds, 3);
});

test("readPlacementsState drops placements pointing to a missing segmentId", () => {
  const durations = new Map([["seg_a", 8]]);
  const placements = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        {
          placementId: "p_1",
          segmentId: "seg_a",
          inSeconds: 0,
          outSeconds: 8,
        },
        {
          placementId: "p_2",
          segmentId: "seg_ghost",
          inSeconds: 0,
          outSeconds: 4,
        },
      ],
    },
    null,
    durations,
  );
  assert.equal(placements.length, 1);
  assert.equal(placements[0]?.segmentId, "seg_a");
});

test("readPlacementsState clamps stored [in, out] to the source duration", () => {
  const durations = new Map([["seg_a", 5]]);
  const [placement] = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        {
          placementId: "p_overflow",
          segmentId: "seg_a",
          inSeconds: -1,
          outSeconds: 50,
        },
      ],
    },
    null,
    durations,
  );
  assert.ok(placement);
  assert.equal(placement.inSeconds, 0);
  assert.equal(placement.outSeconds, 5);
});

test("readPlacementsState keeps a 0.1s window when stored in >= out", () => {
  const durations = new Map([["seg_a", 5]]);
  const [placement] = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        {
          placementId: "p_collapsed",
          segmentId: "seg_a",
          inSeconds: 4,
          outSeconds: 4,
        },
      ],
    },
    null,
    durations,
  );
  assert.ok(placement);
  assert.ok(placement.outSeconds - placement.inSeconds >= 0.099);
});

test("readPlacementsState supports the same segmentId appearing multiple times", () => {
  const durations = new Map([["seg_a", 8]]);
  const placements = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        {
          placementId: "p_1",
          segmentId: "seg_a",
          inSeconds: 0,
          outSeconds: 3,
        },
        {
          placementId: "p_2",
          segmentId: "seg_a",
          inSeconds: 5,
          outSeconds: 8,
        },
      ],
    },
    null,
    durations,
  );
  assert.equal(placements.length, 2);
  assert.notEqual(placements[0]?.placementId, placements[1]?.placementId);
  assert.equal(placements[0]?.segmentId, placements[1]?.segmentId);
});

test("readPlacementsState fills missing placementIds when the persisted JSON omits them", () => {
  const durations = new Map([["seg_a", 8]]);
  const placements = readPlacementsState(
    {
      schema: "placements_v1",
      placements: [
        { segmentId: "seg_a", inSeconds: 0, outSeconds: 3 },
        { segmentId: "seg_a", inSeconds: 5, outSeconds: 8 },
      ],
    },
    null,
    durations,
  );
  assert.equal(placements.length, 2);
  assert.ok(placements[0]?.placementId);
  assert.ok(placements[1]?.placementId);
  assert.notEqual(placements[0]?.placementId, placements[1]?.placementId);
});

test("readPlacementsState returns an empty list on null input", () => {
  assert.deepEqual(readPlacementsState(null, null, new Map()), []);
});

// ---------------------------------------------------------------------------
// buildClipsFromPlacements
// ---------------------------------------------------------------------------

test("buildClipsFromPlacements joins placements with segment metadata", () => {
  const meta = new Map([
    ["seg_a", buildSegmentMeta({ segmentId: "seg_a", durationSeconds: 8 })],
  ]);
  const clips = buildClipsFromPlacements(
    [
      { placementId: "p_1", segmentId: "seg_a", inSeconds: 0, outSeconds: 4 },
      { placementId: "p_2", segmentId: "seg_a", inSeconds: 4, outSeconds: 8 },
    ],
    meta,
  );
  assert.equal(clips.length, 2);
  assert.equal(clips[0]?.placementId, "p_1");
  assert.equal(clips[0]?.position, 0);
  assert.equal(clips[1]?.position, 1);
  assert.equal(clips[0]?.segmentId, clips[1]?.segmentId);
});

test("buildClipsFromPlacements drops placements whose segment metadata is missing", () => {
  const meta = new Map([
    ["seg_a", buildSegmentMeta({ segmentId: "seg_a", durationSeconds: 5 })],
  ]);
  const clips = buildClipsFromPlacements(
    [
      { placementId: "p_1", segmentId: "seg_a", inSeconds: 0, outSeconds: 5 },
      { placementId: "p_orphan", segmentId: "seg_x", inSeconds: 0, outSeconds: 5 },
    ],
    meta,
  );
  assert.equal(clips.length, 1);
  assert.equal(clips[0]?.placementId, "p_1");
});

test("buildClipsFromPlacements clamps trims that overflow the source", () => {
  const meta = new Map([
    ["seg_a", buildSegmentMeta({ segmentId: "seg_a", durationSeconds: 4 })],
  ]);
  const [clip] = buildClipsFromPlacements(
    [
      {
        placementId: "p_overflow",
        segmentId: "seg_a",
        inSeconds: -1,
        outSeconds: 99,
      },
    ],
    meta,
  );
  assert.ok(clip);
  assert.equal(clip.inSeconds, 0);
  assert.equal(clip.outSeconds, 4);
});

// ---------------------------------------------------------------------------
// defaultPlacementsForSegments + serializePlacements
// ---------------------------------------------------------------------------

test("defaultPlacementsForSegments creates 1:1 placements covering full duration", () => {
  const placements = defaultPlacementsForSegments([
    { segmentId: "seg_a", durationSeconds: 6 },
    { segmentId: "seg_b", durationSeconds: 4 },
  ]);
  assert.equal(placements.length, 2);
  assert.equal(placements[0]?.inSeconds, 0);
  assert.equal(placements[0]?.outSeconds, 6);
  assert.equal(placements[1]?.outSeconds, 4);
  assert.notEqual(placements[0]?.placementId, placements[1]?.placementId);
});

test("serializePlacements emits the placements_v1 wrapper", () => {
  const json = serializePlacements([
    { placementId: "p_1", segmentId: "seg_a", inSeconds: 0, outSeconds: 4 },
  ]);
  assert.equal(json.schema, "placements_v1");
  assert.equal(json.placements.length, 1);
  assert.equal(json.placements[0]?.placementId, "p_1");
});

// ---------------------------------------------------------------------------
// projectLegacyAudioSync + createDefaultAudioClip (unchanged behaviour)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// splitPlacementAtSourceSeconds
// ---------------------------------------------------------------------------

const buildPlacement = (
  overrides: Partial<{
    placementId: string;
    segmentId: string;
    inSeconds: number;
    outSeconds: number;
  }> = {},
) => ({
  placementId: overrides.placementId ?? "p_1",
  segmentId: overrides.segmentId ?? "seg_a",
  inSeconds: overrides.inSeconds ?? 0,
  outSeconds: overrides.outSeconds ?? 8,
});

test("splitPlacementAtSourceSeconds splits a placement into two halves sharing the segmentId", () => {
  const placements = [buildPlacement({ placementId: "p_a" })];
  const result = splitPlacementAtSourceSeconds(
    placements,
    "p_a",
    4,
    "p_a_right",
  );
  assert.ok(result);
  assert.equal(result.next.length, 2);
  assert.equal(result.next[0]?.placementId, "p_a");
  assert.equal(result.next[0]?.outSeconds, 4);
  assert.equal(result.next[1]?.placementId, "p_a_right");
  assert.equal(result.next[1]?.inSeconds, 4);
  assert.equal(result.next[1]?.segmentId, result.next[0]?.segmentId);
  assert.equal(result.rightPlacementId, "p_a_right");
});

test("splitPlacementAtSourceSeconds returns null on missing placementId", () => {
  const placements = [buildPlacement()];
  const result = splitPlacementAtSourceSeconds(
    placements,
    "ghost",
    4,
    "p_new",
  );
  assert.equal(result, null);
});

test("splitPlacementAtSourceSeconds returns null when split point is too close to in", () => {
  const placements = [buildPlacement({ inSeconds: 0, outSeconds: 8 })];
  const result = splitPlacementAtSourceSeconds(
    placements,
    "p_1",
    0.05,
    "p_new",
  );
  assert.equal(result, null);
});

test("splitPlacementAtSourceSeconds returns null when split point is too close to out", () => {
  const placements = [buildPlacement({ inSeconds: 0, outSeconds: 8 })];
  const result = splitPlacementAtSourceSeconds(
    placements,
    "p_1",
    7.95,
    "p_new",
  );
  assert.equal(result, null);
});

test("splitPlacementAtSourceSeconds preserves all other placements untouched", () => {
  const placements = [
    buildPlacement({ placementId: "p_a", segmentId: "seg_a" }),
    buildPlacement({ placementId: "p_b", segmentId: "seg_b" }),
    buildPlacement({ placementId: "p_c", segmentId: "seg_c" }),
  ];
  const result = splitPlacementAtSourceSeconds(
    placements,
    "p_b",
    4,
    "p_b_right",
  );
  assert.ok(result);
  assert.equal(result.next.length, 4);
  assert.equal(result.next[0]?.placementId, "p_a");
  assert.equal(result.next[1]?.placementId, "p_b");
  assert.equal(result.next[2]?.placementId, "p_b_right");
  assert.equal(result.next[3]?.placementId, "p_c");
});

// ---------------------------------------------------------------------------
// insertPlacementAt
// ---------------------------------------------------------------------------

test("insertPlacementAt inserts at the given index", () => {
  const placements = [
    buildPlacement({ placementId: "p_a" }),
    buildPlacement({ placementId: "p_b" }),
  ];
  const next = insertPlacementAt(
    placements,
    1,
    buildPlacement({ placementId: "p_new" }),
  );
  assert.equal(next.length, 3);
  assert.equal(next[0]?.placementId, "p_a");
  assert.equal(next[1]?.placementId, "p_new");
  assert.equal(next[2]?.placementId, "p_b");
});

test("insertPlacementAt clamps a negative index to 0", () => {
  const next = insertPlacementAt(
    [buildPlacement({ placementId: "p_a" })],
    -5,
    buildPlacement({ placementId: "p_new" }),
  );
  assert.equal(next[0]?.placementId, "p_new");
});

test("insertPlacementAt clamps an out-of-bounds index to length", () => {
  const next = insertPlacementAt(
    [buildPlacement({ placementId: "p_a" })],
    50,
    buildPlacement({ placementId: "p_new" }),
  );
  assert.equal(next[next.length - 1]?.placementId, "p_new");
});

// ---------------------------------------------------------------------------
// computeDropInsertIndex
// ---------------------------------------------------------------------------

test("computeDropInsertIndex returns 0 when dropping before the first clip", () => {
  const layouts = [
    { startSeconds: 0, durationSeconds: 4 },
    { startSeconds: 4, durationSeconds: 4 },
  ];
  assert.equal(computeDropInsertIndex(layouts, 1), 0);
});

test("computeDropInsertIndex returns the middle index when dropping between two clips", () => {
  const layouts = [
    { startSeconds: 0, durationSeconds: 4 },
    { startSeconds: 4, durationSeconds: 4 },
  ];
  assert.equal(computeDropInsertIndex(layouts, 3.5), 1);
});

test("computeDropInsertIndex appends past the last clip's centre", () => {
  const layouts = [
    { startSeconds: 0, durationSeconds: 4 },
    { startSeconds: 4, durationSeconds: 4 },
  ];
  assert.equal(computeDropInsertIndex(layouts, 7), 2);
});

test("computeDropInsertIndex on empty layout returns 0", () => {
  assert.equal(computeDropInsertIndex([], 5), 0);
});

// ---------------------------------------------------------------------------
// generatePlacementId
// ---------------------------------------------------------------------------

test("generatePlacementId returns prefixed strings that are unique enough", () => {
  const ids = new Set<string>();
  for (let i = 0; i < 20; i += 1) {
    ids.add(generatePlacementId());
  }
  assert.equal(ids.size, 20);
  for (const id of ids) {
    assert.match(id, /^placement_/);
  }
});
