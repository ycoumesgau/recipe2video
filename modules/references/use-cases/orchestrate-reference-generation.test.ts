import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  pollReferenceImageGenerationWorkflow,
  REFERENCE_IMAGE_MAX_POLL_DURATION_MS,
} from "./reference-image-poll-workflow";

describe("pollReferenceImageGenerationWorkflow", () => {
  test("schedules another poll while the task is still running", async () => {
    const sent: Array<{ name: string; data: Record<string, unknown> }> = [];

    const result = await pollReferenceImageGenerationWorkflow(
      {
        referenceId: "ref-1",
        taskId: "task-1",
        videoId: "video-1",
        requestedByUserId: "user-1",
        pollStartedAt: new Date().toISOString(),
      },
      {
        getReferenceAssetById: async () => ({
          id: "ref-1",
          videoId: "video-1",
        }),
        getRunwayTask: async () => ({
          id: "task-1",
          status: "RUNNING",
          generationStatus: "processing",
          progress: 0.42,
          isTerminal: false,
        }),
        updateReferenceAssetRunwayPollState: async () => {},
        updateReferenceAssetStatus: async () => {},
        sendEvent: async (event) => {
          sent.push(event);
        },
      },
    );

    assert.equal(result.terminal, false);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.name, "reference.generation.poll.requested");
    assert.equal(sent[0]?.data.taskId, "task-1");
  });

  test("routes succeeded tasks to persist", async () => {
    const sent: Array<{ name: string }> = [];

    const result = await pollReferenceImageGenerationWorkflow(
      {
        referenceId: "ref-1",
        taskId: "task-1",
        videoId: "video-1",
        requestedByUserId: "user-1",
        pollStartedAt: new Date().toISOString(),
      },
      {
        getReferenceAssetById: async () => ({
          id: "ref-1",
          videoId: "video-1",
        }),
        getRunwayTask: async () => ({
          id: "task-1",
          status: "SUCCEEDED",
          generationStatus: "succeeded",
          output: ["https://example.com/out.png"],
          isTerminal: true,
        }),
        updateReferenceAssetRunwayPollState: async () => {},
        updateReferenceAssetStatus: async () => {},
        sendEvent: async (event) => {
          sent.push(event);
        },
      },
    );

    assert.equal(result.terminal, true);
    assert.equal(sent[0]?.name, "reference.output.persist.requested");
  });

  test("marks failed and emits completion when the poll budget is exceeded", async () => {
    const statuses: string[] = [];
    const sent: Array<{ name: string }> = [];
    const startedAt = new Date(
      Date.now() - REFERENCE_IMAGE_MAX_POLL_DURATION_MS - 1_000,
    ).toISOString();

    await assert.rejects(
      () =>
        pollReferenceImageGenerationWorkflow(
          {
            referenceId: "ref-1",
            taskId: "task-1",
            videoId: "video-1",
            requestedByUserId: "user-1",
            pollStartedAt: startedAt,
            awaitCompletionEvent: true,
          },
          {
            getReferenceAssetById: async () => ({
              id: "ref-1",
              videoId: "video-1",
            }),
            getRunwayTask: async () => {
              throw new Error("getRunwayTask should not run after budget exceeded");
            },
            updateReferenceAssetRunwayPollState: async () => {},
            updateReferenceAssetStatus: async (_id, status) => {
              statuses.push(status);
            },
            sendEvent: async (event) => {
              sent.push(event);
            },
          },
        ),
      /exceeded the 15 minute poll budget/,
    );

    assert.deepEqual(statuses, ["failed"]);
    assert.equal(sent[0]?.name, "reference.generation.completed");
  });
});
