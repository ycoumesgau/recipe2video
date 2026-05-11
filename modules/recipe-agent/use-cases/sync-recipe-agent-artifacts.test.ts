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
