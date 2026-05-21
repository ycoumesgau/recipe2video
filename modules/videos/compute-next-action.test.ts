import assert from "node:assert/strict";
import test from "node:test";

import { computeNextAction } from "./compute-next-action";
import type { VideoProject } from "./video.types";

function baseProject(overrides: Partial<VideoProject> = {}): VideoProject {
  return {
    id: "video-1",
    title: "Test",
    slug: "test",
    recipeUrl: null,
    recipeData: null,
    status: "draft",
    storyboard: null,
    seedanceSegments: null,
    selectedVideoModel: "seedance2",
    selectedImageModel: "gpt_image_2",
    selectedTtsModel: "eleven_multilingual_v2",
    selectedSfxModel: "eleven_text_to_sound_v2",
    totalCostCredits: 0,
    totalCostOpenai: 0,
    createdBy: null,
    createdAt: "2026-05-10T00:00:00.000Z",
    updatedAt: "2026-05-10T00:00:00.000Z",
    ...overrides,
  };
}

test("computeNextAction suggests assembly when exported", () => {
  const action = computeNextAction({
    project: baseProject({ status: "exported" }),
    acceptedCount: 7,
    totalCount: 7,
  });

  assert.equal(action.cta, "Open assembly");
  assert.equal(action.href, "/videos/video-1/assembly");
});

test("computeNextAction suggests storyboard when clarification is needed", () => {
  const action = computeNextAction({
    project: baseProject({ status: "clarification_needed" }),
    acceptedCount: 0,
    totalCount: 7,
  });

  assert.equal(action.cta, "Open storyboard");
  assert.equal(action.href, "/videos/video-1/storyboard");
});

test("computeNextAction surfaces segment review during review status", () => {
  const action = computeNextAction({
    project: baseProject({ status: "review" }),
    acceptedCount: 3,
    totalCount: 8,
  });

  assert.equal(action.cta, "Open segments");
  assert.match(action.detail, /3\/8 accepted/);
});
