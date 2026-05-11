import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

type AssetLibraryRow = Database["public"]["Tables"]["asset_library"]["Row"];

export interface AssetLibraryEntry {
  id: string;
  canonicalName: string;
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
 * Look up asset library entries by canonical_name. Returns a Map keyed by
 * canonical_name so callers can resolve recipe-plan entries to library_asset_id
 * without falling into N+1 queries. Deprecated entries are excluded by default
 * because they should not be selected for new generations.
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
  let query = supabase
    .from("asset_library")
    .select("*")
    .in("canonical_name", deduped);

  if (!options.includeDeprecated) {
    query = query.eq("status", "active");
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "findAssetLibraryByCanonicalNames failed");

  const result = new Map<string, AssetLibraryEntry>();
  for (const row of data ?? []) {
    result.set(row.canonical_name, mapAssetLibrary(row));
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
