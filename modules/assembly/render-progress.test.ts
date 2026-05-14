import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  computeRenderProgressDisplay,
  formatDurationSeconds,
  readRenderProgress,
  serializeRenderProgress,
  type RenderProgress,
} from "./render-progress";

test("readRenderProgress returns null for unknown shapes", () => {
  assert.equal(readRenderProgress(null), null);
  assert.equal(readRenderProgress(undefined), null);
  assert.equal(readRenderProgress({}), null);
  assert.equal(readRenderProgress({ schema: "other_v1" }), null);
  assert.equal(
    readRenderProgress({ schema: "render_progress_v1", phase: "unknown" }),
    null,
  );
  assert.equal(
    readRenderProgress({ schema: "render_progress_v1", phase: "rendering" }),
    null,
    "missing updatedAt rejected",
  );
});

test("readRenderProgress accepts a minimal valid row", () => {
  const got = readRenderProgress({
    schema: "render_progress_v1",
    phase: "rendering",
    renderedFrames: 100,
    totalFrames: 200,
    encodedFrames: 80,
    sandboxId: "sbx_test",
    sandboxStartedAt: "2026-05-14T03:00:00.000Z",
    renderStartedAt: "2026-05-14T03:01:00.000Z",
    updatedAt: "2026-05-14T03:01:30.000Z",
  });
  assert.deepEqual(got, {
    schema: "render_progress_v1",
    phase: "rendering",
    renderedFrames: 100,
    totalFrames: 200,
    encodedFrames: 80,
    sandboxId: "sbx_test",
    sandboxStartedAt: "2026-05-14T03:00:00.000Z",
    renderStartedAt: "2026-05-14T03:01:00.000Z",
    updatedAt: "2026-05-14T03:01:30.000Z",
  });
});

test("serializeRenderProgress round-trips through readRenderProgress", () => {
  const input: RenderProgress = {
    schema: "render_progress_v1",
    phase: "npm_install",
    sandboxId: "sbx_abc",
    sandboxStartedAt: "2026-05-14T03:00:00.000Z",
    updatedAt: "2026-05-14T03:00:10.000Z",
  };
  const back = readRenderProgress(serializeRenderProgress(input));
  assert.equal(back?.phase, "npm_install");
  assert.equal(back?.sandboxId, "sbx_abc");
  assert.equal(back?.renderedFrames, null);
});

test("computeRenderProgressDisplay reports cumulative weight outside rendering", () => {
  const now = new Date("2026-05-14T03:00:30.000Z");
  const got = computeRenderProgressDisplay(
    {
      schema: "render_progress_v1",
      phase: "npm_install",
      sandboxStartedAt: "2026-05-14T03:00:00.000Z",
      updatedAt: "2026-05-14T03:00:25.000Z",
    },
    now,
  );
  // starting (0.02) + dnf_install (0.08) = 0.10 → cumulative start of npm_install
  assert.equal(got.percent, 10);
  assert.equal(got.etaSeconds, null);
  assert.equal(got.isStale, false);
});

test("computeRenderProgressDisplay computes fps and ETA during rendering", () => {
  const renderStarted = "2026-05-14T03:00:00.000Z";
  const now = new Date("2026-05-14T03:00:10.000Z");
  const got = computeRenderProgressDisplay(
    {
      schema: "render_progress_v1",
      phase: "rendering",
      renderedFrames: 200,
      totalFrames: 1000,
      encodedFrames: 180,
      sandboxStartedAt: "2026-05-14T02:59:00.000Z",
      renderStartedAt: renderStarted,
      updatedAt: "2026-05-14T03:00:09.000Z",
    },
    now,
  );
  // 200 frames over 10 s = 20 fps
  assert.equal(Math.round(got.fps ?? 0), 20);
  // 800 remaining frames / 20 fps = 40 s
  assert.equal(Math.round(got.etaSeconds ?? 0), 40);
  // base 0.40 (starting+dnf+npm+bundle) + rendering 0.55 * 0.2 = 0.51
  assert.equal(got.percent, 51);
});

test("computeRenderProgressDisplay flags stale rows after 60s of silence", () => {
  const now = new Date("2026-05-14T03:05:00.000Z");
  const got = computeRenderProgressDisplay(
    {
      schema: "render_progress_v1",
      phase: "rendering",
      renderedFrames: 100,
      totalFrames: 1000,
      sandboxStartedAt: "2026-05-14T03:00:00.000Z",
      renderStartedAt: "2026-05-14T03:01:00.000Z",
      updatedAt: "2026-05-14T03:03:00.000Z",
    },
    now,
  );
  assert.equal(got.isStale, true);
});

test("formatDurationSeconds prints mm:ss and h:mm:ss", () => {
  assert.equal(formatDurationSeconds(null), "--:--");
  assert.equal(formatDurationSeconds(Number.NaN), "--:--");
  assert.equal(formatDurationSeconds(0), "00:00");
  assert.equal(formatDurationSeconds(9), "00:09");
  assert.equal(formatDurationSeconds(65), "01:05");
  assert.equal(formatDurationSeconds(3675), "1:01:15");
});
