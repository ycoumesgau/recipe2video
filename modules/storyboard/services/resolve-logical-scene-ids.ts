import { isOutroSegment } from "./seedance-outro-template";
import type { LogicalScene } from "../storyboard.types";

const OUTRO_PLACEHOLDER_SCENE_IDS = new Set([
  "scene-outro",
  "outro",
  "licorn-outro",
  "licorn_celebration_outro",
]);

/**
 * Extracts the editorial scene position encoded in agent-emitted scene IDs
 * (e.g. `scene-12`, `demo-scene-01`, `video-abc-scene-05`).
 */
export function extractPositionFromAgentSceneId(sceneId: string): number | null {
  const match = /scene-0*(\d+)$/i.exec(sceneId.trim());
  if (!match) {
    return null;
  }

  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Maps agent artifact scene IDs to persisted Supabase logical scene row IDs.
 */
export function resolvePersistedLogicalSceneIds(input: {
  agentSceneIds: string[];
  persistedScenes: LogicalScene[];
  agentScenePositionById?: ReadonlyMap<string, number>;
}): string[] {
  const sceneIdByPosition = new Map(
    input.persistedScenes.map((scene) => [scene.position, scene.id]),
  );
  const persistedIdSet = new Set(input.persistedScenes.map((scene) => scene.id));

  const resolved: string[] = [];

  for (const agentSceneId of input.agentSceneIds) {
    if (persistedIdSet.has(agentSceneId)) {
      resolved.push(agentSceneId);
      continue;
    }

    const position =
      input.agentScenePositionById?.get(agentSceneId) ??
      extractPositionFromAgentSceneId(agentSceneId);
    if (position == null) {
      continue;
    }

    const persistedId = sceneIdByPosition.get(position);
    if (persistedId) {
      resolved.push(persistedId);
    }
  }

  return resolved;
}

/**
 * Maps a segment's agent scene ids to persisted row ids for DB storage.
 *
 * Never falls back to "all scenes" — that corrupts storyboard linking when
 * placeholder ids (e.g. `scene-outro`) fail to resolve.
 */
export function resolveSegmentLogicalSceneIdsForPersistence(input: {
  segment: { arc: string; logicalSceneIds: string[] };
  persistedScenes: LogicalScene[];
  agentScenePositionById?: ReadonlyMap<string, number>;
}): string[] {
  const agentSceneIds = expandOutroPlaceholderSceneIds(
    input.segment.logicalSceneIds,
    input.persistedScenes,
    input.segment.arc,
  );

  const mapped = resolvePersistedLogicalSceneIds({
    agentSceneIds,
    persistedScenes: input.persistedScenes,
    agentScenePositionById: input.agentScenePositionById,
  });

  if (mapped.length > 0) {
    return mapped;
  }

  if (isOutroSegment(input.segment)) {
    const lastScene = input.persistedScenes.at(-1);
    return lastScene ? [lastScene.id] : [];
  }

  return [];
}

function expandOutroPlaceholderSceneIds(
  agentSceneIds: string[],
  persistedScenes: LogicalScene[],
  arc: string,
): string[] {
  if (!isOutroSegment({ arc }) || persistedScenes.length === 0) {
    return agentSceneIds;
  }

  const lastScene = persistedScenes.at(-1);
  if (!lastScene) {
    return agentSceneIds;
  }

  return agentSceneIds.map((agentSceneId) =>
    OUTRO_PLACEHOLDER_SCENE_IDS.has(agentSceneId.trim().toLowerCase())
      ? lastScene.id
      : agentSceneId,
  );
}

/**
 * Resolves a single agent scene reference to a persisted logical scene row.
 */
export function resolvePersistedLogicalScene(
  agentSceneId: string,
  persistedScenes: LogicalScene[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): LogicalScene | undefined {
  const sceneById = new Map(persistedScenes.map((scene) => [scene.id, scene]));
  const direct = sceneById.get(agentSceneId);
  if (direct) {
    return direct;
  }

  const position =
    agentScenePositionById?.get(agentSceneId) ??
    extractPositionFromAgentSceneId(agentSceneId);
  if (position == null) {
    return undefined;
  }

  return persistedScenes.find((scene) => scene.position === position);
}

/**
 * Builds sceneId → segment label (e.g. `S3`) for storyboard tables.
 */
export function buildSegmentLabelByPersistedSceneId(
  segments: {
    id?: string;
    position: number;
    logicalSceneIds: string[];
  }[],
  persistedScenes: LogicalScene[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): Map<string, string> {
  const labels = new Map<string, string>();
  const segmentById = new Map(
    segments.flatMap((segment) => (segment.id ? [[segment.id, segment]] as const : [])),
  );

  for (const scene of persistedScenes) {
    if (!scene.segmentId) {
      continue;
    }
    const segment = segmentById.get(scene.segmentId);
    if (segment) {
      labels.set(scene.id, `S${segment.position}`);
    }
  }

  const sortedSegments = [...segments].sort((left, right) => left.position - right.position);

  for (const segment of sortedSegments) {
    const label = `S${segment.position}`;
    for (const agentSceneId of segment.logicalSceneIds) {
      const scene = resolvePersistedLogicalScene(
        agentSceneId,
        persistedScenes,
        agentScenePositionById,
      );
      if (scene && !labels.has(scene.id)) {
        labels.set(scene.id, label);
      }
    }
  }

  return labels;
}

/**
 * Lists logical scenes included in a segment, using persisted row IDs.
 */
export function listLogicalScenesForSegment(
  segment: { logicalSceneIds: string[] },
  persistedScenes: LogicalScene[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): LogicalScene[] {
  return segment.logicalSceneIds
    .map((agentSceneId) =>
      resolvePersistedLogicalScene(
        agentSceneId,
        persistedScenes,
        agentScenePositionById,
      ),
    )
    .filter((scene): scene is LogicalScene => Boolean(scene));
}
