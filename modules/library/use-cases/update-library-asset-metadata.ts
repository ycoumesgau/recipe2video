import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getAssetLibraryById,
  listAssetLibrary,
  updateAssetLibraryMetadata,
  type AssetLibraryEntry,
} from "@/modules/references/repositories/asset-library.repository";

import { isAssetLibraryCategory } from "../library.constants";
import { normalizeAliases } from "../library.validation";
import { regenerateAssetReferenceSkill } from "./regenerate-asset-reference-skill";

export interface UpdateLibraryAssetMetadataInput {
  assetLibraryId: string;
  category?: string;
  aliases?: readonly string[];
  description?: string | null;
}

export interface UpdateLibraryAssetMetadataResult {
  entry: AssetLibraryEntry;
  skill: Awaited<ReturnType<typeof regenerateAssetReferenceSkill>>;
}

/**
 * Patch the editable metadata of a library entry. `canonical_name` is
 * deliberately NOT editable: it is the stable identifier the agent emits and
 * segment_references resolve against (see modules/library/library.constants.ts
 * for the rationale baked into the workspace folder layout).
 *
 * Any change in aliases / description / category alters what the agent reads
 * in its skill, so we trigger a SKILL.md regeneration.
 */
export async function updateLibraryAssetMetadata(
  supabase: SupabaseDataClient,
  input: UpdateLibraryAssetMetadataInput,
): Promise<UpdateLibraryAssetMetadataResult> {
  const entry = await getAssetLibraryById(supabase, input.assetLibraryId);
  if (!entry) {
    throw new Error(`asset_library row '${input.assetLibraryId}' not found`);
  }

  const patch: {
    category?: string;
    aliases?: string[];
    description?: string | null;
  } = {};

  if (input.category !== undefined) {
    if (!isAssetLibraryCategory(input.category)) {
      throw new Error(
        `Invalid category '${input.category}'. Use one of the canonical library categories.`,
      );
    }
    patch.category = input.category;
  }

  if (input.aliases !== undefined) {
    const normalized = normalizeAliases(input.aliases);
    await assertAliasesAreFree(supabase, normalized, entry.id);
    patch.aliases = normalized;
  }

  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }

  const updated = await updateAssetLibraryMetadata(supabase, entry.id, patch);
  const skill = await regenerateAssetReferenceSkill(supabase, {
    reason: `update ${updated.canonicalName} metadata`,
  });

  return { entry: updated, skill };
}

/**
 * Reject the update if any of the proposed aliases is already owned by a
 * DIFFERENT entry (either as its canonical_name or one of its aliases). This
 * keeps `findAssetLibraryByCanonicalNames` deterministic — a given lookup
 * key resolves to exactly one library entry.
 */
async function assertAliasesAreFree(
  supabase: SupabaseDataClient,
  aliases: string[],
  selfId: string,
): Promise<void> {
  if (aliases.length === 0) return;

  // Cheap O(n) scan: the asset library has a few dozen rows. If it ever grows
  // huge, replace with an indexed SQL query on canonical_name + aliases.
  const all = await listAssetLibrary(supabase, { includeDeprecated: true });
  const claimed = new Set<string>();
  for (const entry of all) {
    if (entry.id === selfId) continue;
    claimed.add(entry.canonicalName);
    for (const alias of entry.aliases) claimed.add(alias);
  }

  const collisions = aliases.filter((alias) => claimed.has(alias));
  if (collisions.length > 0) {
    throw new Error(
      `Alias collision: ${collisions.join(", ")} already used by another library entry.`,
    );
  }
}
