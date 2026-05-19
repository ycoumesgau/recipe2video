import type { LogicalScene } from "../storyboard.types";

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
  segments: { position: number; logicalSceneIds: string[] }[],
  persistedScenes: LogicalScene[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): Map<string, string> {
  const labels = new Map<string, string>();

  for (const segment of segments) {
    const label = `S${segment.position}`;
    for (const agentSceneId of segment.logicalSceneIds) {
      const scene = resolvePersistedLogicalScene(
        agentSceneId,
        persistedScenes,
        agentScenePositionById,
      );
      if (scene) {
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
