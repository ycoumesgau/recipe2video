import "server-only";

import RunwayML, { toFile } from "@runwayml/sdk";
import type { OrganizationRetrieveResponse } from "@runwayml/sdk/resources/organization";
import type { TaskRetrieveResponse } from "@runwayml/sdk/resources/tasks";

import type { GenerationStatus } from "../generation-status";
import {
  RUNWAY_API_VERSION,
  RUNWAY_DEFAULT_REFERENCE_IMAGE_MODEL,
  RUNWAY_DEFAULT_REFERENCE_IMAGE_RATIO,
  RUNWAY_DEFAULT_VIDEO_MODEL,
  RUNWAY_DEFAULT_VIDEO_RATIO,
  RUNWAY_MAX_SEEDANCE_REFERENCES,
  RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES,
  RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS,
  RUNWAY_POLL_INTERVAL_MS,
} from "../runway.constants";
import type {
  CreateRunwayUploadOptions,
  PollRunwayTaskOptions,
  ReferenceImageInput,
  RunwayPromptImage,
  RunwaySeedanceReference,
  RunwaySeedanceVideoReference,
  RunwayTask,
  RunwayTaskEndpoint,
  RunwayTaskStatus,
  RunwayTaskStatusValue,
  SeedanceGenerationInput,
} from "../runway.types";
import {
  normalizeRunwayError,
  RunwayServiceError,
} from "./runway.errors";

export interface CreateRunwayClientOptions {
  apiKey?: string;
  timeoutMs?: number;
}

interface RunwayTaskCreationResponse {
  id: string;
}

export function createRunwayClient(
  options: CreateRunwayClientOptions = {},
): RunwayML {
  const apiKey = options.apiKey ?? process.env.RUNWAYML_API_SECRET;

  if (!apiKey) {
    throw new RunwayServiceError({
      code: "missing_api_key",
      message: "RUNWAYML_API_SECRET is required before calling Runway.",
      retryable: false,
    });
  }

  return new RunwayML({
    apiKey,
    runwayVersion: RUNWAY_API_VERSION,
    timeout: options.timeoutMs,
  });
}

export async function verifyRunwayAccess(): Promise<OrganizationRetrieveResponse> {
  try {
    return await createRunwayClient().organization.retrieve();
  } catch (error) {
    throw normalizeRunwayError(error, "verifyRunwayAccess");
  }
}

export async function createRunwayUpload(
  file: File | Blob,
  options: CreateRunwayUploadOptions = {},
): Promise<string> {
  try {
    const fileName = options.fileName ?? getUploadFileName(file);
    const uploadable = await toFile(file, fileName, {
      type: file.type || "application/octet-stream",
    });
    const upload = await createRunwayClient().uploads.createEphemeral({
      file: uploadable,
      fileMetadata: options.fileMetadata
        ? JSON.stringify(options.fileMetadata)
        : undefined,
    });

    return upload.uri;
  } catch (error) {
    throw normalizeRunwayError(error, "createRunwayUpload");
  }
}

export async function startSeedanceGeneration(
  input: SeedanceGenerationInput,
): Promise<RunwayTask> {
  try {
    assertTotalReferenceCountWithinSeedanceLimit(
      input.promptImage,
      input.references,
    );
    const references = normalizeSeedanceReferences(input.references);
    const referenceVideos = normalizeSeedanceVideoReferences(
      input.referenceVideos,
    );
    const endpoint = getSeedanceEndpoint(input, references, referenceVideos);
    const body = buildSeedanceRequestBody(
      input,
      endpoint,
      references,
      referenceVideos,
    );
    const task = await createRunwayClient().post<RunwayTaskCreationResponse>(
      `/v1/${endpoint}`,
      { body },
    );

    return {
      id: assertRunwayTaskId(task, "startSeedanceGeneration"),
      endpoint,
      generationStatus: "queued",
    };
  } catch (error) {
    throw normalizeRunwayError(error, "startSeedanceGeneration");
  }
}

export async function startReferenceImageGeneration(
  input: ReferenceImageInput,
): Promise<RunwayTask> {
  try {
    const task = await createRunwayClient().post<RunwayTaskCreationResponse>(
      "/v1/text_to_image",
      { body: buildReferenceImageRequestBody(input) },
    );

    return {
      id: assertRunwayTaskId(task, "startReferenceImageGeneration"),
      endpoint: "text_to_image",
      generationStatus: "queued",
    };
  } catch (error) {
    throw normalizeRunwayError(error, "startReferenceImageGeneration");
  }
}

export async function getRunwayTask(
  taskId: string,
): Promise<RunwayTaskStatus> {
  try {
    const task = await createRunwayClient().tasks.retrieve(taskId);
    return mapRunwayTask(task);
  } catch (error) {
    throw normalizeRunwayError(error, "getRunwayTask");
  }
}

export async function pollRunwayTask(
  options: PollRunwayTaskOptions,
): Promise<RunwayTaskStatus> {
  const startedAt = Date.now();
  const pollIntervalMs = Math.max(
    options.pollIntervalMs ?? RUNWAY_POLL_INTERVAL_MS,
    RUNWAY_POLL_INTERVAL_MS,
  );

  while (true) {
    const task = await getRunwayTask(options.taskId);

    if (options.onPoll) {
      await options.onPoll(task);
    }

    if (task.isTerminal) {
      return task;
    }

    if (
      options.timeoutMs !== undefined &&
      Date.now() - startedAt + pollIntervalMs > options.timeoutMs
    ) {
      throw new RunwayServiceError({
        code: "task_timeout",
        message: `pollRunwayTask: Runway task ${options.taskId} timed out.`,
        retryable: true,
        taskId: options.taskId,
      });
    }

    await sleep(pollIntervalMs);
  }
}

export async function downloadRunwayOutput(outputUrl: string): Promise<Blob> {
  try {
    assertHttpsUrl(outputUrl, "Runway output URL");
    const response = await fetch(outputUrl);

    if (!response.ok) {
      throw new RunwayServiceError({
        code: "download_failed",
        message: `downloadRunwayOutput: HTTP ${response.status} while downloading Runway output.`,
        status: response.status,
        retryable: response.status >= 500,
      });
    }

    return await response.blob();
  } catch (error) {
    throw normalizeRunwayError(error, "downloadRunwayOutput");
  }
}

export function mapRunwayStatusToGenerationStatus(
  status: RunwayTaskStatusValue,
): GenerationStatus {
  switch (status) {
    case "PENDING":
    case "THROTTLED":
      return "queued";
    case "RUNNING":
      return "processing";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
      return "failed";
    case "CANCELLED":
      return "cancelled";
  }
}

/**
 * Resolves the correct Seedance endpoint based on the input shape.
 *
 * Seedance 2 exposes the top-level `references[]` (image, up to 9) and
 * `referenceVideos[]` (video, up to 3, combined <= 15s) arrays
 * EXCLUSIVELY on `text_to_video`. The `image_to_video` endpoint uses
 * `promptImage` for first/last keyframes and rejects any extra
 * `references` field; the `video_to_video` endpoint uses `promptVideo`
 * as a source video to transform and likewise rejects the reference
 * arrays. We therefore route any payload that carries top-level
 * references (image or video) to `text_to_video`.
 *
 * Source: https://docs.dev.runwayml.com/guides/seedance/ (verified 2026-05-18).
 */
function getSeedanceEndpoint(
  input: SeedanceGenerationInput,
  references: RunwaySeedanceReference[],
  referenceVideos: RunwaySeedanceVideoReference[],
): RunwayTaskEndpoint {
  if (input.promptImage && input.promptVideo) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: "Seedance generation accepts either promptImage or promptVideo, not both.",
      retryable: false,
    });
  }

  if (input.promptImage && references.length > 0) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message:
        "Seedance image_to_video does not support a top-level references[] array; pass keyframes via promptImage only.",
      retryable: false,
    });
  }

  if (input.promptImage && referenceVideos.length > 0) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message:
        "Seedance image_to_video does not support a top-level referenceVideos[] array; pass keyframes via promptImage only.",
      retryable: false,
    });
  }

  if (input.promptVideo && referenceVideos.length > 0) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message:
        "Seedance video_to_video uses promptVideo as a source clip and does not accept a referenceVideos[] array. Move the video reference to a text_to_video request.",
      retryable: false,
    });
  }

  if (input.promptVideo) {
    return "video_to_video";
  }

  if (input.promptImage) {
    return "image_to_video";
  }

  return "text_to_video";
}

function buildSeedanceRequestBody(
  input: SeedanceGenerationInput,
  endpoint: RunwayTaskEndpoint,
  references: RunwaySeedanceReference[],
  referenceVideos: RunwaySeedanceVideoReference[],
) {
  const base = stripUndefined({
    model: input.model ?? RUNWAY_DEFAULT_VIDEO_MODEL,
    promptText: input.promptText,
    seed: input.seed,
  });

  if (endpoint === "video_to_video") {
    return stripUndefined({
      ...base,
      promptVideo: normalizeRunwayUriOrHttpsUrl(input.promptVideo, "promptVideo"),
      references: references.length > 0 ? references : undefined,
    });
  }

  if (endpoint === "image_to_video") {
    // image_to_video is Seedance 2's keyframe mode: `promptImage` may be a
    // single uri (start frame) or a `[first, last]` keyframe pair. The
    // top-level `references` array is NOT accepted here and must be empty.
    return stripUndefined({
      ...base,
      promptImage: normalizePromptImage(input.promptImage),
      duration: input.durationSeconds,
      ratio: input.ratio ?? RUNWAY_DEFAULT_VIDEO_RATIO,
    });
  }

  // text_to_video is Seedance 2's "References Pack" mode: up to 9 image
  // references in `references[]` and up to 3 video references in
  // `referenceVideos[]` (combined <= 15s), no source frame. This is the
  // path used by Recipe2Video's segment generator.
  return stripUndefined({
    ...base,
    duration: input.durationSeconds,
    ratio: input.ratio ?? RUNWAY_DEFAULT_VIDEO_RATIO,
    references: references.length > 0 ? references : undefined,
    referenceVideos:
      referenceVideos.length > 0
        ? referenceVideos.map((reference) => ({
            type: reference.type ?? "video",
            uri: reference.uri,
          }))
        : undefined,
  });
}

function buildReferenceImageRequestBody(input: ReferenceImageInput) {
  return stripUndefined({
    model: input.model ?? RUNWAY_DEFAULT_REFERENCE_IMAGE_MODEL,
    promptText: input.promptText,
    ratio: input.ratio ?? RUNWAY_DEFAULT_REFERENCE_IMAGE_RATIO,
    referenceImages: input.referenceImages?.map((reference) => ({
      uri: normalizeRunwayUriOrHttpsUrl(reference.uri, "referenceImages.uri"),
      tag: reference.tag,
    })),
    outputCount: input.outputCount,
    quality: input.quality,
    background: input.background,
    seed: input.seed,
  });
}

function normalizeSeedanceReferences(
  references: RunwaySeedanceReference[] = [],
): RunwaySeedanceReference[] {
  if (references.length > RUNWAY_MAX_SEEDANCE_REFERENCES) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance generation supports at most ${RUNWAY_MAX_SEEDANCE_REFERENCES} references.`,
      retryable: false,
    });
  }

  return references.map((reference) => ({
    type: reference.type ?? "image",
    uri: normalizeRunwayUriOrHttpsUrl(reference.uri, "references.uri"),
  }));
}

/**
 * Validates and normalizes the `referenceVideos[]` array for Seedance 2
 * `text_to_video`. The Runway contract caps the array at 3 entries with a
 * combined duration <= 15s. We enforce both upfront so an oversized payload
 * fails locally instead of after a Runway round-trip with an opaque error.
 *
 * `durationSeconds` is optional in the input shape: when callers do not
 * surface it (e.g. the agent declared a video reference whose underlying
 * `media_assets.duration_seconds` is null), we skip the combined-duration
 * check and let Runway reject the request if the actual length is over.
 */
function normalizeSeedanceVideoReferences(
  referenceVideos: RunwaySeedanceVideoReference[] = [],
): RunwaySeedanceVideoReference[] {
  if (referenceVideos.length > RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance generation supports at most ${RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES} video references.`,
      retryable: false,
    });
  }

  const totalDurationSeconds = referenceVideos.reduce(
    (acc, reference) =>
      typeof reference.durationSeconds === "number"
        ? acc + reference.durationSeconds
        : acc,
    0,
  );
  if (
    totalDurationSeconds > RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS
  ) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance video references combined duration is ${totalDurationSeconds.toFixed(2)}s but Runway caps the total at ${RUNWAY_MAX_SEEDANCE_VIDEO_REFERENCES_TOTAL_SECONDS}s.`,
      retryable: false,
    });
  }

  return referenceVideos.map((reference) => ({
    type: reference.type ?? "video",
    uri: normalizeRunwayUriOrHttpsUrl(reference.uri, "referenceVideos.uri"),
    durationSeconds: reference.durationSeconds,
  }));
}

/**
 * Enforce the total reference cap exposed in `.cursor/rules/recipe2video-seedance-segments.mdc`
 * and the PRD: at most 9 image references per Seedance segment, counting
 * `promptImage` (when used as a single image reference) AND every entry in
 * `references`. This prevents the orchestrator from over-shooting the limit
 * by extracting the first reference into `promptImage` while still passing 9
 * images in the array.
 */
function assertTotalReferenceCountWithinSeedanceLimit(
  promptImage: RunwayPromptImage | undefined,
  references: RunwaySeedanceReference[] | undefined,
) {
  // First/last keyframe arrays follow Runway's separate keyframe contract and
  // are checked elsewhere (`assertReferencesAreNotMixedWithKeyframes`); they
  // do not consume the 9-reference budget.
  const promptImageCount = typeof promptImage === "string" ? 1 : 0;
  const referencesCount = references?.length ?? 0;
  const total = promptImageCount + referencesCount;

  if (total > RUNWAY_MAX_SEEDANCE_REFERENCES) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `Seedance generation supports at most ${RUNWAY_MAX_SEEDANCE_REFERENCES} image references in total (promptImage + references). Got ${total}.`,
      retryable: false,
    });
  }
}

function normalizePromptImage(promptImage: RunwayPromptImage | undefined) {
  if (!promptImage) {
    return undefined;
  }

  if (typeof promptImage === "string") {
    return normalizeRunwayUriOrHttpsUrl(promptImage, "promptImage");
  }

  return promptImage.map((image) => ({
    uri: normalizeRunwayUriOrHttpsUrl(image.uri, "promptImage.uri"),
    position: image.position,
  }));
}

function mapRunwayTask(task: TaskRetrieveResponse): RunwayTaskStatus {
  const generationStatus = mapRunwayStatusToGenerationStatus(
    task.status as RunwayTaskStatusValue,
  );
  const base = {
    id: task.id,
    status: task.status as RunwayTaskStatusValue,
    generationStatus,
    createdAt: task.createdAt,
    isTerminal:
      task.status === "SUCCEEDED" ||
      task.status === "FAILED" ||
      task.status === "CANCELLED",
  };

  if (task.status === "RUNNING") {
    return { ...base, progress: task.progress };
  }

  if (task.status === "FAILED") {
    return {
      ...base,
      failure: task.failure,
      failureCode: task.failureCode,
    };
  }

  if (task.status === "SUCCEEDED") {
    return { ...base, output: task.output };
  }

  return base;
}

function assertRunwayTaskId(
  task: RunwayTaskCreationResponse,
  context: string,
) {
  if (!task.id) {
    throw new RunwayServiceError({
      code: "runway_api_error",
      message: `${context}: Runway did not return a task ID.`,
      retryable: false,
    });
  }

  return task.id;
}

function normalizeRunwayUriOrHttpsUrl(value: string | undefined, label: string) {
  if (!value) {
    throw new RunwayServiceError({
      code: "invalid_input",
      message: `${label} is required.`,
      retryable: false,
    });
  }

  if (value.startsWith("runway://")) {
    return value;
  }

  assertHttpsUrl(value, label);
  return value;
}

function assertHttpsUrl(value: string, label: string) {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new RunwayServiceError({
      code: "invalid_output_url",
      message: `${label} must be a valid HTTPS URL or runway:// URI.`,
      retryable: false,
    });
  }

  if (url.protocol !== "https:") {
    throw new RunwayServiceError({
      code: "invalid_output_url",
      message: `${label} must use HTTPS.`,
      retryable: false,
    });
  }
}

function getUploadFileName(file: File | Blob) {
  if ("name" in file && typeof file.name === "string" && file.name.length > 0) {
    return file.name;
  }

  return "runway-reference-upload";
}

function stripUndefined<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined),
  );
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
