import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { generateReferenceImage } from "@/modules/references/use-cases/generate-reference-image";
import { listReferenceAssetsForVideo } from "@/modules/references/repositories/reference.repository";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type ReferencesGenerateRequestedData,
} from "../events";

export const generateReferencesWorkflow = inngest.createFunction(
  {
    id: "generate-references-workflow",
    // No retry: each step calls Runway and persists media; rerunning would
    // re-spend credits and create orphan files. The user retries explicitly
    // via the references UI when needed.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoReferencesGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as ReferencesGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();
    const references = await listReferenceAssetsForVideo(supabase, data.videoId);
    const planned = references.filter(
      (reference) =>
        reference.videoId === data.videoId &&
        reference.status === "planned" &&
        Boolean(reference.prompt),
    );

    if (planned.length === 0) {
      // Nothing to generate; mark the project ready so the next checkpoint
      // becomes available.
      await updateVideoProjectStatus(
        supabase,
        data.videoId,
        "references_ready",
      );
      return { generatedCount: 0 };
    }

    let generatedCount = 0;
    for (const reference of planned) {
      // Each generation gets its own durable Inngest step so a failure on one
      // reference does not lose the work already done on previous ones.
      await step.run(`generate-reference-${reference.id}`, async () =>
        generateReferenceImage({
          supabase,
          referenceId: reference.id,
          requestedByUserId: data.requestedByUserId,
        }),
      );
      generatedCount += 1;
    }

    await updateVideoProjectStatus(
      supabase,
      data.videoId,
      "references_ready",
    );

    return { generatedCount };
  },
);
