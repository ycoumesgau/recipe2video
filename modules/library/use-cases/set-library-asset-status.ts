import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import {
  getAssetLibraryById,
  setAssetLibraryStatus,
  type AssetLibraryEntry,
} from "@/modules/references/repositories/asset-library.repository";

import { regenerateAssetReferenceSkill } from "./regenerate-asset-reference-skill";

export interface SetLibraryAssetStatusInput {
  assetLibraryId: string;
  status: "active" | "deprecated";
}

export interface SetLibraryAssetStatusResult {
  entry: AssetLibraryEntry;
  skill: Awaited<ReturnType<typeof regenerateAssetReferenceSkill>>;
}

/**
 * Deprecate (soft-delete) or reactivate a library entry. Deprecated entries
 * disappear from the skill markdown and from the resolver used by the
 * agent-artifacts sync, but the storage object and DB row are kept so any
 * past video that still references them via `segment_references` keeps
 * resolving (we don't break history).
 */
export async function setLibraryAssetStatus(
  supabase: SupabaseDataClient,
  input: SetLibraryAssetStatusInput,
): Promise<SetLibraryAssetStatusResult> {
  const current = await getAssetLibraryById(supabase, input.assetLibraryId);
  if (!current) {
    throw new Error(`asset_library row '${input.assetLibraryId}' not found`);
  }

  if (current.status === input.status) {
    // No-op DB write — but still rerun the skill regen in case the file
    // drifted from the DB state on a previous failed run.
    const skill = await regenerateAssetReferenceSkill(supabase, {
      reason: `noop status ${input.status} on ${current.canonicalName}`,
    });
    return { entry: current, skill };
  }

  const updated = await setAssetLibraryStatus(
    supabase,
    current.id,
    input.status,
  );
  const verb = input.status === "active" ? "reactivate" : "deprecate";
  const skill = await regenerateAssetReferenceSkill(supabase, {
    reason: `${verb} ${updated.canonicalName}`,
  });

  return { entry: updated, skill };
}
