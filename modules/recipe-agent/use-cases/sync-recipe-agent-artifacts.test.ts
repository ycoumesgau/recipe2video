import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRecipeAgentArtifactSyncPlan,
  createArtifactContentHash,
} from "./sync-recipe-agent-artifacts";

const videoId = "video-1";

test("buildRecipeAgentArtifactSyncPlan validates and maps complete artifacts", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "recipe-analysis.json",
        JSON.stringify({
          recipe: {
            title: "Paris-Brest",
            sourceType: "text",
            ingredients: [],
            steps: [],
            subRecipes: ["praline"],
            assumptions: [],
            timing: null,
            criticalTransformations: [],
            visualTextureOpportunities: [],
            possibleHooks: [],
            promptPolicySources: [],
          },
          clarifyingQuestions: [],
        }),
      ),
      artifact(
        "logical-scenes.json",
        JSON.stringify({
          logicalScenes: Array.from({ length: 30 }, (_, index) => ({
            id: `scene-${index + 1}`,
            videoId,
            segmentId: null,
            position: index + 1,
            sceneType: index % 4 === 0 ? "context" : "detail",
            arc: "praline",
            description: `Scene ${index + 1}`,
            bg: "island_default",
            zoom: "macro",
            durationTarget: 2,
            note: null,
          })),
        }),
      ),
      artifact(
        "seedance-segments.json",
        JSON.stringify({
          seedanceSegments: Array.from({ length: 5 }, (_, index) => ({
            id: `segment-${index + 1}`,
            videoId,
            position: index + 1,
            title: `Segment ${index + 1}`,
            arc: "praline",
            mode: "References",
            logicalSceneIds: [`scene-${index + 1}`],
            description: `Segment ${index + 1}`,
            prompt: "Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
            promptInitial: "Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
            references: [
              {
                name: "KitchenIslandDefault",
                label: "KitchenIslandDefault",
                role: "global kitchen identity",
                required: true,
              },
            ],
            beats: ["caramel crack"],
            timing: ["0.0-1.0s: caramel crack"],
            continuity: "Opening segment.",
            risk: "Keep brittle caramel readable.",
            audioPrompt: "sharp crack",
            negatives: ["no text"],
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
            },
            durationTarget: 6,
            status: "ready",
          })),
        }),
      ),
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "kitchen",
              canonicalName: "KitchenIslandDefault",
              role: "global kitchen identity",
              priority: 1,
              source: "agent_reference_plan",
              usedInSegmentIds: ["segment-1"],
              status: "planned",
            },
          ],
        }),
      ),
      artifact("suno-prompt.md", "# Suno\n\nPrompt body"),
    ],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.artifactRecords.every((record) => record.validationStatus === "valid"), true);
  assert.equal(plan.recipePatch?.normalized?.title, "Paris-Brest");
  assert.equal(plan.logicalScenes.length, 30);
  assert.equal(plan.segments.length, 5);
  assert.equal(plan.referencesRaw.length, 1);
  assert.equal(plan.referencesRaw[0]?.canonicalName, "KitchenIslandDefault");
  assert.equal(plan.sunoPrompt, "# Suno\n\nPrompt body");
  assert.equal(plan.sunoPromptV2, null);
});

test("buildRecipeAgentArtifactSyncPlan maps valid suno-prompt.json to sunoPromptV2", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "suno-prompt.json",
        JSON.stringify({
          schemaVersion: 1,
          fields: {
            title: "Kitchen Glow",
            styleOfMusic: "Synth pop",
            excludeStyles: "Metal",
            autoLyricsPrompt: "Write about baking.",
            shortVersionPlan: "Use chorus for Reels.",
          },
        }),
      ),
    ],
  });

  assert.equal(plan.valid, true);
  assert.ok(plan.sunoPromptV2);
  assert.equal(plan.sunoPromptV2?.fields.title, "Kitchen Glow");
});

test("buildRecipeAgentArtifactSyncPlan invalid suno-prompt.json does not add blocking errors", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact("suno-prompt.json", "{not valid json"),
    ],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.sunoPromptV2, null);
  const record = plan.artifactRecords.find((r) => r.artifactName === "suno-prompt.json");
  assert.equal(record?.validationStatus, "invalid");
});

test("buildRecipeAgentArtifactSyncPlan rejects malformed suno-prompt.json schema without blocking errors", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [artifact("suno-prompt.json", JSON.stringify({ schemaVersion: 1 }))],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.sunoPromptV2, null);
  const record = plan.artifactRecords.find((r) => r.artifactName === "suno-prompt.json");
  assert.equal(record?.validationStatus, "invalid");
});

test("buildRecipeAgentArtifactSyncPlan accepts valid recipe-analysis alongside invalid suno JSON", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "recipe-analysis.json",
        JSON.stringify({
          recipe: {
            title: "Paris-Brest",
            sourceType: "text",
            ingredients: [],
            steps: [],
            subRecipes: [],
            assumptions: [],
            timing: null,
            criticalTransformations: [],
            visualTextureOpportunities: [],
            possibleHooks: [],
            promptPolicySources: [],
          },
          clarifyingQuestions: [],
        }),
      ),
      artifact("suno-prompt.json", JSON.stringify({ schemaVersion: 1 })),
    ],
  });

  assert.equal(plan.valid, true);
  assert.ok(plan.recipePatch);
  assert.equal(plan.sunoPromptV2, null);
});

test("buildRecipeAgentArtifactSyncPlan tolerates unknown keys on recipe-analysis.json", () => {
  // Regression test for the May 2026 sync drop: the Cursor agent started
  // adding harmless descriptive fields (`servings`, `difficulty`,
  // `stylePreset`, `productionDefaults`) to `recipe-analysis.json`. The strict
  // Zod schema marked the artifact invalid and aborted the whole sync,
  // leaving the project with zero logical scenes / segments / references in
  // the database even though every other artifact validated cleanly.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "recipe-analysis.json",
        JSON.stringify({
          recipe: {
            title: "Lasagne dumpling",
            sourceType: "url",
            sourceUrl: "https://example.test/recipe",
            servings: "4 portions",
            difficulty: "Facile",
            stylePreset: "asmr_food",
            productionDefaults: {
              videoModel: "seedance2",
              imageModelForReferenceGeneration: "gpt_image_2",
            },
            ingredients: [],
            steps: [],
            subRecipes: [],
            assumptions: [],
            timing: null,
            criticalTransformations: [],
            visualTextureOpportunities: [],
            possibleHooks: [],
            promptPolicySources: [],
          },
          clarifyingQuestions: [],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, true);
  assert.ok(plan.recipePatch);
  assert.equal(plan.recipePatch?.normalized?.title, "Lasagne dumpling");
  const record = plan.artifactRecords.find(
    (entry) => entry.artifactName === "recipe-analysis.json",
  );
  assert.equal(record?.validationStatus, "valid");
  assert.deepEqual(record?.validationErrors, []);
});

test("buildRecipeAgentArtifactSyncPlan keeps invalid artifacts out of sync plan", () => {
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact("recipe-analysis.json", "{}"),
      artifact("suno-prompt.md", "# still valid markdown"),
    ],
  });

  assert.equal(plan.valid, false);
  assert.equal(plan.recipePatch, null);
  const invalidRecord = plan.artifactRecords[0];
  assert.ok(invalidRecord);
  assert.equal(invalidRecord.validationStatus, "invalid");
  assert.match((invalidRecord.validationErrors ?? []).join(" "), /recipe/);
  assert.equal(plan.sunoPrompt, "# still valid markdown");
});

test("buildRecipeAgentArtifactSyncPlan rejects duplicate canonicalName entries in reference-plan.json", () => {
  // Regression test for the deduplication invariant: the agent must declare
  // each canonical asset ONCE and reuse it via usedInSegmentIds[]. Without
  // this guarantee the sync would happily insert N copies of
  // `KitchenIslandDefault` into reference_assets, one per segment.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "kitchen",
              canonicalName: "KitchenIslandDefault",
              role: "global kitchen identity",
              usedInSegmentIds: ["segment-1"],
            },
            {
              type: "kitchen",
              canonicalName: "KitchenIslandDefault",
              role: "global kitchen identity (duplicate)",
              usedInSegmentIds: ["segment-2"],
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, false);
  assert.equal(plan.referencesRaw.length, 0);
  const invalidRecord = plan.artifactRecords[0];
  assert.ok(invalidRecord);
  assert.equal(invalidRecord.validationStatus, "invalid");
  assert.match(
    (invalidRecord.validationErrors ?? []).join(" "),
    /Duplicate reference canonicalName/,
  );
});

test("buildRecipeAgentArtifactSyncPlan accepts case-insensitive duplicate detection", () => {
  // The agent has historically mixed casings (e.g. `kitchenIslandDefault` vs
  // `KitchenIslandDefault`). The Zod superRefine normalizes via
  // `.trim().toLowerCase()` so both forms collide as expected.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "kitchen",
              canonicalName: "KitchenIslandDefault",
              role: "global kitchen identity",
            },
            {
              type: "kitchen",
              canonicalName: "kitchenislanddefault",
              role: "global kitchen identity (lowercased)",
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, false);
});

test("buildRecipeAgentArtifactSyncPlan accepts reference-plan.json entries with conditioningReferences", () => {
  // Recipe-specific references must be able to declare which library
  // globals they want as visual anchors for GPT-Image 2. The sync schema
  // accepts the new field as a strict array of canonical names.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "recipe_state",
              canonicalName: "FinishedDumplingLasagnaCutaway",
              role: "finished compact dumpling-lasagna top and cutaway geometry",
              priority: 1,
              usedInSegmentIds: ["segment-01", "segment-07", "segment-08"],
              prompt: "Steamed dumpling lasagna…",
              conditioningReferences: [
                "KitchenIslandDefault",
                "SquareBakingDish",
                "Character-sheet",
                "Spatula",
              ],
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.referencesRaw.length, 1);
  assert.deepEqual(plan.referencesRaw[0]?.conditioningReferences, [
    "KitchenIslandDefault",
    "SquareBakingDish",
    "Character-sheet",
    "Spatula",
  ]);
});

test("buildRecipeAgentArtifactSyncPlan still accepts entries without conditioningReferences", () => {
  // Library globals do not need conditioning (they are not generated
  // through GPT-Image 2), and legacy plans should keep working.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "kitchen",
              canonicalName: "KitchenIslandDefault",
              role: "global kitchen identity",
              usedInSegmentIds: ["segment-1"],
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, true);
  assert.equal(plan.referencesRaw.length, 1);
  assert.equal(plan.referencesRaw[0]?.conditioningReferences, undefined);
});

test("buildRecipeAgentArtifactSyncPlan rejects non-string conditioningReferences entries", () => {
  // A typo in the agent's plan (object instead of string) must fail
  // validation rather than be silently dropped; the operator needs to know
  // their anchor list will not work.
  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "recipe_state",
              canonicalName: "FinishedDish",
              role: "finished plating",
              prompt: "Plating shot",
              conditioningReferences: [
                "KitchenIslandDefault",
                { canonical: "WrongShape" } as unknown as string,
              ],
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, false);
  assert.equal(plan.referencesRaw.length, 0);
});

test("buildRecipeAgentArtifactSyncPlan rewrites the outro segment with the canonical Licorn template", () => {
  // The agent only emits a placeholder for the outro segment
  // (`prompt: "<APP_OVERRIDE>"`) and the app injects the real prompt +
  // references at sync time. The dish description is sourced from
  // `reference-plan.json[FinalDishVisual].prompt` so the outro is
  // grounded on the same artwork as the rest of the storyboard.
  const buildAgentSegment = (index: number) => ({
    id: `segment-${index + 1}`,
    videoId,
    position: index + 1,
    title: `Segment ${index + 1}`,
    arc: "build_action",
    mode: "References" as const,
    logicalSceneIds: [`scene-${index + 1}`],
    description: `Segment ${index + 1}`,
    prompt:
      "Use @KitchenIslandDefault as global kitchen. Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
    promptInitial:
      "Use @KitchenIslandDefault as global kitchen. Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
    references: [
      {
        name: "KitchenIslandDefault",
        label: "KitchenIslandDefault",
        role: "global kitchen identity",
        required: true,
      },
    ],
    beats: ["beat"],
    timing: ["0.0-1.0s: action"],
    continuity: "stable",
    risk: "n/a",
    audioPrompt: "ambience",
    negatives: ["no text"],
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
    },
    durationTarget: 5,
    status: "ready" as const,
  });

  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "seedance-segments.json",
        JSON.stringify({
          seedanceSegments: [
            ...Array.from({ length: 4 }, (_, index) => buildAgentSegment(index)),
            {
              id: "segment-outro",
              videoId,
              position: 5,
              title: "Outro",
              arc: "licorn_celebration_outro",
              mode: "References",
              logicalSceneIds: ["scene-outro"],
              description: "Standardized Licorn celebration outro.",
              prompt: "<APP_OVERRIDE>",
              promptInitial: "<APP_OVERRIDE>",
              references: [
                {
                  name: "KitchenLayoutContextWide",
                  label: "KitchenLayoutContextWide",
                  role: "structural kitchen context",
                  required: true,
                },
                {
                  name: "KitchenIslandDefault",
                  label: "KitchenIslandDefault",
                  role: "active hero island view",
                  required: true,
                },
                {
                  name: "LicornOutroVideo",
                  label: "LicornOutroVideo",
                  role: "Licorn celebration motion reference",
                  required: true,
                },
                {
                  name: "CharacterSheet",
                  label: "CharacterSheet",
                  role: "Licorn character identity lock",
                  required: true,
                },
                {
                  name: "FinalDishVisual",
                  label: "FinalDishVisual",
                  role: "finished dish identity",
                  required: true,
                },
              ],
              beats: ["explosion of joy"],
              timing: ["0.0-1.0s calm", "1.0-5.0s explosion"],
              continuity: "Dish stays untouched.",
              risk: "Keep dish identical to N-1.",
              audioPrompt: "soft whoosh + tada",
              negatives: ["no text"],
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
              },
              durationTarget: 5,
              status: "ready",
            },
          ],
        }),
      ),
      artifact(
        "reference-plan.json",
        JSON.stringify({
          references: [
            {
              type: "recipe_state",
              canonicalName: "FinalDishVisual",
              role: "finished dish identity",
              priority: 1,
              usedInSegmentIds: ["segment-outro"],
              prompt:
                "a glossy plated paris-brest crowned with caramelized hazelnut praline",
            },
          ],
        }),
      ),
    ],
  });

  assert.deepEqual(plan.errors, []);
  assert.equal(plan.valid, true);
  assert.equal(plan.segments.length, 5);

  const outro = plan.segments[4];
  assert.equal(outro.arc, "licorn_celebration_outro");
  assert.equal(outro.durationTarget, 5);
  assert.notEqual(outro.prompt, "<APP_OVERRIDE>");
  assert.equal(outro.prompt, outro.promptInitial);
  assert.match(outro.prompt, /paris-brest crowned with caramelized hazelnut praline/);
  assert.equal(outro.references.length, 5);
  assert.deepEqual(
    outro.references.map((reference) => reference.name),
    [
      "KitchenLayoutContextWide",
      "KitchenIslandDefault",
      "LicornOutroVideo",
      "CharacterSheet",
      "FinalDishVisual",
    ],
  );
});

test("buildRecipeAgentArtifactSyncPlan emits an actionable error when outro is declared without FinalDishVisual", () => {
  const buildAgentSegment = (index: number) => ({
    id: `segment-${index + 1}`,
    videoId,
    position: index + 1,
    title: `Segment ${index + 1}`,
    arc: "build_action",
    mode: "References" as const,
    logicalSceneIds: [`scene-${index + 1}`],
    description: `Segment ${index + 1}`,
    prompt:
      "Use @KitchenIslandDefault as global kitchen. Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
    promptInitial:
      "Use @KitchenIslandDefault as global kitchen. Generate exactly 2 short shots with hard cuts. Mandatory timing: 0.0-1.0s action. no speech, no voiceover, no music.",
    references: [
      {
        name: "KitchenIslandDefault",
        label: "KitchenIslandDefault",
        role: "global kitchen identity",
        required: true,
      },
    ],
    beats: ["beat"],
    timing: ["0.0-1.0s: action"],
    continuity: "stable",
    risk: "n/a",
    audioPrompt: "ambience",
    negatives: ["no text"],
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
    },
    durationTarget: 5,
    status: "ready" as const,
  });

  const plan = buildRecipeAgentArtifactSyncPlan({
    videoId,
    artifacts: [
      artifact(
        "seedance-segments.json",
        JSON.stringify({
          seedanceSegments: [
            ...Array.from({ length: 4 }, (_, index) => buildAgentSegment(index)),
            {
              id: "segment-outro",
              videoId,
              position: 5,
              title: "Outro",
              arc: "licorn_celebration_outro",
              mode: "References",
              logicalSceneIds: ["scene-outro"],
              description: "Standardized Licorn celebration outro.",
              prompt: "<APP_OVERRIDE>",
              promptInitial: "<APP_OVERRIDE>",
              references: [
                {
                  name: "KitchenIslandDefault",
                  label: "KitchenIslandDefault",
                  role: "active hero island view",
                  required: true,
                },
              ],
              beats: ["explosion"],
              timing: ["0-5s"],
              continuity: "stable dish",
              risk: "n/a",
              audioPrompt: "tada",
              negatives: ["no text"],
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
              },
              durationTarget: 5,
              status: "ready",
            },
          ],
        }),
      ),
    ],
  });

  assert.equal(plan.valid, false);
  assert.match(plan.errors.join("\n"), /FinalDishVisual/);
});

test("createArtifactContentHash is stable for unchanged content", () => {
  assert.equal(
    createArtifactContentHash("same content"),
    createArtifactContentHash("same content"),
  );
  assert.notEqual(
    createArtifactContentHash("same content"),
    createArtifactContentHash("changed content"),
  );
});

function artifact(name: string, content: string) {
  return {
    name,
    path: `agent-recipes/${videoId}/${name}`,
    content,
  };
}
