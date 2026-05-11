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
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAssetLibraryInput {
  id?: string;
  canonicalName: string;
  category: string;
  aliases?: string[];
  description?: string | null;
  mediaAssetId?: string | null;
  status?: "active" | "deprecated";
  createdBy?: string | null;
}

export interface UpdateAssetLibraryMetadataInput {
  aliases?: string[];
  description?: string | null;
  category?: string;
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
    createdBy: row.created_by,
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

export async function getAssetLibraryByCanonicalName(
  supabase: SupabaseDataClient,
  canonicalName: string,
): Promise<AssetLibraryEntry | null> {
  const { data, error } = await supabase
    .from("asset_library")
    .select("*")
    .eq("canonical_name", canonicalName)
    .maybeSingle();

  throwIfSupabaseError(error, "getAssetLibraryByCanonicalName failed");
  return data ? mapAssetLibrary(data) : null;
}

export async function createAssetLibraryEntry(
  supabase: SupabaseDataClient,
  input: CreateAssetLibraryInput,
): Promise<AssetLibraryEntry> {
  const { data, error } = await supabase
    .from("asset_library")
    .insert({
      id: input.id,
      canonical_name: input.canonicalName,
      category: input.category,
      aliases: input.aliases ?? [],
      description: input.description ?? null,
      media_asset_id: input.mediaAssetId ?? null,
      status: input.status ?? "active",
      created_by: input.createdBy ?? null,
    })
    .select("*")
    .single();

  throwIfSupabaseError(error, "createAssetLibraryEntry failed");
  return mapAssetLibrary(data!);
}

export async function updateAssetLibraryMetadata(
  supabase: SupabaseDataClient,
  id: string,
  patch: UpdateAssetLibraryMetadataInput,
): Promise<AssetLibraryEntry> {
  const update: Database["public"]["Tables"]["asset_library"]["Update"] = {};
  if (patch.aliases !== undefined) update.aliases = patch.aliases;
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.category !== undefined) update.category = patch.category;

  if (Object.keys(update).length === 0) {
    const current = await getAssetLibraryById(supabase, id);
    if (!current) {
      throw new Error(`asset_library row '${id}' not found`);
    }
    return current;
  }

  const { data, error } = await supabase
    .from("asset_library")
    .update(update)
    .eq("id", id)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateAssetLibraryMetadata failed");
  return mapAssetLibrary(data!);
}

export async function setAssetLibraryMediaAsset(
  supabase: SupabaseDataClient,
  id: string,
  mediaAssetId: string,
): Promise<AssetLibraryEntry> {
  const { data, error } = await supabase
    .from("asset_library")
    .update({ media_asset_id: mediaAssetId })
    .eq("id", id)
    .select("*")
    .single();

  throwIfSupabaseError(error, "setAssetLibraryMediaAsset failed");
  return mapAssetLibrary(data!);
}

export async function setAssetLibraryStatus(
  supabase: SupabaseDataClient,
  id: string,
  status: "active" | "deprecated",
): Promise<AssetLibraryEntry> {
  const { data, error } = await supabase
    .from("asset_library")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  throwIfSupabaseError(error, "setAssetLibraryStatus failed");
  return mapAssetLibrary(data!);
}
