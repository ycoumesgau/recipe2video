import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import { listAssetLibrary } from "../repositories/asset-library.repository";
import { listReferenceAssetsForVideo } from "../repositories/reference.repository";
import type { ReferenceSubstitutePickerOption } from "../reference.types";

/**
 * Build the catalog of library globals and recipe-specific references
 * available when substituting one reference for another on the references page.
 */
export async function buildReferenceSubstitutePickerOptions(
  supabase: SupabaseDataClient,
  videoId: string,
  options: { excludeReferenceId?: string } = {},
): Promise<ReferenceSubstitutePickerOption[]> {
  const [libraryCatalog, recipeCatalog] = await Promise.all([
    listAssetLibrary(supabase),
    listReferenceAssetsForVideo(supabase, videoId),
  ]);

  const pickerOptions: ReferenceSubstitutePickerOption[] = [
    ...libraryCatalog
      .filter((entry) => entry.status === "active" && entry.mediaAssetId)
      .map((entry) => ({
        pickerKey: `library:${entry.id}`,
        libraryAssetId: entry.id,
        recipeReferenceId: null,
        canonicalName: entry.canonicalName,
        label: entry.aliases[0] ?? entry.canonicalName,
        source: "asset_library" as const,
        isLibraryGlobal: true,
      })),
    ...recipeCatalog
      .filter(
        (reference) =>
          reference.status !== "rejected" &&
          reference.id !== options.excludeReferenceId,
      )
      .map((reference) => ({
        pickerKey: `recipe:${reference.id}`,
        libraryAssetId: null,
        recipeReferenceId: reference.id,
        canonicalName: reference.canonicalName,
        label: reference.canonicalName,
        source: "reference_assets" as const,
        isLibraryGlobal: false,
      })),
  ];

  return pickerOptions.sort((left, right) => left.label.localeCompare(right.label));
}
