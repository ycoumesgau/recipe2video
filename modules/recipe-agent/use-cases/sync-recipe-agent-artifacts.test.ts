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
