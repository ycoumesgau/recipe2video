import assert from "node:assert/strict";
import test from "node:test";

import { buildRemotionProps } from "../build-remotion-props";

const baseSegment = {
  placementId: "p_1",
  segmentId: "seg_1",
  mediaAssetId: "asset_v",
  generationId: null,
  title: "S1",
  durationSeconds: 5,
  sourceUrl: "https://example.com/v.mp4",
  storageBucket: "accepted_clips",
  storagePath: "v.mp4",
  position: 0,
  inSeconds: 0,
  outSeconds: 5,
  volume: 1,
  playbackRate: 1,
};

const baseAudioTrack = {
  mediaAssetId: "asset_audio",
  title: "Suno",
  sourceUrl: "https://example.com/a.mp3",
  durationSeconds: 30,
};

test("buildRemotionProps omits audio when there are no audio clips", () => {
  const props = buildRemotionProps({
    segments: [baseSegment],
    audioTrack: baseAudioTrack,
    audioClips: [],
  });

  assert.equal(props.audio, null);
  assert.equal(props.audioClips.length, 0);
});

test("buildRemotionProps keeps audio when clips are on the timeline", () => {
  const props = buildRemotionProps({
    segments: [baseSegment],
    audioTrack: baseAudioTrack,
    audioClips: [
      {
        id: "c1",
        mediaAssetId: "asset_audio",
        startOnTimelineSeconds: 0,
        inSeconds: 0,
        outSeconds: 30,
        volume: 1,
        fadeInSeconds: 0,
        fadeOutSeconds: 0,
      },
    ],
  });

  assert.equal(props.audio?.mediaAssetId, "asset_audio");
  assert.equal(props.audioClips.length, 1);
});
