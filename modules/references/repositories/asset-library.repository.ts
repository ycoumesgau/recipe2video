import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

type AssetLibraryRow = Database["public"]["Tables"]["asset_library"]["Row"];

export interface AssetLibraryEntry {
  id: string;
  canonicalName: string;
  aliases: string[];
  category: string;
  mediaAssetId: string | null;
  description: string | null;
  status: "active" | "deprecated";
  createdAt: string;
  updatedAt: string;
}

function mapAssetLibrary(row: AssetLibraryRow): AssetLibraryEntry {
  return {
    id: row.id,
    canonicalName: row.canonical_name,
    aliases: row.aliases ?? [],
    category: row.category,
    mediaAssetId: row.media_asset_id,
    description: row.description,
    status: row.status as "active" | "deprecated",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listAssetLibrary(
  supabase: SupabaseDataClient,
  options: { includeDeprecated?: boolean } = {},
): Promise<AssetLibraryEntry[]> {
  let query = supabase
    .from("asset_library")
    .select("*")
    .order("category", { ascending: true })
    .order("canonical_name", { ascending: true });

  if (!options.includeDeprecated) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listAssetLibrary failed");
  return data.map(mapAssetLibrary);
}

/**
 * Look up asset library entries by canonical_name OR alias. Returns a Map
 * keyed by EVERY name (canonical_name + every alias) that resolved, so the
 * agent can pass either form (`island_default` from the file basename or the
 * friendlier `KitchenIslandDefault` it documents in the skill) and the
 * resolver finds the same entry.
 *
 * Deprecated entries are excluded by default because they should not be
 * selected for new generations.
 */
export async function findAssetLibraryByCanonicalNames(
  supabase: SupabaseDataClient,
  canonicalNames: string[],
  options: { includeDeprecated?: boolean } = {},
): Promise<Map<string, AssetLibraryEntry>> {
  if (canonicalNames.length === 0) {
    return new Map();
  }

  const deduped = Array.from(new Set(canonicalNames));
  const aliasOrClause = `aliases.ov.{${deduped
    .map((name) => `"${name.replace(/"/g, '\\"')}"`)
    .join(",")}}`;

  let query = supabase
    .from("asset_library")
    .select("*")
    .or(`canonical_name.in.(${deduped.map((name) => `"${name.replace(/"/g, '\\"')}"`).join(",")}),${aliasOrClause}`);

  if (!options.includeDeprecated) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "findAssetLibraryByCanonicalNames failed");

  const result = new Map<string, AssetLibraryEntry>();
  for (const row of data ?? []) {
    const entry = mapAssetLibrary(row);
    // Index by canonical_name AND every alias so callers can lookup either
    // form. We DO NOT restrict to names the caller asked for: this lets us
    // index secondary aliases too, which keeps the API contract honest
    // ("call .get(name) for any known name and you get a hit").
    result.set(entry.canonicalName, entry);
    for (const alias of entry.aliases) {
      result.set(alias, entry);
    }
  }
  return result;
}

export async function getAssetLibraryById(
  supabase: SupabaseDataClient,
  id: string,
): Promise<AssetLibraryEntry | null> {
  const { data, error } = await supabase
    .from("asset_library")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  throwIfSupabaseError(error, "getAssetLibraryById failed");
  return data ? mapAssetLibrary(data) : null;
}
