import assert from "node:assert/strict";
import test from "node:test";

import type { SeedanceSegment } from "../storyboard.types";

import {
  applyOutroOverrideToSegments,
  buildOutroPrompt,
  buildOutroReferences,
  FINAL_DISH_DESCRIPTION_MAX_CHARS,
  isOutroSegment,
  LICORN_OUTRO_ARC,
  LICORN_OUTRO_DURATION_SECONDS,
  LICORN_OUTRO_PROMPT_PLACEHOLDER,
  LICORN_OUTRO_REFERENCE_NAMES,
  resolveFinalDishDescriptionForOutro,
} from "./seedance-outro-template";

function makeSegment(partial: Partial<SeedanceSegment> = {}): SeedanceSegment {
  return {
    id: "seg-1",
    videoId: "video-1",
    position: 0,
    title: "Hook",
    arc: "hook_serve",
    mode: "References",
    logicalSceneIds: [],
    description: "",
    prompt: "agent-authored prompt",
    promptInitial: "agent-authored prompt",
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
    } as SeedanceSegment["qaChecklist"],
    durationTarget: 4,
    status: "pending",
    ...partial,
  };
}

test("buildOutroReferences returns the 5 canonical references in fixed order", () => {
  const refs = buildOutroReferences();

  assert.equal(refs.length, 5);
  assert.deepEqual(
    refs.map((reference) => reference.name),
    [
      LICORN_OUTRO_REFERENCE_NAMES.kitchenLayoutContextWide,
      LICORN_OUTRO_REFERENCE_NAMES.kitchenIslandDefault,
      LICORN_OUTRO_REFERENCE_NAMES.licornOutroVideo,
      LICORN_OUTRO_REFERENCE_NAMES.characterSheet,
      LICORN_OUTRO_REFERENCE_NAMES.finalDishVisual,
    ],
  );
  for (const reference of refs) {
    assert.equal(reference.required, true);
    assert.equal(reference.runwayUri, null);
    assert.equal(reference.mediaAssetId, null);
  }
});

test("buildOutroPrompt substitutes the dish description and references the 5 canonical assets", () => {
  const prompt = buildOutroPrompt({
    finalDishDescription:
      "a glossy plated paris-brest crowned with caramelized hazelnut praline",
  });

  assert.match(prompt, /paris-brest crowned with caramelized hazelnut praline/);
  for (const name of Object.values(LICORN_OUTRO_REFERENCE_NAMES)) {
    assert.match(prompt, new RegExp(`@${name}`));
  }
  assert.match(prompt, /5 seconds/);
  assert.match(prompt, /9:16/);
  assert.match(prompt, /no text/);
  assert.match(prompt, /no music/);
});

test("buildOutroPrompt collapses whitespace inside the dish description", () => {
  const prompt = buildOutroPrompt({
    finalDishDescription: "  glossy   paris-brest\n\twith praline  ",
  });

  assert.match(prompt, /glossy paris-brest with praline\./);
});

test("buildOutroPrompt rejects empty dish description", () => {
  assert.throws(
    () => buildOutroPrompt({ finalDishDescription: "   \n  " }),
    /non-empty single-sentence dish description/,
  );
});

test("buildOutroPrompt truncates unparseable descriptions longer than 280 chars", () => {
  const tooLong = "x".repeat(281);
  const prompt = buildOutroPrompt({ finalDishDescription: tooLong });
  assert.ok(prompt.length > 0);
});

test("resolveFinalDishDescriptionForOutro extracts dish identity from GPT-Image recipe_state boilerplate", () => {
  const raw =
    "Generate one vertical-reference still of the final Lemon Butter Orecchiette with Burrata in the Licorn kitchen on the light terrazzo island: one shallow hero bowl of glossy 2-3 cm orecchiette, one torn burrata with thick cream visible, generous roasted pistachio-caper-panko crunch, basil leaves, parmesan, black pepper and yellow lemon zest. The dish is intact and motionless, no utensil inside it, no spoon dive, no slice, no drip action. Keep it sexy, creamy, crunchy and high-contrast without changing the Licorn kitchen context.";

  const resolved = resolveFinalDishDescriptionForOutro(raw);

  assert.ok(resolved.length <= FINAL_DISH_DESCRIPTION_MAX_CHARS);
  assert.match(resolved, /Lemon Butter Orecchiette with Burrata/);
  assert.match(resolved, /orecchiette/);
  assert.doesNotMatch(resolved, /Generate one vertical-reference still/i);
  assert.doesNotMatch(resolved, /Keep it sexy/i);
});

test("applyOutroOverrideToSegments succeeds when FinalDishVisual prompt is a long GPT-Image generation block", () => {
  const longFinalDishPrompt =
    "Generate one vertical-reference still of the final Lemon Butter Orecchiette with Burrata in the Licorn kitchen on the light terrazzo island: one shallow hero bowl of glossy orecchiette and torn burrata. The dish is intact and motionless.";

  const result = applyOutroOverrideToSegments({
    segments: [
      makeSegment({
        id: "outro",
        arc: LICORN_OUTRO_ARC,
        prompt: LICORN_OUTRO_PROMPT_PLACEHOLDER,
      }),
    ],
    finalDishDescription: longFinalDishPrompt,
  });

  assert.deepEqual(result.errors, []);
  assert.match(result.segments[0].prompt, /Lemon Butter Orecchiette with Burrata/);
});

test("isOutroSegment matches the canonical arc, ignoring case and whitespace", () => {
  assert.equal(isOutroSegment({ arc: LICORN_OUTRO_ARC }), true);
  assert.equal(isOutroSegment({ arc: "  Licorn_Celebration_Outro  " }), true);
  assert.equal(isOutroSegment({ arc: "hook_serve" }), false);
  assert.equal(isOutroSegment({ arc: null }), false);
  assert.equal(isOutroSegment({}), false);
});

test("applyOutroOverrideToSegments rewrites prompt, references, duration, and arc on the outro", () => {
  const segments = [
    makeSegment({ id: "intro", position: 0, arc: "hook_serve" }),
    makeSegment({
      id: "outro",
      position: 1,
      arc: LICORN_OUTRO_ARC,
      prompt: LICORN_OUTRO_PROMPT_PLACEHOLDER,
      promptInitial: LICORN_OUTRO_PROMPT_PLACEHOLDER,
      durationTarget: 3,
    }),
  ];

  const result = applyOutroOverrideToSegments({
    segments,
    finalDishDescription: "a perfectly plated paris-brest",
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.segments.length, 2);

  const [intro, outro] = result.segments;
  assert.equal(intro.prompt, "agent-authored prompt");
  assert.equal(intro.arc, "hook_serve");

  assert.equal(outro.arc, LICORN_OUTRO_ARC);
  assert.equal(outro.durationTarget, LICORN_OUTRO_DURATION_SECONDS);
  assert.notEqual(outro.prompt, LICORN_OUTRO_PROMPT_PLACEHOLDER);
  assert.equal(outro.prompt, outro.promptInitial);
  assert.match(outro.prompt, /paris-brest/);
  assert.equal(outro.references.length, 5);
});

test("applyOutroOverrideToSegments emits an actionable error when finalDishDescription is missing", () => {
  const segments = [
    makeSegment({
      id: "outro",
      position: 0,
      arc: LICORN_OUTRO_ARC,
      prompt: LICORN_OUTRO_PROMPT_PLACEHOLDER,
    }),
  ];

  const result = applyOutroOverrideToSegments({
    segments,
    finalDishDescription: null,
  });

  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /FinalDishVisual/);
  assert.equal(result.segments[0].prompt, LICORN_OUTRO_PROMPT_PLACEHOLDER);
});

test("applyOutroOverrideToSegments does not touch segments whose arc is not the outro", () => {
  const segments = [
    makeSegment({ id: "a", arc: "hook_serve", position: 0 }),
    makeSegment({ id: "b", arc: "build_action", position: 1 }),
  ];

  const result = applyOutroOverrideToSegments({
    segments,
    finalDishDescription: "a paris-brest",
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.segments[0].arc, "hook_serve");
  assert.equal(result.segments[1].arc, "build_action");
});
