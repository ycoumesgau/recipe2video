/**
 * Dev-only auth bypass — allows cloud agents and local dev to skip Supabase
 * Auth while still resolving the user through the allowlist and profile tables.
 *
 * The env var DEV_AUTH_BYPASS_ALLOWLIST_EMAIL must NEVER be set in production.
 */

const DEV_BYPASS_ENV_KEY = "DEV_AUTH_BYPASS_ALLOWLIST_EMAIL";

export function getDevBypassEmail(): string | null {
  const email = process.env[DEV_BYPASS_ENV_KEY];
  if (!email) return null;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `${DEV_BYPASS_ENV_KEY} must not be set in production. ` +
        "Remove the variable or unset it before deploying.",
    );
  }

  return email.trim().toLowerCase();
}
