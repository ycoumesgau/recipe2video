import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MAX_SUNO_AUDIO_BYTES,
  validateSunoAudioDescriptor,
} from "./suno-audio-upload-validation";

test("validateSunoAudioDescriptor accepts mp3 under size limit", () => {
  assert.doesNotThrow(() =>
    validateSunoAudioDescriptor({
      name: "track.mp3",
      size: 28 * 1024 * 1024,
      type: "audio/mpeg",
    }),
  );
});

test("validateSunoAudioDescriptor rejects files over 50 MB", () => {
  assert.throws(
    () =>
      validateSunoAudioDescriptor({
        name: "track.mp3",
        size: MAX_SUNO_AUDIO_BYTES + 1,
        type: "audio/mpeg",
      }),
    /50 MB/,
  );
});

test("validateSunoAudioDescriptor rejects unknown extensions", () => {
  assert.throws(
    () =>
      validateSunoAudioDescriptor({
        name: "track.ogg",
        size: 1024,
        type: "",
      }),
    /MP3, WAV, AAC, or FLAC/,
  );
});
