import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { generateReferenceImage } from "@/modules/references/use-cases/generate-reference-image";
import {
  getReferenceAssetById,
  listReferenceAssetsForVideo,
} from "@/modules/references/repositories/reference.repository";
import { updateVideoProjectStatus } from "@/modules/videos/repositories/video.repository";

import { inngest } from "../client";
import {
  INNGEST_EVENTS,
  type ReferencesGenerateRequestedData,
  type SingleReferenceGenerateRequestedData,
} from "../events";

/**
 * Status values that mean "this reference needs another GPT-Image 2 pass".
 *
 * `planned`: never generated (or recently re-marked planned by the agent).
 * `failed`: the previous Runway task errored or timed out; the operator
 * triggered a regen.
 *
 * `generating` is intentionally excluded so a concurrent click does not
 * stack two tasks. `generated` / `approved` / `rejected` / `uploaded_to_runway`
 * are excluded because the operator must explicitly opt in to overwriting
 * an image they already vetted (per-reference Regenerate button covers
 * that path through the singular event below).
 */
const PENDING_STATUSES = new Set(["planned", "failed"]);

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

    // The legacy "Mark references ready" path only regenerated `planned`
    // entries with a prompt. The "Generate all missing" path additionally
    // pulls in `failed` entries (so the operator can retry without first
    // hand-resetting status), but still skips entries with no prompt
    // (those require a manual upload).
    const candidates = references.filter((reference) => {
      if (reference.videoId !== data.videoId) {
        return false;
      }
      if (!reference.prompt || reference.prompt.trim().length === 0) {
        return false;
      }
      if (data.generateAllMissing) {
        return PENDING_STATUSES.has(reference.status);
      }
      return reference.status === "planned";
    });

    if (candidates.length === 0) {
      if (data.flipStatusOnCompletion ?? !data.generateAllMissing) {
        await updateVideoProjectStatus(
          supabase,
          data.videoId,
          "references_ready",
        );
      }
      return { generatedCount: 0 };
    }

    let generatedCount = 0;
    for (const reference of candidates) {
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

    if (data.flipStatusOnCompletion ?? !data.generateAllMissing) {
      await updateVideoProjectStatus(
        supabase,
        data.videoId,
        "references_ready",
      );
    }

    return { generatedCount };
  },
);

/**
 * Per-reference generation handler. Triggered by the "Generate" /
 * "Regenerate" button on a single reference card. Kept separate from the
 * batch workflow so:
 *   - the user can iterate on one anchor (edit prompt, regen, repeat)
 *     without waiting for the others;
 *   - one bad anchor cannot fail the whole batch;
 *   - the singular path never touches video project status.
 */
export const generateSingleReferenceWorkflow = inngest.createFunction(
  {
    id: "generate-single-reference-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.videoReferenceGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as SingleReferenceGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();
    const reference = await getReferenceAssetById(supabase, data.referenceId);

    if (!reference) {
      throw new Error(
        `Reference ${data.referenceId} not found while handling per-reference generation.`,
      );
    }

    if (reference.videoId !== data.videoId) {
      throw new Error(
        `Reference ${data.referenceId} belongs to video ${reference.videoId ?? "<null>"}, not ${data.videoId}.`,
      );
    }

    if (reference.source === "asset_library") {
      // Library globals must never be regenerated from a per-video page.
      // The /library admin page owns that path. Failing fast prevents a
      // mis-wired UI from silently rewriting global assets.
      throw new Error(
        `Reference ${data.referenceId} is a library global; use /library to regenerate it.`,
      );
    }

    await step.run(`generate-reference-${reference.id}`, async () =>
      generateReferenceImage({
        supabase,
        referenceId: reference.id,
        requestedByUserId: data.requestedByUserId,
      }),
    );

    return { generatedCount: 1 };
  },
);
