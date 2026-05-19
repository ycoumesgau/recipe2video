import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { findAssetLibraryByCanonicalNames } from "@/modules/references/repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";

import type { SongCoverPlan } from "@/modules/recipe-agent/song-cover-plan.schema";
import { isCanvasPromptMissingLoopInstruction } from "@/modules/recipe-agent/song-cover-plan.schema";

import { upsertSongCoverArtifact } from "../repositories/song-cover.repository";
import type { SongCoverArtifact } from "../song-cover.types";

export interface SyncSongCoverPlanInput {
  videoId: string;
  plan: SongCoverPlan;
  /**
   * Optional caller identity, persisted on the new row when the artifact
   * is created. Existing rows keep their original `created_by`.
   */
  createdBy?: string | null;
}

export interface SyncSongCoverPlanResult {
  albumCover: SongCoverArtifact;
  spotifyCanvas: SongCoverArtifact;
  /**
   * Canonical names declared in the plan that do not resolve to a
   * library global or a recipe-specific reference for this video.
   * Surfaced as warnings (the rows are still upserted so the operator
   * can fix the names in the UI and regenerate); the album cover and
   * the Canvas generation use cases re-validate before starting Runway
   * so the operator cannot kick off a regen with unresolved anchors.
   */
  unresolvedCoverConditioning: string[];
  unresolvedCanvasImageReferences: string[];
  unresolvedCanvasVideoReferences: string[];
  /**
   * Warning emitted when the Canvas prompt did not mention the loop
   * anchor with the expected `@<name>` shape AND a loop keyword.
   * Non-fatal: the operator can either ask the agent to revise or edit
   * the prompt in the UI before regenerating.
   */
  canvasPromptLoopWarning: string | null;
}

/**
 * Validate canonical name resolution + upsert the two
 * `song_cover_artifacts` rows for a video from an agent-authored
 * `song-cover-plan.json` payload. Idempotent on `(video_id, kind)`.
 *
 * Behavioral contract (matches the plan §7.4):
 *   * Unresolved canonical names are warnings, not hard errors. The
 *     upsert proceeds with the operator-facing list of unresolved names
 *     so the UI can prompt a fix. Hard generation-time validation is
 *     performed again before kicking off a Runway task.
 *   * The active media asset is NEVER touched by this sync — only a
 *     manual regen produces a new variant. The upsert preserves the
 *     existing `active_media_asset_id` and `status` on update.
 */
export async function syncSongCoverPlan(
  supabase: SupabaseDataClient,
  input: SyncSongCoverPlanInput,
): Promise<SyncSongCoverPlanResult> {
  const allCanonicalNames = collectCanonicalNames(input.plan);

  const [libraryIndex, recipeRefs] = await Promise.all([
    findAssetLibraryByCanonicalNames(supabase, allCanonicalNames),
    listReferenceAssetsForVideo(supabase, input.videoId),
  ]);
  const recipeRefNames = new Set(
    recipeRefs.map((reference) => reference.canonicalName),
  );

  const resolveName = (name: string): boolean =>
    libraryIndex.has(name) || recipeRefNames.has(name);

  const unresolvedCoverConditioning =
    input.plan.albumCover.conditioningReferences.filter(
      (name) => !resolveName(name),
    );
  const unresolvedCanvasImageReferences =
    input.plan.spotifyCanvas.imageReferences.filter(
      (name) => !resolveName(name),
    );
  const unresolvedCanvasVideoReferences =
    input.plan.spotifyCanvas.videoReferences.filter(
      (name) => !resolveName(name),
    );

  const albumCover = await upsertSongCoverArtifact(supabase, {
    videoId: input.videoId,
    kind: "album_cover",
    prompt: input.plan.albumCover.prompt,
    imageReferenceCanonicalNames:
      input.plan.albumCover.conditioningReferences,
    videoReferenceCanonicalNames: [],
    loopAnchorReferenceName: null,
    durationSeconds: null,
    notes: input.plan.albumCover.notes ?? null,
    createdBy: input.createdBy ?? null,
  });

  const spotifyCanvas = await upsertSongCoverArtifact(supabase, {
    videoId: input.videoId,
    kind: "spotify_canvas",
    prompt: input.plan.spotifyCanvas.prompt,
    imageReferenceCanonicalNames: input.plan.spotifyCanvas.imageReferences,
    videoReferenceCanonicalNames: input.plan.spotifyCanvas.videoReferences,
    loopAnchorReferenceName: input.plan.spotifyCanvas.loopAnchorReferenceName,
    durationSeconds: input.plan.spotifyCanvas.durationSeconds,
    notes: input.plan.spotifyCanvas.notes ?? null,
    createdBy: input.createdBy ?? null,
  });

  const loopMissing = isCanvasPromptMissingLoopInstruction(
    input.plan.spotifyCanvas.prompt,
    input.plan.spotifyCanvas.loopAnchorReferenceName,
  );

  return {
    albumCover,
    spotifyCanvas,
    unresolvedCoverConditioning,
    unresolvedCanvasImageReferences,
    unresolvedCanvasVideoReferences,
    canvasPromptLoopWarning: loopMissing
      ? `Spotify Canvas prompt does not explicitly mention @${input.plan.spotifyCanvas.loopAnchorReferenceName} together with a loop keyword (loop / first frame / last frame / seamless). The Seedance loop may break — ask the agent to revise the prompt or edit it in the UI before generating.`
      : null,
  };
}

function collectCanonicalNames(plan: SongCoverPlan): string[] {
  const names = new Set<string>();
  for (const name of plan.albumCover.conditioningReferences) names.add(name);
  for (const name of plan.spotifyCanvas.imageReferences) names.add(name);
  for (const name of plan.spotifyCanvas.videoReferences) names.add(name);
  return Array.from(names);
}
