import { isOutroSegment } from "./seedance-outro-template";
import type { LogicalScene } from "../storyboard.types";

const OUTRO_PLACEHOLDER_SCENE_IDS = new Set([
  "scene-outro",
  "outro",
  "licorn-outro",
  "licorn_celebration_outro",
]);

export type SegmentLogicalSceneLinkInput = {
  position: number;
  /** Required for persistence sync; optional in UI-only remapping. */
  arc?: string;
  logicalSceneIds: string[];
};

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

function isOutroPlaceholderSceneId(sceneId: string): boolean {
  return OUTRO_PLACEHOLDER_SCENE_IDS.has(sceneId.trim().toLowerCase());
}

function collectUnclaimedSceneIds(
  persistedScenes: LogicalScene[],
  claimedPositions: Set<number>,
): string[] {
  return persistedScenes
    .filter((scene) => !claimedPositions.has(scene.position))
    .sort((left, right) => left.position - right.position)
    .map((scene) => scene.id);
}

function claimScenePositions(
  persistedScenes: LogicalScene[],
  sceneIds: string[],
  claimedPositions: Set<number>,
): void {
  for (const sceneId of sceneIds) {
    const scene = persistedScenes.find((item) => item.id === sceneId);
    if (scene) {
      claimedPositions.add(scene.position);
    }
  }
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
 * Resolves logical scene links for every segment in editorial order.
 *
 * Non-outro segments use agent `logicalSceneIds`. The outro segment receives
 * every scene not already claimed by earlier segments (e.g. scenes 34–36 when
 * segment 6 ends at scene 33).
 */
export function remapAllSegmentsLogicalSceneIdsForPersistence(input: {
  segments: SegmentLogicalSceneLinkInput[];
  persistedScenes: LogicalScene[];
  agentScenePositionById?: ReadonlyMap<string, number>;
}): Map<number, string[]> {
  const sortedScenes = [...input.persistedScenes].sort(
    (left, right) => left.position - right.position,
  );
  const claimedPositions = new Set<number>();
  const idsBySegmentPosition = new Map<number, string[]>();

  const editorialSegments = [...input.segments].sort(
    (left, right) => left.position - right.position,
  );
  const outroSegments = editorialSegments.filter((segment) =>
    isOutroSegment({ arc: segment.arc ?? "" }),
  );
  const bodySegments = editorialSegments.filter(
    (segment) => !isOutroSegment({ arc: segment.arc ?? "" }),
  );

  for (const segment of bodySegments) {
    const mapped = resolvePersistedLogicalSceneIds({
      agentSceneIds: segment.logicalSceneIds,
      persistedScenes: sortedScenes,
      agentScenePositionById: input.agentScenePositionById,
    });
    claimScenePositions(sortedScenes, mapped, claimedPositions);
    idsBySegmentPosition.set(segment.position, mapped);
  }

  for (const segment of outroSegments) {
    const explicitAgentIds = segment.logicalSceneIds.filter(
      (sceneId) => !isOutroPlaceholderSceneId(sceneId),
    );
    const remainingSceneIds = collectUnclaimedSceneIds(sortedScenes, claimedPositions);

    const mappedFromAgent =
      remainingSceneIds.length === 0
        ? resolvePersistedLogicalSceneIds({
            agentSceneIds: explicitAgentIds,
            persistedScenes: sortedScenes,
            agentScenePositionById: input.agentScenePositionById,
          }).filter((sceneId) => {
            const scene = sortedScenes.find((item) => item.id === sceneId);
            return scene != null && !claimedPositions.has(scene.position);
          })
        : [];

    const outroSceneIds =
      remainingSceneIds.length > 0 ? remainingSceneIds : mappedFromAgent;

    claimScenePositions(sortedScenes, outroSceneIds, claimedPositions);
    idsBySegmentPosition.set(segment.position, outroSceneIds);
  }

  return idsBySegmentPosition;
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
  segments: SegmentLogicalSceneLinkInput[],
  persistedScenes: LogicalScene[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): Map<string, string> {
  const labels = new Map<string, string>();
  const remappedIds = remapAllSegmentsLogicalSceneIdsForPersistence({
    segments,
    persistedScenes,
    agentScenePositionById,
  });

  const sortedSegments = [...segments].sort((left, right) => left.position - right.position);

  for (const segment of sortedSegments) {
    const label = `S${segment.position}`;
    const sceneIds = remappedIds.get(segment.position) ?? [];

    for (const sceneId of sceneIds) {
      const scene = persistedScenes.find((item) => item.id === sceneId);
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
  segment: { position: number; arc: string; logicalSceneIds: string[] },
  persistedScenes: LogicalScene[],
  allSegments: SegmentLogicalSceneLinkInput[],
  agentScenePositionById?: ReadonlyMap<string, number>,
): LogicalScene[] {
  const remappedIds = remapAllSegmentsLogicalSceneIdsForPersistence({
    segments: allSegments,
    persistedScenes,
    agentScenePositionById,
  });

  const sceneIds = remappedIds.get(segment.position) ?? segment.logicalSceneIds;

  return sceneIds
    .map((sceneId) => persistedScenes.find((scene) => scene.id === sceneId))
    .filter((scene): scene is LogicalScene => Boolean(scene));
}
