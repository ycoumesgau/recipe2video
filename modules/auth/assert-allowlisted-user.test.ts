import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";

import { getDevBypassEmail } from "./dev-bypass";

function withEnv(
  overrides: Record<string, string | undefined>,
  fn: () => void,
) {
  const originals: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    originals[key] = process.env[key];
    if (overrides[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = overrides[key];
    }
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(originals)) {
      if (originals[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originals[key];
      }
    }
  }
}

describe("getDevBypassEmail", () => {
  afterEach(() => {
    delete process.env.DEV_AUTH_BYPASS_ALLOWLIST_EMAIL;
  });

  test("returns null when DEV_AUTH_BYPASS_ALLOWLIST_EMAIL is not set", () => {
    withEnv({ DEV_AUTH_BYPASS_ALLOWLIST_EMAIL: undefined, NODE_ENV: "development" }, () => {
      assert.equal(getDevBypassEmail(), null);
    });
  });

  test("returns normalized email in non-production env", () => {
    withEnv(
      { DEV_AUTH_BYPASS_ALLOWLIST_EMAIL: "  Yoann@Licorn.org  ", NODE_ENV: "development" },
      () => {
        assert.equal(getDevBypassEmail(), "yoann@licorn.org");
      },
    );
  });

  test("returns normalized email when NODE_ENV is test", () => {
    withEnv(
      { DEV_AUTH_BYPASS_ALLOWLIST_EMAIL: "dev@example.com", NODE_ENV: "test" },
      () => {
        assert.equal(getDevBypassEmail(), "dev@example.com");
      },
    );
  });

  test("throws when NODE_ENV is production and env var is set", () => {
    withEnv(
      { DEV_AUTH_BYPASS_ALLOWLIST_EMAIL: "yoann@licorn.org", NODE_ENV: "production" },
      () => {
        assert.throws(
          () => getDevBypassEmail(),
          (err: Error) => {
            assert.match(err.message, /must not be set in production/);
            return true;
          },
        );
      },
    );
  });

  test("does not throw when NODE_ENV is production and env var is empty", () => {
    withEnv(
      { DEV_AUTH_BYPASS_ALLOWLIST_EMAIL: "", NODE_ENV: "production" },
      () => {
        assert.equal(getDevBypassEmail(), null);
      },
    );
  });
});
