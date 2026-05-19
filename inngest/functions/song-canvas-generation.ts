/**
 * Inngest workflow that generates a 5-8s Spotify Canvas for a video
 * project. Self-contained: starts a Seedance 2 `text_to_video` task on
 * Runway at 1080:1920, polls until terminal, downloads the MP4, and
 * persists it to the `spotify-canvases` bucket as a new variant.
 *
 * The prompt is the operator-editable text stored on
 * `song_cover_artifacts.prompt` (kind=spotify_canvas). The handler
 * appends a fixed Spotify-policy negatives suffix if it is not already
 * present in the prompt, so manual edits do not accidentally drop the
 * guardrails.
 */

import { assertAllowlistedUser } from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { logCost } from "@/modules/costs/repositories/cost.repository";
import { startSeedanceVideo } from "@/modules/generation/services/seedance-video-runner";
import {
  downloadRunwayOutput,
  getRunwayTask,
} from "@/modules/generation/services/runway.service";
import {
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_POLL_INTERVAL_MS,
} from "@/modules/generation/runway.constants";
import { persistMediaAssetFile } from "@/modules/media-assets/use-cases/persist-media-asset";
import {
  getSongCoverArtifactForVideoByKind,
  updateSongCoverArtifact,
} from "@/modules/song-cover/repositories/song-cover.repository";
import { resolveSongCoverReferences } from "@/modules/song-cover/use-cases/resolve-song-cover-references";

import { inngest } from "../client";
import { INNGEST_EVENTS, type SongCanvasGenerateRequestedData } from "../events";

const CANVAS_POLL_TIMEOUT_MS = 20 * 60 * 1000;

/**
 * Spotify content policy guardrails appended to the operator prompt at
 * generation time if not already present. Each clause is checked with
 * a lowercase substring match so operator edits stay intact.
 */
const SPOTIFY_NEGATIVES_SUFFIX = [
  "",
  "Spotify Canvas policy negatives:",
  "- no text on screen, no captions, no typography of any kind",
  "- no logo, no brand mark, no URL, no watermark",
  "- no human face, no lipsync (mascot included)",
  "- no rapid cuts, no intense flashes, no strobing",
  "- no irreversible motion of the dish state during the loop",
].join("\n");

export const generateSpotifyCanvasWorkflow = inngest.createFunction(
  {
    id: "generate-spotify-canvas-workflow",
    retries: 0,
    triggers: [{ event: INNGEST_EVENTS.songCanvasGenerateRequested }],
  },
  async ({ event, step }) => {
    const data = event.data as SongCanvasGenerateRequestedData;

    await assertAllowlistedUser(data.requestedByUserId);

    const supabase = createSupabaseAdminClient();

    const artifact = await getSongCoverArtifactForVideoByKind(
      supabase,
      data.videoId,
      "spotify_canvas",
    );
    if (!artifact) {
      throw new Error(
        `No spotify_canvas row in song_cover_artifacts for video ${data.videoId}. Ask the agent to plan publication assets first (publication_planning stage).`,
      );
    }

    if (!artifact.prompt || artifact.prompt.trim().length === 0) {
      throw new Error(
        `song_cover_artifacts ${artifact.id} has no prompt; the operator must edit the prompt before generating.`,
      );
    }
    if (!artifact.durationSeconds) {
      throw new Error(
        `song_cover_artifacts ${artifact.id} has no duration; agent plan must specify 5-8 seconds.`,
      );
    }
    if (!artifact.loopAnchorReferenceName) {
      throw new Error(
        `song_cover_artifacts ${artifact.id} has no loop anchor; agent plan must designate one image reference as the loop anchor.`,
      );
    }

    // Resolve image + video references the same way Seedance segments
    // resolve theirs: library globals expose signed URLs minted at
    // generation time; recipe-specific references expose their stored
    // runway_uri. Any unresolved name is a hard failure here (unlike
    // the sync warning) — we cannot start a Runway task with missing
    // anchors.
    const resolution = await step.run("resolve-canvas-references", async () => {
      return resolveSongCoverReferences(supabase, {
        videoId: artifact.videoId,
        requestedNames: [
          ...artifact.imageReferenceCanonicalNames,
          ...artifact.videoReferenceCanonicalNames,
        ],
      });
    });

    if (resolution.unresolvedNames.length > 0) {
      throw new Error(
        `Spotify Canvas generation aborted: unresolved references ${resolution.unresolvedNames.join(", ")}. Fix the canonical names in the Cover & Canvas card before regenerating.`,
      );
    }

    const images = resolution.references.filter(
      (r) =>
        r.kind === "image" &&
        artifact.imageReferenceCanonicalNames.includes(r.requestedName),
    );
    const videos = resolution.references.filter(
      (r) =>
        r.kind === "video" &&
        artifact.videoReferenceCanonicalNames.includes(r.requestedName),
    );

    await step.run("mark-canvas-generating", async () => {
      await updateSongCoverArtifact(supabase, artifact.id, {
        status: "generating",
        runwayTaskId: null,
        runwayTaskStatus: null,
        runwayProgress: null,
      });
    });

    try {
      const finalPrompt = appendSpotifyNegativesIfMissing(artifact.prompt);

      const startOutcome = await step.run(
        "start-spotify-canvas-task",
        async () =>
          startSeedanceVideo({
            artifactKind: "spotify_canvas",
            artifactId: artifact.id,
            videoId: artifact.videoId,
            requestedByUserId: data.requestedByUserId,
            promptText: finalPrompt,
            durationSeconds: artifact.durationSeconds!,
            ratio: RUNWAY_DEFAULT_VIDEO_RATIO,
            references: images.map((r) => ({ uri: r.uri, type: "image" })),
            referenceVideos: videos.map((r) => ({
              uri: r.uri,
              type: "video" as const,
              durationSeconds:
                typeof r.durationSeconds === "number"
                  ? r.durationSeconds
                  : undefined,
            })),
            costMetadata: {
              loopAnchorReferenceName: artifact.loopAnchorReferenceName,
              imageReferenceCanonicalNames:
                artifact.imageReferenceCanonicalNames,
              videoReferenceCanonicalNames:
                artifact.videoReferenceCanonicalNames,
            },
            logCost: (input) => logCost(supabase, input),
          }),
      );

      await step.run("record-canvas-runway-task", async () => {
        await updateSongCoverArtifact(supabase, artifact.id, {
          runwayTaskId: startOutcome.runwayTaskId,
          runwayTaskStatus: "PENDING",
          runwayProgress: null,
        });
      });

      const startedAt = Date.now();
      while (true) {
        await step.sleep(
          "wait-before-poll-canvas",
          `${Math.round(RUNWAY_POLL_INTERVAL_MS / 1000)}s`,
        );

        const taskStatus = await step.run("poll-canvas-task", async () =>
          getRunwayTask(startOutcome.runwayTaskId),
        );

        await step.run("save-canvas-poll-state", async () => {
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

          const persisted = await step.run("persist-canvas-output", async () => {
            const blob = await downloadRunwayOutput(outputUrl);
            const mediaAsset = await persistMediaAssetFile({
              supabase,
              type: "spotify_canvas_video",
              provider: "runway",
              body: blob,
              videoId: artifact.videoId,
              songCoverArtifactId: artifact.id,
              songCoverVariantId: startOutcome.runwayTaskId,
              mimeType: blob.type || "video/mp4",
              fileSizeBytes: blob.size,
              durationSeconds: artifact.durationSeconds,
              runwayOutputUrl: outputUrl,
              metadata: {
                source: "runway_text_to_video",
                songCoverArtifactId: artifact.id,
                songCoverArtifactKind: "spotify_canvas",
                runwayTaskId: startOutcome.runwayTaskId,
                model: "seedance2",
                ratio: startOutcome.ratio,
                durationSeconds: artifact.durationSeconds,
                loopAnchorReferenceName: artifact.loopAnchorReferenceName,
                prompt: finalPrompt,
                imageReferenceCanonicalNames:
                  artifact.imageReferenceCanonicalNames,
                videoReferenceCanonicalNames:
                  artifact.videoReferenceCanonicalNames,
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
              model: "seedance2",
              operation: "spotify_canvas_generation_succeeded",
              creditsUsed: null,
              metadata: {
                artifactKind: "spotify_canvas",
                artifactId: artifact.id,
                runwayTaskId: startOutcome.runwayTaskId,
                mediaAssetId: mediaAsset.id,
                ratio: startOutcome.ratio,
                durationSeconds: artifact.durationSeconds,
              },
              createdBy: data.requestedByUserId,
            });

            return { mediaAssetId: mediaAsset.id };
          });

          return {
            artifactId: artifact.id,
            runwayTaskId: startOutcome.runwayTaskId,
            mediaAssetId: persisted.mediaAssetId,
            durationSeconds: artifact.durationSeconds,
          };
        }

        if (Date.now() - startedAt > CANVAS_POLL_TIMEOUT_MS) {
          throw new Error(
            `Runway task ${startOutcome.runwayTaskId} timed out after ${CANVAS_POLL_TIMEOUT_MS / 1000}s`,
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

function appendSpotifyNegativesIfMissing(prompt: string): string {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("no text on screen") &&
    lower.includes("no logo") &&
    lower.includes("no lipsync")
  ) {
    return prompt;
  }
  return `${prompt}\n${SPOTIFY_NEGATIVES_SUFFIX}`;
}

