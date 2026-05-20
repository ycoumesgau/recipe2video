/**
 * Produce a one-line error string safe for `console.error` on Windows dev
 * (Next.js `patch-error-inspect` can throw on non-absolute `file://` stack URLs).
 */
export function toLoggableError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message?.trim() || error.name || "Error";
    return error.name && error.name !== "Error"
      ? `${error.name}: ${message}`
      : message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
