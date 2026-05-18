import assert from "node:assert/strict";
import test from "node:test";

import type { SeedanceSegment } from "../storyboard.types";

import {
  applyOutroOverrideToSegments,
  buildOutroPrompt,
  buildOutroReferences,
  isOutroSegment,
  LICORN_OUTRO_ARC,
  LICORN_OUTRO_DURATION_SECONDS,
  LICORN_OUTRO_PROMPT_PLACEHOLDER,
  LICORN_OUTRO_REFERENCE_NAMES,
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

test("buildOutroPrompt rejects descriptions longer than 280 chars", () => {
  const tooLong = "x".repeat(281);
  assert.throws(
    () => buildOutroPrompt({ finalDishDescription: tooLong }),
    /under 280/,
  );
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
