import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { MediaStorageBucket } from "@/modules/media-assets/media-asset.constants";
import { getMediaAssetById } from "@/modules/media-assets/repositories/media-asset.repository";
import { createStorageSignedUrl } from "@/modules/media-assets/services/storage.service";
import {
  listAssetLibrary,
  type AssetLibraryEntry,
} from "@/modules/references/repositories/asset-library.repository";
import { countSegmentReferencesForLibraryAsset } from "@/modules/references/repositories/segment-references.repository";

import { resolveAgentWorkspaceTarget } from "../services/agent-workspace-github";

export interface LibraryAdminItem {
  entry: AssetLibraryEntry;
  previewUrl: string | null;
  storagePath: string | null;
  fileSizeBytes: number | null;
  /** How many segment_references currently point at this entry (active or not). */
  usageCount: number;
}

export interface LibraryAdminData {
  items: LibraryAdminItem[];
  /** True iff CURSOR_AGENT_REPO_URL and a GitHub token are both configured. */
  skillAutoPushEnabled: boolean;
  skillAutoPushNote: string | null;
}

const PREVIEW_TTL_SECONDS = 60 * 30; // generous, page is admin-only and re-rendered often

export async function getLibraryAdminData(
  supabase: SupabaseDataClient,
): Promise<LibraryAdminData> {
  const entries = await listAssetLibrary(supabase, { includeDeprecated: true });
  const items = await Promise.all(
    entries.map<Promise<LibraryAdminItem>>(async (entry) => {
      const mediaAsset = entry.mediaAssetId
        ? await getMediaAssetById(supabase, entry.mediaAssetId)
        : null;

      const previewUrl =
        mediaAsset?.storageBucket && mediaAsset.storagePath
          ? await createStorageSignedUrl(supabase, {
              bucket: mediaAsset.storageBucket as MediaStorageBucket,
              path: mediaAsset.storagePath,
              expiresInSeconds: PREVIEW_TTL_SECONDS,
            }).catch(() => null)
          : null;

      const usageCount = await countSegmentReferencesForLibraryAsset(
        supabase,
        entry.id,
      );

      return {
        entry,
        previewUrl,
        storagePath: mediaAsset?.storagePath ?? null,
        fileSizeBytes: mediaAsset?.fileSizeBytes ?? null,
        usageCount,
      };
    }),
  );

  const { skillAutoPushEnabled, skillAutoPushNote } = describeSkillAutoPush();

  return { items, skillAutoPushEnabled, skillAutoPushNote };
}

function describeSkillAutoPush(): {
  skillAutoPushEnabled: boolean;
  skillAutoPushNote: string | null;
} {
  try {
    resolveAgentWorkspaceTarget();
    return { skillAutoPushEnabled: true, skillAutoPushNote: null };
  } catch (error) {
    return {
      skillAutoPushEnabled: false,
      skillAutoPushNote:
        error instanceof Error ? error.message : "Skill auto-push is disabled.",
    };
  }
}
