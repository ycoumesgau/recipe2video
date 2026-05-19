import assert from "node:assert/strict";
import test from "node:test";

import type { LogicalScene } from "../storyboard.types";
import {
  buildSegmentLabelByPersistedSceneId,
  extractPositionFromAgentSceneId,
  listLogicalScenesForSegment,
  resolvePersistedLogicalSceneIds,
} from "./resolve-logical-scene-ids";

function scene(position: number, id: string): LogicalScene {
  return {
    id,
    videoId: "video-1",
    position,
    sceneType: "detail",
    arc: "arc",
    description: `Scene ${position}`,
  };
}

test("extractPositionFromAgentSceneId parses common agent id formats", () => {
  assert.equal(extractPositionFromAgentSceneId("scene-1"), 1);
  assert.equal(extractPositionFromAgentSceneId("scene-12"), 12);
  assert.equal(extractPositionFromAgentSceneId("demo-scene-01"), 1);
  assert.equal(extractPositionFromAgentSceneId("video-abc-scene-05"), 5);
  assert.equal(extractPositionFromAgentSceneId("not-a-scene"), null);
});

test("resolvePersistedLogicalSceneIds maps agent ids to db uuids by position", () => {
  const persisted = [scene(1, "db-1"), scene(2, "db-2"), scene(3, "db-3")];
  const agentScenePositionById = new Map([
    ["scene-1", 1],
    ["scene-2", 2],
    ["scene-3", 3],
  ]);

  const resolved = resolvePersistedLogicalSceneIds({
    agentSceneIds: ["scene-1", "scene-2", "scene-3"],
    persistedScenes: persisted,
    agentScenePositionById,
  });

  assert.deepEqual(resolved, ["db-1", "db-2", "db-3"]);
});

test("buildSegmentLabelByPersistedSceneId labels scenes from agent segment mapping", () => {
  const persisted = [scene(1, "db-1"), scene(2, "db-2")];
  const labels = buildSegmentLabelByPersistedSceneId(
    [{ position: 2, logicalSceneIds: ["scene-1", "scene-2"] }],
    persisted,
    new Map([
      ["scene-1", 1],
      ["scene-2", 2],
    ]),
  );

  assert.equal(labels.get("db-1"), "S2");
  assert.equal(labels.get("db-2"), "S2");
});

test("listLogicalScenesForSegment returns scenes in segment order", () => {
  const persisted = [scene(1, "db-1"), scene(2, "db-2")];
  const included = listLogicalScenesForSegment(
    { logicalSceneIds: ["demo-scene-02", "demo-scene-01"] },
    persisted,
  );

  assert.deepEqual(
    included.map((item) => item.position),
    [2, 1],
  );
});
