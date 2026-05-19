import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { logCost } from "@/modules/costs/repositories/cost.repository";

import { updateReferenceAssetStatus } from "../repositories/reference.repository";
import type { ReferenceStatus } from "../reference-status";
import {
  prepareReferenceImageGeneration,
  requestReferenceImageGenerationWorkflow,
  type ReferenceGenerationRequestedData,
  type RequestReferenceGenerationDeps,
} from "./orchestrate-reference-generation";

export interface GenerateReferenceImageInput {
  supabase: SupabaseDataClient;
  referenceId: string;
  requestedByUserId: string;
  videoId: string;
  awaitCompletionEvent?: boolean;
  sendEvent: RequestReferenceGenerationDeps["sendEvent"];
}

/**
 * Queue a recipe-specific reference image generation on Runway. Polling and
 * persistence run through dedicated Inngest handlers (`pollReferenceGeneration`,
 * `persistReferenceOutput`) so long GPT-Image 2 tasks are not bounded by a
 * single blocking step timeout.
 */
export async function generateReferenceImage(
  input: GenerateReferenceImageInput,
): Promise<{ runwayTaskId: string }> {
  const deps: RequestReferenceGenerationDeps = {
    prepareReferenceGeneration: (referenceId) =>
      prepareReferenceImageGeneration(input.supabase, referenceId),
    updateReferenceAssetStatus: async (
      referenceId: string,
      status: ReferenceStatus,
    ) => {
      await updateReferenceAssetStatus(input.supabase, { referenceId, status });
    },
    logCost: async (costInput) => {
      await logCost(input.supabase, costInput);
    },
    sendEvent: input.sendEvent,
  };

  const data: ReferenceGenerationRequestedData = {
    referenceId: input.referenceId,
    videoId: input.videoId,
    requestedByUserId: input.requestedByUserId,
    awaitCompletionEvent: input.awaitCompletionEvent,
  };

  return requestReferenceImageGenerationWorkflow(data, deps);
}

export { prepareReferenceImageGeneration } from "./orchestrate-reference-generation";
