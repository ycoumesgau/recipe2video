// Not annotated `server-only` so the unit tests under
// `*.test.ts` can import the resolver and exercise it against a fake
// Supabase client. The function only does Supabase reads + signed URL
// minting, so there is no runtime risk in running it from a non-server
// context — the actual server-only guarantee comes from the Inngest
// worker and the server action that call this resolver, both of which are
// `server-only` themselves.

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
// Import directly from the signed-URL module rather than the
// `storage.service` barrel: the barrel is marked `server-only` (it also
// exposes upload/download helpers that must never ship to the client),
// whereas the signed-URL helper is intentionally test-friendly.
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";

import { findAssetLibraryByCanonicalNames } from "../repositories/asset-library.repository";
import { isConditioningExcludedCategory } from "./conditioning-category-policy";
import { deriveRunwayTag, makeRunwayTagsUnique } from "./derive-runway-tag";

type MediaAssetStoragePick = Pick<
  Database["public"]["Tables"]["media_assets"]["Row"],
  "id" | "storage_bucket" | "storage_path"
>;

/**
 * Short-lived signed URL for handing a library global to Runway's
 * `text_to_image` endpoint as a `referenceImages[].uri`. The Runway upload
 * happens within seconds, so 15 minutes is plenty and matches the TTL we
 * already use for Seedance references in
 * `resolveSegmentSeedanceReferences.ts`.
 */
const CONDITIONING_SIGNED_URL_TTL_SECONDS = 60 * 15;

/**
 * A library global, resolved into the shape Runway expects.
 *
 * `tag` is the friendly @-handle the agent uses in prompts
 * (`KitchenIslandDefault`, `SquareBakingDish`). It is computed from the
 * library entry's first alias when present, falling back to the
 * canonical_name. This way the prompt builder can inject `@KitchenIslandDefault`
 * and `referenceImages` can carry `tag: "KitchenIslandDefault"`, keeping
 * the GPT-Image 2 contract intact (the model resolves `@Tag` against the
 * matching `referenceImages` entry).
 */
export interface ConditioningAnchor {
  /**
   * Canonical name (snake_case storage key) of the matched library entry.
   * Used for error reporting; the prompt and the Runway payload use `tag`.
   */
  canonicalName: string;
  /**
   * The exact name string the caller asked for. Surfaced so the agent's
   * declared order in `reference-plan.json` is preserved, and so we can
   * report "the operator asked for `@KitchenIslandDefault` but we resolved
   * `island_default`" if needed for debugging.
   */
  requestedName: string;
  /** Friendly @-handle. */
  tag: string;
  /** Fresh, short-lived HTTPS URL Runway can download. */
  uri: string;
}

export interface ResolveConditioningAnchorsResult {
  anchors: ConditioningAnchor[];
  /**
   * Names the caller asked for that we could not resolve against the
   * active library. The caller decides whether to soft-skip these or hard-
   * fail; the generation use case logs them and continues so a single bad
   * anchor in `reference-plan.json` does not block the whole regen.
   */
  unresolvedNames: string[];
  /**
   * Names that DID resolve against the library but were intentionally
   * dropped because their category is not allowed as a recipe-state
   * anchor (see `conditioning-category-policy.ts`). Surfaced so the UI
   * and cost logs can show "we silently excluded these for being
   * mascot/character entries — that's intentional, not a typo".
   *
   * Distinct from `unresolvedNames` so callers can give the operator a
   * useful "did you mean to drop the character anchors?" message instead
   * of a generic "name not found" error.
   */
  excludedAnchors: Array<{
    canonicalName: string;
    requestedName: string;
    category: string;
  }>;
}

/**
 * Resolve a list of `asset_library` canonical names (or aliases) into the
 * payload Runway needs for `referenceImages[]`: a fresh signed URL plus the
 * agent-facing @-tag.
 *
 * Caller invariants:
 *   - Pass the names exactly as the agent wrote them — `findAssetLibraryByCanonicalNames`
 *     already indexes both canonical_name and aliases.
 *   - Names that resolve to the SAME library entry are de-duplicated (last
 *     wins) so we don't burn two of GPT-Image 2's 16-reference slots on the
 *     same asset.
 *   - Names with no media in Supabase Storage are reported as
 *     `unresolvedNames` (they have no usable URI).
 *   - Order of `anchors[]` matches the order of `requestedNames` after
 *     de-duplication.
 */
export async function resolveConditioningAnchors(
  supabase: SupabaseDataClient,
  requestedNames: string[],
): Promise<ResolveConditioningAnchorsResult> {
  const trimmed = requestedNames
    .map((name) => name.trim())
    .filter((name) => name.length > 0);

  if (trimmed.length === 0) {
    return { anchors: [], unresolvedNames: [], excludedAnchors: [] };
  }

  const libraryIndex = await findAssetLibraryByCanonicalNames(
    supabase,
    trimmed,
  );

  const mediaAssetIds = new Set<string>();
  for (const entry of new Set(libraryIndex.values())) {
    if (entry.mediaAssetId) {
      mediaAssetIds.add(entry.mediaAssetId);
    }
  }

  const mediaById = await fetchMediaAssetStorageLocations(
    supabase,
    Array.from(mediaAssetIds),
  );

  const seenEntryIds = new Set<string>();
  // We first build the anchors with a raw tag derived from each entry's
  // alias / canonical_name, then call `makeRunwayTagsUnique` to enforce
  // the 16-char limit AND ensure uniqueness across the batch in a single
  // deterministic pass. Doing it after dedupe-by-entry-id keeps the
  // mapping from `requested` to final tag stable across reruns.
  const pending: Array<{
    canonicalName: string;
    requestedName: string;
    rawTag: string;
    uri: string;
  }> = [];
  const unresolvedNames: string[] = [];
  const excludedAnchors: ResolveConditioningAnchorsResult["excludedAnchors"] = [];

  for (const requestedName of trimmed) {
    const entry = libraryIndex.get(requestedName);

    if (!entry) {
      unresolvedNames.push(requestedName);
      continue;
    }

    // Same library entry surfaced under two different aliases (the agent
    // wrote both `island_default` and `KitchenIslandDefault`): we only
    // include it once. We do NOT touch `unresolvedNames` here — the entry
    // is fine, it's just a duplicate request.
    if (seenEntryIds.has(entry.id)) {
      continue;
    }

    // Hard policy: character-class entries (mascot sheet, poses,
    // expressions) are never used as visual anchors for recipe-specific
    // images. They add noise to the dish frame and the kitchen/utensil
    // anchors already carry the Licorn visual identity. Reported on the
    // dedicated `excludedAnchors` list so the UI can show the operator
    // "we kept your declared anchor but skipped this one on purpose"
    // rather than a generic "not found".
    if (isConditioningExcludedCategory(entry.category)) {
      seenEntryIds.add(entry.id);
      excludedAnchors.push({
        canonicalName: entry.canonicalName,
        requestedName,
        category: entry.category,
      });
      continue;
    }

    if (!entry.mediaAssetId) {
      unresolvedNames.push(requestedName);
      continue;
    }

    const storage = mediaById.get(entry.mediaAssetId);
    if (!storage?.storage_bucket || !storage.storage_path) {
      unresolvedNames.push(requestedName);
      continue;
    }

    const uri = await createStorageSignedUrl(supabase, {
      bucket: storage.storage_bucket as MediaStorageBucket,
      path: storage.storage_path,
      expiresInSeconds: CONDITIONING_SIGNED_URL_TTL_SECONDS,
    });

    seenEntryIds.add(entry.id);
    const sourceForTag = entry.aliases[0]?.trim() || entry.canonicalName;
    pending.push({
      canonicalName: entry.canonicalName,
      requestedName,
      rawTag: deriveRunwayTag(sourceForTag),
      uri,
    });
  }

  const uniqueTags = makeRunwayTagsUnique(pending.map((entry) => entry.rawTag));
  const anchors: ConditioningAnchor[] = pending.map((entry, index) => ({
    canonicalName: entry.canonicalName,
    requestedName: entry.requestedName,
    tag: uniqueTags[index]!,
    uri: entry.uri,
  }));

  return { anchors, unresolvedNames, excludedAnchors };
}


async function fetchMediaAssetStorageLocations(
  supabase: SupabaseDataClient,
  mediaAssetIds: string[],
): Promise<Map<string, MediaAssetStoragePick>> {
  const result = new Map<string, MediaAssetStoragePick>();
  if (mediaAssetIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("media_assets")
    .select("id, storage_bucket, storage_path")
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "resolveConditioningAnchors media fetch failed");
  for (const row of data ?? []) {
    result.set(row.id, row as MediaAssetStoragePick);
  }
  return result;
}
