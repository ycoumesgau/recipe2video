import { revalidatePath } from "next/cache";

import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { renderAssemblyMp4InSandbox } from "@/modules/assembly/render/sandbox-assembly-render";
import {
  computeSandboxRenderCacheKey,
  findSandboxSnapshot,
  invalidateSandboxSnapshot,
  persistSandboxSnapshot,
  touchSandboxSnapshot,
} from "@/modules/assembly/render/sandbox-snapshot-cache";
import {
  getCompositionById,
  updateCompositionExport,
  updateCompositionRenderProgress,
} from "@/modules/assembly/repositories/assembly.repository";
import {
  readPlacementsState,
  readTimelineState,
} from "@/modules/assembly/timeline-state";
import { buildRemotionPropsForCompositionRow } from "@/modules/assembly/use-cases/get-assembly-data";
import { persistFinalExportFromBuffer } from "@/modules/assembly/use-cases/persist-final-export-from-buffer";

import { inngest } from "../client";
import { INNGEST_EVENTS } from "../events";
import type { CompositionRenderRequestedData } from "../events";

function revalidateAssemblyPaths(videoId: string) {
  revalidatePath(`/videos/${videoId}`);
  revalidatePath(`/videos/${videoId}/assembly`);
  revalidatePath(`/videos/${videoId}/music`);
}

export const renderCompositionExport = inngest.createFunction(
  {
    id: "composition-render-export",
    retries: 0,
    concurrency: { limit: 2 },
    triggers: [{ event: INNGEST_EVENTS.compositionRenderRequested }],
  },
  async ({ event }) => {
    const supabase = createSupabaseAdminClient();
    const data = event.data as CompositionRenderRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const composition = await getCompositionById(supabase, data.compositionId);
    if (!composition || composition.videoId !== data.videoId) {
      throw new Error("Composition not found for render job.");
    }
    if (composition.exportStatus !== "rendering") {
      throw new Error(
        `Composition export status is "${composition.exportStatus}", expected "rendering".`,
      );
    }

    if (process.env.DISABLE_COMPOSITION_SANDBOX_RENDER === "1") {
      await updateCompositionExport(supabase, {
        compositionId: data.compositionId,
        exportStatus: "failed",
      });
      throw new Error(
        "Sandbox assembly render is disabled (DISABLE_COMPOSITION_SANDBOX_RENDER=1).",
      );
    }

    try {
      const remotionProps = await buildRemotionPropsForCompositionRow(
        supabase,
        data.videoId,
        composition,
      );

      const sandboxCacheKey = await computeSandboxRenderCacheKey();

      const mp4Buffer = await renderAssemblyMp4InSandbox(remotionProps, {
        onProgress: async (progress) => {
          // The orchestrator already throttles to ~1.5 s between writes; we
          // also swallow any error here so a transient Supabase blip never
          // takes down a long Remotion render.
          await updateCompositionRenderProgress(
            supabase,
            data.compositionId,
            progress,
          ).catch((error) => {
            console.error(
              "[composition-render] updateCompositionRenderProgress failed:",
              error instanceof Error ? error.message : error,
            );
          });
        },
        snapshotHooks: {
          cacheKey: sandboxCacheKey,
          async findSnapshotId(cacheKey) {
            const entry = await findSandboxSnapshot(supabase, cacheKey);
            return entry?.snapshotId ?? null;
          },
          async persistSnapshotId(cacheKey, snapshotId) {
            await persistSandboxSnapshot(supabase, {
              cacheKey,
              snapshotId,
            });
          },
          async invalidateSnapshot(cacheKey) {
            await invalidateSandboxSnapshot(supabase, cacheKey);
          },
          async touchSnapshot(cacheKey) {
            await touchSandboxSnapshot(supabase, cacheKey);
          },
        },
      });

      const durations = new Map(
        remotionProps.segments.map((segment) => [
          segment.segmentId,
          segment.durationSeconds,
        ]),
      );
      const placements = readPlacementsState(
        composition.segmentOrder,
        composition.audioSync,
        durations,
      );
      const timelineState = readTimelineState(
        composition.audioSync ?? null,
        {
          audioMediaAssetId: composition.audioMediaAssetId,
          audioDurationSeconds: remotionProps.audio?.durationSeconds ?? null,
        },
      );

      await persistFinalExportFromBuffer({
        supabase,
        videoId: data.videoId,
        compositionId: data.compositionId,
        createdBy: data.requestedByUserId,
        mp4Buffer,
        placements,
        timelineState,
        remotionProps,
        source: "assembly_sandbox_render",
      });

      revalidateAssemblyPaths(data.videoId);

      return { ok: true as const };
    } catch (error) {
      await updateCompositionExport(supabase, {
        compositionId: data.compositionId,
        exportStatus: "failed",
      }).catch(() => undefined);
      revalidateAssemblyPaths(data.videoId);
      throw error;
    }
  },
);
