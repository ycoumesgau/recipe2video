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
import { createLibraryStorageSignedUrl } from "@/modules/media-assets/services/create-library-storage-signed-url";
import { tryCreateStorageSignedUrl } from "@/modules/media-assets/services/storage-signed-url";
import { normalizeReferenceName } from "../reference-matching";

import { findAssetLibraryByCanonicalNames } from "../repositories/asset-library.repository";
import {
  findReferenceAssetsByCanonicalNamesForVideo,
  type ReferenceAsset,
} from "../repositories/reference.repository";
import {
  isConditioningExcludedCategory,
  type ConditioningContext,
} from "./conditioning-category-policy";
import { deriveRunwayTag, makeRunwayTagsUnique } from "./derive-runway-tag";

type MediaAssetStoragePick = Pick<
  Database["public"]["Tables"]["media_assets"]["Row"],
  "id" | "storage_bucket" | "storage_path" | "file_size_bytes" | "mime_type"
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
export type ConditioningAnchorSource = "asset_library" | "reference_assets";

export interface ConditioningAnchor {
  /**
   * Canonical name of the matched entry (library snake_case or recipe
   * PascalCase frame id). Used for error reporting; the prompt and the
   * Runway payload use `tag`.
   */
  canonicalName: string;
  /** Whether this anchor came from the global library or this video's refs. */
  source: ConditioningAnchorSource;
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
  /**
   * Stored size of the library media in bytes. Used to fail fast before
   * Runway rejects oversize anchors with `Asset size exceeds 16.0MB.`
   */
  fileSizeBytes: number;
  /** Stored MIME type, surfaced in operator-facing size-cap errors. */
  mimeType: string | null;
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
 * Resolve conditioning names into the payload Runway needs for
 * `referenceImages[]`: a fresh signed URL plus the agent-facing @-tag.
 *
 * Resolution order (per name):
 *   1. Active `asset_library` entry (canonical or alias).
 *   2. When `options.videoId` is set, a recipe-specific `reference_assets`
 *      row on that video with stored media (lets earlier generated frames
 *      anchor later ones on the same recipe).
 *
 * Caller invariants:
 *   - Pass the names exactly as the agent wrote them — library lookup
 *     indexes both canonical_name and aliases; recipe lookup indexes
 *     canonical_name and a normalized form.
 *   - Names that resolve to the SAME underlying entry are de-duplicated so
 *     we don't burn two of GPT-Image 2's 16-reference slots on one asset.
 *   - Names with no media in Supabase Storage are reported as
 *     `unresolvedNames` (they have no usable URI).
 *   - Order of `anchors[]` matches the order of `requestedNames` after
 *     de-duplication.
 */
export interface ResolveConditioningAnchorsOptions {
  /** Required to resolve recipe-specific reference frames as anchors. */
  videoId?: string;
  /**
   * When generating a recipe reference, pass its id so a self-declared
   * anchor name cannot resolve to the in-flight row (no media yet).
   */
  excludeReferenceId?: string;
}

export async function resolveConditioningAnchors(
  supabase: SupabaseDataClient,
  requestedNames: string[],
  context: ConditioningContext = "recipe_state",
  options: ResolveConditioningAnchorsOptions = {},
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

  const recipeIndex = options.videoId
    ? await findReferenceAssetsByCanonicalNamesForVideo(
        supabase,
        options.videoId,
        trimmed,
      )
    : new Map<string, ReferenceAsset>();

  const mediaAssetIds = new Set<string>();
  for (const entry of new Set(libraryIndex.values())) {
    if (entry.mediaAssetId) {
      mediaAssetIds.add(entry.mediaAssetId);
    }
  }
  for (const entry of new Set(recipeIndex.values())) {
    if (entry.mediaAssetId) {
      mediaAssetIds.add(entry.mediaAssetId);
    }
  }

  const mediaById = await fetchMediaAssetStorageLocations(
    supabase,
    Array.from(mediaAssetIds),
  );

  const seenLibraryEntryIds = new Set<string>();
  const seenRecipeReferenceIds = new Set<string>();
  // We first build the anchors with a raw tag derived from each entry's
  // alias / canonical_name, then call `makeRunwayTagsUnique` to enforce
  // the 16-char limit AND ensure uniqueness across the batch in a single
  // deterministic pass. Doing it after dedupe-by-entry-id keeps the
  // mapping from `requested` to final tag stable across reruns.
  const pending: Array<{
    canonicalName: string;
    requestedName: string;
    source: ConditioningAnchorSource;
    rawTag: string;
    uri: string;
    fileSizeBytes: number;
    mimeType: string | null;
  }> = [];
  const unresolvedNames: string[] = [];
  const excludedAnchors: ResolveConditioningAnchorsResult["excludedAnchors"] = [];

  for (const requestedName of trimmed) {
    const libraryEntry = lookupLibraryEntry(libraryIndex, requestedName);

    if (libraryEntry) {
      if (seenLibraryEntryIds.has(libraryEntry.id)) {
        continue;
      }

      if (isConditioningExcludedCategory(libraryEntry.category, context)) {
        seenLibraryEntryIds.add(libraryEntry.id);
        excludedAnchors.push({
          canonicalName: libraryEntry.canonicalName,
          requestedName,
          category: libraryEntry.category,
        });
        continue;
      }

      if (!libraryEntry.mediaAssetId) {
        unresolvedNames.push(requestedName);
        continue;
      }

      const storage = mediaById.get(libraryEntry.mediaAssetId);
      if (!storage?.storage_bucket || !storage.storage_path) {
        unresolvedNames.push(requestedName);
        continue;
      }

      const uri = await createLibraryStorageSignedUrl(supabase, {
        bucket: storage.storage_bucket as MediaStorageBucket,
        path: storage.storage_path,
        libraryCanonicalName: libraryEntry.canonicalName,
        expiresInSeconds: CONDITIONING_SIGNED_URL_TTL_SECONDS,
      });

      seenLibraryEntryIds.add(libraryEntry.id);
      const sourceForTag =
        libraryEntry.aliases[0]?.trim() || libraryEntry.canonicalName;
      pending.push({
        canonicalName: libraryEntry.canonicalName,
        requestedName,
        source: "asset_library",
        rawTag: deriveRunwayTag(sourceForTag),
        uri,
        fileSizeBytes: storage.file_size_bytes ?? 0,
        mimeType: storage.mime_type ?? null,
      });
      continue;
    }

    const recipeEntry = lookupRecipeReferenceEntry(recipeIndex, requestedName);
    if (!recipeEntry) {
      unresolvedNames.push(requestedName);
      continue;
    }

    if (
      options.excludeReferenceId &&
      recipeEntry.id === options.excludeReferenceId
    ) {
      unresolvedNames.push(requestedName);
      continue;
    }

    if (seenRecipeReferenceIds.has(recipeEntry.id)) {
      continue;
    }

    if (!recipeEntry.mediaAssetId) {
      unresolvedNames.push(requestedName);
      continue;
    }

    const storage = mediaById.get(recipeEntry.mediaAssetId);
    if (!storage?.storage_bucket || !storage.storage_path) {
      unresolvedNames.push(requestedName);
      continue;
    }

    const uri = await tryCreateStorageSignedUrl(supabase, {
      bucket: storage.storage_bucket as MediaStorageBucket,
      path: storage.storage_path,
      expiresInSeconds: CONDITIONING_SIGNED_URL_TTL_SECONDS,
    });

    if (!uri) {
      unresolvedNames.push(requestedName);
      continue;
    }

    seenRecipeReferenceIds.add(recipeEntry.id);
    pending.push({
      canonicalName: recipeEntry.canonicalName,
      requestedName,
      source: "reference_assets",
      rawTag: deriveRunwayTag(recipeEntry.canonicalName),
      uri,
      fileSizeBytes: storage.file_size_bytes ?? 0,
      mimeType: storage.mime_type ?? null,
    });
  }

  const uniqueTags = makeRunwayTagsUnique(pending.map((entry) => entry.rawTag));
  const anchors: ConditioningAnchor[] = pending.map((entry, index) => ({
    canonicalName: entry.canonicalName,
    requestedName: entry.requestedName,
    source: entry.source,
    tag: uniqueTags[index]!,
    uri: entry.uri,
    fileSizeBytes: entry.fileSizeBytes,
    mimeType: entry.mimeType,
  }));

  return { anchors, unresolvedNames, excludedAnchors };
}

function lookupLibraryEntry(
  libraryIndex: Awaited<ReturnType<typeof findAssetLibraryByCanonicalNames>>,
  requestedName: string,
) {
  return (
    libraryIndex.get(requestedName) ??
    libraryIndex.get(normalizeReferenceName(requestedName))
  );
}

function lookupRecipeReferenceEntry(
  recipeIndex: Map<string, ReferenceAsset>,
  requestedName: string,
): ReferenceAsset | undefined {
  return (
    recipeIndex.get(requestedName) ??
    recipeIndex.get(normalizeReferenceName(requestedName))
  );
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
    .select("id, storage_bucket, storage_path, file_size_bytes, mime_type")
    .in("id", mediaAssetIds);

  throwIfSupabaseError(error, "resolveConditioningAnchors media fetch failed");
  for (const row of data ?? []) {
    result.set(row.id, row as MediaAssetStoragePick);
  }
  return result;
}
