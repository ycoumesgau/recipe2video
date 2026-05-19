import assert from "node:assert/strict";
import test from "node:test";

import {
  SongCoverPlanSchema,
  isCanvasPromptMissingLoopInstruction,
} from "./song-cover-plan.schema";

function basePlan() {
  return {
    schemaVersion: 1 as const,
    albumCover: {
      prompt:
        "Square 1:1 album cover. Use @CharacterSheet to lock the 2D mascot identity. Use @KitchenIslandDefault as background. Use @FilledCrownFrame as the hero foreground dish. No text on artwork. No logo. No URL.",
      conditioningReferences: [
        "KitchenIslandDefault",
        "CharacterSheet",
        "FilledCrownFrame",
      ],
    },
    spotifyCanvas: {
      prompt:
        "Vertical 9:16 food-porn loop, 5 seconds. The first frame and the last frame must be visually identical to @FilledCrownFrame for a seamless loop. Use @KitchenIslandDefault and @CharacterSheet to lock the kitchen and the mascot.",
      imageReferences: [
        "KitchenIslandDefault",
        "CharacterSheet",
        "FilledCrownFrame",
      ],
      videoReferences: [],
      loopAnchorReferenceName: "FilledCrownFrame",
      durationSeconds: 5,
      mascotAppearanceMode: "discrete_gesture" as const,
    },
    qualityChecks: {
      noTextOnScreen: true,
      noLogoOrUrl: true,
      noLipsyncToMusic: true,
      mascotAppearsAtLeastOnce: true,
      loopAnchorIsAlsoInImageReferences: true,
      durationWithinSpotifyWindow: true,
    },
  };
}

test("SongCoverPlanSchema accepts a happy-path plan", () => {
  const parsed = SongCoverPlanSchema.parse(basePlan());
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.spotifyCanvas.durationSeconds, 5);
});

test("SongCoverPlanSchema rejects schemaVersion != 1", () => {
  const plan = { ...basePlan(), schemaVersion: 2 };
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects an empty prompt on the album cover", () => {
  const plan = basePlan();
  plan.albumCover.prompt = "short";
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects a duration below the Spotify window", () => {
  const plan = basePlan();
  plan.spotifyCanvas.durationSeconds = 4;
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects a duration above the Spotify window", () => {
  const plan = basePlan();
  plan.spotifyCanvas.durationSeconds = 10;
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects non-integer durations", () => {
  const plan = basePlan();
  plan.spotifyCanvas.durationSeconds = 5.5;
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects a loop anchor missing from imageReferences", () => {
  const plan = basePlan();
  plan.spotifyCanvas.loopAnchorReferenceName = "SomeOtherFrame";
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
  if (!result.success) {
    const issue = result.error.issues.find(
      (i) => i.path.join(".") === "spotifyCanvas.loopAnchorReferenceName",
    );
    assert.ok(issue, "Expected an issue at spotifyCanvas.loopAnchorReferenceName");
    assert.match(issue.message, /must also appear in imageReferences/i);
  }
});

test("SongCoverPlanSchema rejects more than 9 image references", () => {
  const plan = basePlan() as ReturnType<typeof basePlan> & {
    spotifyCanvas: {
      imageReferences: string[];
      loopAnchorReferenceName: string;
    };
  };
  plan.spotifyCanvas.imageReferences = Array.from(
    { length: 10 },
    (_, i) => `Ref${i}`,
  );
  plan.spotifyCanvas.loopAnchorReferenceName = "Ref0";
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects more than 3 video references", () => {
  const plan = basePlan();
  (plan.spotifyCanvas as { videoReferences: string[] }).videoReferences = [
    "VideoA",
    "VideoB",
    "VideoC",
    "VideoD",
  ];
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects more than 16 cover conditioning references", () => {
  const plan = basePlan() as ReturnType<typeof basePlan> & {
    albumCover: { conditioningReferences: string[] };
  };
  plan.albumCover.conditioningReferences = Array.from(
    { length: 17 },
    (_, i) => `Ref${i}`,
  );
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects unknown mascot appearance modes", () => {
  const plan = basePlan() as Record<string, unknown>;
  (plan.spotifyCanvas as Record<string, unknown>).mascotAppearanceMode =
    "moonwalk";
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("SongCoverPlanSchema rejects extra unknown fields (strict)", () => {
  const plan = basePlan() as Record<string, unknown>;
  (plan.albumCover as Record<string, unknown>).rogueField = "nope";
  const result = SongCoverPlanSchema.safeParse(plan);
  assert.equal(result.success, false);
});

test("isCanvasPromptMissingLoopInstruction returns false on a well-formed prompt", () => {
  const prompt =
    "Vertical 9:16 loop, the first frame and last frame must be visually identical to @FilledCrownFrame for a seamless loop.";
  assert.equal(
    isCanvasPromptMissingLoopInstruction(prompt, "FilledCrownFrame"),
    false,
  );
});

test("isCanvasPromptMissingLoopInstruction warns when the anchor is not mentioned", () => {
  const prompt =
    "Vertical 9:16 loop, the first frame and last frame must be visually identical to the kitchen for a seamless loop.";
  assert.equal(
    isCanvasPromptMissingLoopInstruction(prompt, "FilledCrownFrame"),
    true,
  );
});

test("isCanvasPromptMissingLoopInstruction warns when no loop keyword is present", () => {
  const prompt =
    "Vertical 9:16, use @FilledCrownFrame as the kitchen island background.";
  assert.equal(
    isCanvasPromptMissingLoopInstruction(prompt, "FilledCrownFrame"),
    true,
  );
});
