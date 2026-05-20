/**
 * Inngest workflow that generates an album cover for a video project.
 * Self-contained: starts a GPT-Image 2 task on Runway, polls until
 * terminal, downloads the output, persists it to the `album-covers`
 * bucket as a new variant, and points
 * `song_cover_artifacts.active_media_asset_id` at the new variant.
 *
 * Sequencing rationale: the album cover task is small (a single image,
 * typically a few seconds on Runway) so the entire pipeline fits in
 * one Inngest function with its own poll loop. This avoids the extra
 * complexity of the references workflow (separate poll + persist
 * events) for a much shorter task. If the function exceeds the
 * Inngest step timeout one day, we can split it into poll + persist
 * events like references — the building blocks already exist in
 * `modules/generation/use-cases/orchestrate-gpt-image-generation.ts`.
 */

import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import { startGptImageGeneration } from "@/modules/generation/use-cases/orchestrate-gpt-image-generation";
import {
  downloadRunwayOutput,
  getRunwayTask,
} from "@/modules/generation/services/runway.service";
import { RUNWAY_POLL_INTERVAL_MS } from "@/modules/generation/runway.constants";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import { resolveConditioningAnchors } from "@/modules/references/use-cases/resolve-conditioning-anchors";
import {
  getSongCoverArtifactForVideoByKind,
  updateSongCoverArtifact,
} from "@/modules/song-cover/repositories/song-cover.repository";

import { inngest } from "../client";
import { INNGEST_EVENTS, type SongCoverGenerateRequestedData } from "../events";

/** 2K tier (20 credits at default `high` quality); export upscales to 3000×3000. */
const ALBUM_COVER_RATIO_CANDIDATES = ["2048:2048"];
const ALBUM_COVER_POLL_TIMEOUT_MS = 10 * 60 * 1000;

export const generateAlbumCoverWorkflow = inngest.createFunction(
  {
    id: "generate-album-cover-workflow",
    // No retry: each step charges Runway credits and uploads a file.
    // The operator retries from the UI when needed.
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.songCoverGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as SongCoverGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();

    const artifact = await getSongCoverArtifactForVideoByKind(
      supabase,
      data.videoId,
      "album_cover",
    );
    if (!artifact) {
      throw new Error(
        `No album_cover row in song_cover_artifacts for video ${data.videoId}. Ask the agent to plan publication assets first (publication_planning stage).`,
      );
    }

    if (!artifact.prompt || artifact.prompt.trim().length === 0) {
      throw new Error(
        `song_cover_artifacts ${artifact.id} has no prompt; the operator must edit the prompt before generating.`,
      );
    }

    // Resolve conditioning anchors against the live library. We pass
    // the `album_cover` context so character anchors are allowed (the
    // mascot is the hero of the artwork, unlike recipe-state refs).
    const resolution = await step.run("resolve-cover-anchors", async () => {
      return resolveConditioningAnchors(
        supabase,
        artifact.imageReferenceCanonicalNames,
        "album_cover",
      );
    });

    // Flip the row to `generating` so the UI shows the in-progress state
    // immediately. Any subsequent failure flips it back to `failed`.
    await step.run("mark-cover-generating", async () => {
      await updateSongCoverArtifact(supabase, artifact.id, {
        status: "generating",
        runwayTaskId: null,
        runwayTaskStatus: null,
        runwayProgress: null,
      });
    });

    try {
      const startOutcome = await step.run("start-album-cover-task", async () =>
        startGptImageGeneration({
          artifactKind: "album_cover",
          artifactId: artifact.id,
          videoId: artifact.videoId,
          requestedByUserId: data.requestedByUserId,
          promptText: artifact.prompt,
          ratioCandidates: ALBUM_COVER_RATIO_CANDIDATES,
          model: "gpt_image_2",
          referenceImages: resolution.anchors.map((anchor) => ({
            uri: anchor.uri,
            tag: anchor.tag,
          })),
          costMetadata: {
            conditioningResolvedTags: resolution.anchors.map((a) => a.tag),
            conditioningUnresolved: resolution.unresolvedNames,
            conditioningExcluded: resolution.excludedAnchors,
          },
          logCost: (input) => logCost(supabase, input),
        }),
      );

      await step.run("record-cover-runway-task", async () => {
        await updateSongCoverArtifact(supabase, artifact.id, {
          runwayTaskId: startOutcome.runwayTaskId,
          runwayTaskStatus: "PENDING",
          runwayProgress: null,
        });
      });

      // Poll Runway in a single step that sleeps + checks repeatedly.
      // Each iteration is a sub-step so retries do not re-spend credits.
      const startedAt = Date.now();
      while (true) {
        await step.sleep(
          "wait-before-poll-album-cover",
          `${Math.round(RUNWAY_POLL_INTERVAL_MS / 1000)}s`,
        );

        const taskStatus = await step.run("poll-album-cover-task", async () =>
          getRunwayTask(startOutcome.runwayTaskId),
        );

        await step.run("save-album-cover-poll-state", async () => {
          await updateSongCoverArtifact(supabase, artifact.id, {
            runwayTaskStatus: taskStatus.status,
            runwayProgress:
              typeof taskStatus.progress === "number"
                ? taskStatus.progress * 100
                : null,
          });
        });

        if (taskStatus.isTerminal) {
          if (taskStatus.status !== "SUCCEEDED") {
            throw new Error(
              `Runway task ${startOutcome.runwayTaskId} ended with status ${taskStatus.status}${
                taskStatus.failure ? `: ${taskStatus.failure}` : ""
              }`,
            );
          }

          const outputUrl = taskStatus.output?.[0];
          if (!outputUrl) {
            throw new Error(
              `Runway task ${startOutcome.runwayTaskId} succeeded but produced no output URL.`,
            );
          }

          const persisted = await step.run("persist-album-cover-output", async () => {
            const blob = await downloadRunwayOutput(outputUrl);
            const mediaAsset = await persistMediaAssetFile({
              supabase,
              type: "album_cover_image",
              provider: "runway",
              body: blob,
              videoId: artifact.videoId,
              songCoverArtifactId: artifact.id,
              songCoverVariantId: startOutcome.runwayTaskId,
              mimeType: blob.type || "image/png",
              fileSizeBytes: blob.size,
              runwayOutputUrl: outputUrl,
              metadata: {
                source: "runway_text_to_image",
                songCoverArtifactId: artifact.id,
                songCoverArtifactKind: "album_cover",
                runwayTaskId: startOutcome.runwayTaskId,
                model: "gpt_image_2",
                ratio: startOutcome.ratioUsed,
                ratioAttempts: startOutcome.ratioAttempts,
                prompt: artifact.prompt,
                conditioningAnchors: resolution.anchors.map((anchor) => ({
                  canonicalName: anchor.canonicalName,
                  tag: anchor.tag,
                  requestedName: anchor.requestedName,
                })),
                conditioningUnresolved: resolution.unresolvedNames,
                conditioningExcluded: resolution.excludedAnchors,
              },
              createdBy: data.requestedByUserId,
              upsert: true,
            });

            await updateSongCoverArtifact(supabase, artifact.id, {
              status: "generated",
              activeMediaAssetId: mediaAsset.id,
              runwayTaskStatus: "SUCCEEDED",
              runwayProgress: 100,
            });

            await logCost(supabase, {
              videoId: artifact.videoId,
              segmentId: null,
              provider: "runway",
              model: "gpt_image_2",
              operation: "album_cover_generation_succeeded",
              creditsUsed: null,
              metadata: {
                artifactKind: "album_cover",
                artifactId: artifact.id,
                runwayTaskId: startOutcome.runwayTaskId,
                mediaAssetId: mediaAsset.id,
                ratio: startOutcome.ratioUsed,
              },
              createdBy: data.requestedByUserId,
            });

            return { mediaAssetId: mediaAsset.id };
          });

          return {
            artifactId: artifact.id,
            runwayTaskId: startOutcome.runwayTaskId,
            ratioUsed: startOutcome.ratioUsed,
            mediaAssetId: persisted.mediaAssetId,
          };
        }

        if (Date.now() - startedAt > ALBUM_COVER_POLL_TIMEOUT_MS) {
          throw new Error(
            `Runway task ${startOutcome.runwayTaskId} timed out after ${ALBUM_COVER_POLL_TIMEOUT_MS / 1000}s`,
          );
        }
      }
    } catch (error) {
      await updateSongCoverArtifact(supabase, artifact.id, {
        status: "failed",
        runwayTaskStatus: "FAILED",
      });
      throw error;
    }
  },
);
