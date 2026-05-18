import assert from "node:assert/strict";
import test, { mock } from "node:test";

import {
  buildExtractedFrameStoragePath,
  buildMuxThumbnailUrl,
  EXTRACTED_FRAME_DEFAULT_HEIGHT,
  EXTRACTED_FRAME_DEFAULT_WIDTH,
  EXTRACTED_FRAME_MIME_TYPE,
  EXTRACTED_FRAME_STORAGE_BUCKET,
  fetchMuxThumbnail,
  MuxThumbnailFetchError,
} from "./frame-extraction.service";

test("buildMuxThumbnailUrl encodes the playback id and the timestamp/size params", () => {
  const url = buildMuxThumbnailUrl({
    muxPlaybackId: "abc123",
    timestampSeconds: 1.25,
  });

  const parsed = new URL(url);
  assert.equal(parsed.host, "image.mux.com");
  assert.equal(parsed.pathname, "/abc123/thumbnail.png");
  assert.equal(parsed.searchParams.get("time"), "1.25");
  assert.equal(parsed.searchParams.get("width"), String(EXTRACTED_FRAME_DEFAULT_WIDTH));
  assert.equal(parsed.searchParams.get("height"), String(EXTRACTED_FRAME_DEFAULT_HEIGHT));
});

test("buildMuxThumbnailUrl honors width and height overrides", () => {
  const url = buildMuxThumbnailUrl({
    muxPlaybackId: "abc",
    timestampSeconds: 2,
    width: 540,
    height: 960,
  });

  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("width"), "540");
  assert.equal(parsed.searchParams.get("height"), "960");
});

test("buildMuxThumbnailUrl clamps negative timestamps to 0 (no Mux 412 from bad time)", () => {
  const url = buildMuxThumbnailUrl({
    muxPlaybackId: "abc",
    timestampSeconds: -3,
  });

  assert.equal(new URL(url).searchParams.get("time"), "0");
});

test("buildExtractedFrameStoragePath nests under the videoId/segmentId with a normalized timestamp", () => {
  const path = buildExtractedFrameStoragePath({
    videoId: "v1",
    sourceSegmentId: "s1",
    timestampSeconds: 2.5,
  });
  assert.equal(path, "v1/extracted-frames/s1/2_50.png");
});

test("buildExtractedFrameStoragePath clamps negative timestamps", () => {
  const path = buildExtractedFrameStoragePath({
    videoId: "v1",
    sourceSegmentId: "s1",
    timestampSeconds: -1,
  });
  assert.equal(path, "v1/extracted-frames/s1/0_00.png");
});

test("EXTRACTED_FRAME_* constants are stable so reference resolution can rely on them", () => {
  assert.equal(EXTRACTED_FRAME_MIME_TYPE, "image/png");
  assert.equal(typeof EXTRACTED_FRAME_STORAGE_BUCKET, "string");
  assert.ok(EXTRACTED_FRAME_STORAGE_BUCKET.length > 0);
});

test("fetchMuxThumbnail returns the buffer on first 200 OK", async () => {
  const png = new Uint8Array([1, 2, 3, 4]);
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: unknown) => {
    calls.push(String(input));
    return new Response(png, {
      status: 200,
      headers: { "content-type": "image/png" },
    });
  }) as typeof fetch;

  try {
    const result = await fetchMuxThumbnail({
      muxPlaybackId: "abc",
      timestampSeconds: 1,
    });
    assert.equal(calls.length, 1);
    assert.deepEqual(Array.from(result.buffer), Array.from(png));
    assert.match(result.thumbnailUrl, /thumbnail\.png/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchMuxThumbnail retries through transient 412s, then resolves once Mux primes the playback id", async () => {
  // Mux thumbnails are eventually consistent for the first few seconds
  // after an asset upload, so the service backs off with setTimeout.
  // We use Node's mock timers so the retry is exercised without
  // actually sleeping. We loop draining microtasks and ticking the
  // clock until the promise settles, which makes the test order-
  // independent.
  mock.timers.enable({ apis: ["setTimeout"] });
  const png = new Uint8Array([9, 8, 7]);
  let attempt = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    attempt += 1;
    if (attempt === 1) {
      return new Response("not ready", { status: 412 });
    }
    return new Response(png, { status: 200 });
  }) as typeof fetch;

  try {
    let settled: { ok: true; value: { buffer: Buffer } } | { ok: false; error: unknown } | null =
      null;
    fetchMuxThumbnail({ muxPlaybackId: "abc", timestampSeconds: 1 }).then(
      (value) => {
        settled = { ok: true, value };
      },
      (error) => {
        settled = { ok: false, error };
      },
    );

    for (let i = 0; i < 50 && settled === null; i += 1) {
      await Promise.resolve();
      mock.timers.runAll();
    }

    assert.ok(settled, "fetchMuxThumbnail should settle within the test budget");
    assert.equal((settled as { ok: boolean }).ok, true);
    const value = (settled as { ok: true; value: { buffer: Buffer } }).value;
    assert.deepEqual(Array.from(value.buffer), Array.from(png));
    assert.equal(attempt, 2);
  } finally {
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  }
});

test("fetchMuxThumbnail surfaces a MuxThumbnailFetchError with the upstream status after exhausting retries", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = (async () => {
    attempts += 1;
    return new Response("missing", { status: 404 });
  }) as typeof fetch;

  try {
    let settled: { ok: true } | { ok: false; error: unknown } | null = null;
    fetchMuxThumbnail({ muxPlaybackId: "abc", timestampSeconds: 1 }).then(
      () => {
        settled = { ok: true };
      },
      (error) => {
        settled = { ok: false, error };
      },
    );

    for (let i = 0; i < 50 && settled === null; i += 1) {
      await Promise.resolve();
      mock.timers.runAll();
    }

    assert.ok(settled);
    assert.equal((settled as { ok: boolean }).ok, false);
    const error = (settled as { ok: false; error: unknown }).error;
    assert.ok(error instanceof MuxThumbnailFetchError);
    assert.equal((error as MuxThumbnailFetchError).status, 404);
    assert.ok(attempts >= 2, "fetchMuxThumbnail should retry transient errors");
  } finally {
    globalThis.fetch = originalFetch;
    mock.timers.reset();
  }
});
