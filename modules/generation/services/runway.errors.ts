import {
  APIError,
  AuthenticationError,
  BadRequestError,
  PermissionDeniedError,
  RateLimitError,
  TaskFailedError,
  TaskTimedOutError,
} from "@runwayml/sdk";

export type RunwayServiceErrorCode =
  | "missing_api_key"
  | "invalid_input"
  | "invalid_output_url"
  | "unauthorized"
  | "rate_limited"
  | "task_failed"
  | "task_cancelled"
  | "task_timeout"
  | "download_failed"
  | "runway_api_error"
  | "unknown";

export interface RunwayServiceErrorDetails {
  code: RunwayServiceErrorCode;
  message: string;
  status?: number;
  retryable?: boolean;
  taskId?: string;
  failureCode?: string;
  cause?: unknown;
}

export class RunwayServiceError extends Error {
  readonly code: RunwayServiceErrorCode;
  readonly status?: number;
  readonly retryable: boolean;
  readonly taskId?: string;
  readonly failureCode?: string;

  constructor(details: RunwayServiceErrorDetails) {
    super(details.message, { cause: details.cause });
    this.name = "RunwayServiceError";
    this.code = details.code;
    this.status = details.status;
    this.retryable = details.retryable ?? false;
    this.taskId = details.taskId;
    this.failureCode = details.failureCode;
  }
}

export function isRunwayServiceError(
  error: unknown,
): error is RunwayServiceError {
  return error instanceof RunwayServiceError;
}

export function normalizeRunwayError(
  error: unknown,
  context: string,
): RunwayServiceError {
  if (error instanceof RunwayServiceError) {
    return error;
  }

  if (error instanceof TaskTimedOutError) {
    return new RunwayServiceError({
      code: "task_timeout",
      message: `${context}: Runway task timed out.`,
      retryable: true,
      taskId: error.taskDetails.id,
      cause: error,
    });
  }

  if (error instanceof TaskFailedError) {
    const isCancelled = error.taskDetails.status === "CANCELLED";

    return new RunwayServiceError({
      code: isCancelled ? "task_cancelled" : "task_failed",
      message: `${context}: Runway task ${isCancelled ? "was cancelled" : "failed"}.`,
      retryable: !isCancelled,
      taskId: error.taskDetails.id,
      failureCode:
        "failureCode" in error.taskDetails
          ? error.taskDetails.failureCode
          : undefined,
      cause: error,
    });
  }

  if (error instanceof AuthenticationError || error instanceof PermissionDeniedError) {
    return new RunwayServiceError({
      code: "unauthorized",
      message: `${context}: Runway credentials are missing or not authorized.`,
      status: error.status,
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof RateLimitError) {
    return new RunwayServiceError({
      code: "rate_limited",
      message: `${context}: Runway rate limit reached.`,
      status: error.status,
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof BadRequestError) {
    return new RunwayServiceError({
      code: "invalid_input",
      message: `${context}: Runway rejected the request input.`,
      status: error.status,
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof APIError) {
    const status = error.status;

    return new RunwayServiceError({
      code: "runway_api_error",
      message: `${context}: Runway API request failed.`,
      status,
      retryable: status === 429 || status === undefined || status >= 500,
      cause: error,
    });
  }

  return new RunwayServiceError({
    code: "unknown",
    message: `${context}: Unexpected Runway integration error.`,
    retryable: false,
    cause: error,
  });
}
