import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { AssetLibraryEntry } from "@/modules/references/repositories/asset-library.repository";

import { regenerateAssetReferenceSkill } from "./regenerate-asset-reference-skill";

function entry(partial: Partial<AssetLibraryEntry>): AssetLibraryEntry {
  return {
    id: partial.id ?? "id",
    canonicalName: partial.canonicalName ?? "island_default",
    aliases: partial.aliases ?? ["KitchenIslandDefault"],
    category: partial.category ?? "kitchen",
    mediaAssetId: partial.mediaAssetId ?? null,
    description: partial.description ?? null,
    status: partial.status ?? "active",
    createdBy: partial.createdBy ?? null,
    createdAt: partial.createdAt ?? "2026-01-01T00:00:00Z",
    updatedAt: partial.updatedAt ?? "2026-01-01T00:00:00Z",
  };
}

/**
 * Fake `SupabaseDataClient` that only implements the surface used by
 * `regenerateAssetReferenceSkill` (one SELECT on asset_library). Everything
 * else throws so accidental new dependencies are caught loudly.
 */
function fakeSupabase(rows: AssetLibraryEntry[]): SupabaseDataClient {
  const data = rows.map((row) => ({
    id: row.id,
    canonical_name: row.canonicalName,
    aliases: row.aliases,
    category: row.category,
    media_asset_id: row.mediaAssetId,
    description: row.description,
    status: row.status,
    created_by: row.createdBy,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  }));

  const builder = {
    select: () => builder,
    order: () => builder,
    eq: () => builder,
    then: (resolve: (value: { data: unknown[]; error: null }) => void) =>
      resolve({ data, error: null }),
  };

  return {
    from: (table: string) => {
      if (table !== "asset_library") {
        throw new Error(`unexpected supabase.from("${table}")`);
      }
      return builder;
    },
  } as unknown as SupabaseDataClient;
}

test("regenerateAssetReferenceSkill dry-run renders markdown and skips push", async () => {
  const originalFetch = global.fetch;
  let fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await regenerateAssetReferenceSkill(
      fakeSupabase([
        entry({
          canonicalName: "island_default",
          category: "kitchen",
          aliases: ["KitchenIslandDefault"],
        }),
      ]),
      { dryRun: true, generatedAtUtc: "2026-05-11T07:00:00Z" },
    );

    assert.equal(result.pushStatus, "skipped");
    assert.equal(result.skippedReason, "dry_run");
    assert.match(result.content, /@KitchenIslandDefault/);
    assert.equal(
      fetchCalls,
      0,
      "dry-run must NEVER reach out to GitHub",
    );
  } finally {
    global.fetch = originalFetch;
  }
});

test("regenerateAssetReferenceSkill downgrades to skipped when repo env is missing", async () => {
  const originalFetch = global.fetch;
  const originalRepoUrl = process.env.CURSOR_AGENT_REPO_URL;
  const originalToken = process.env.RECIPE_AGENT_GITHUB_TOKEN;
  const originalGithubToken = process.env.GITHUB_TOKEN;

  delete process.env.CURSOR_AGENT_REPO_URL;
  delete process.env.RECIPE_AGENT_GITHUB_TOKEN;
  delete process.env.GITHUB_TOKEN;

  let fetchCalls = 0;
  global.fetch = (async () => {
    fetchCalls += 1;
    return new Response("{}", { status: 200 });
  }) as typeof fetch;

  try {
    const result = await regenerateAssetReferenceSkill(
      fakeSupabase([entry({})]),
      { generatedAtUtc: "2026-05-11T07:00:00Z" },
    );

    assert.equal(result.pushStatus, "skipped");
    // The skippedReason surfaces the config error so the UI can tell the user
    // exactly what env var is missing.
    assert.match(result.skippedReason ?? "", /CURSOR_AGENT_REPO_URL/);
    assert.equal(fetchCalls, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalRepoUrl !== undefined) {
      process.env.CURSOR_AGENT_REPO_URL = originalRepoUrl;
    }
    if (originalToken !== undefined) {
      process.env.RECIPE_AGENT_GITHUB_TOKEN = originalToken;
    }
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
  }
});

test("regenerateAssetReferenceSkill short-circuits when remote already matches", async () => {
  const originalFetch = global.fetch;
  const originalRepoUrl = process.env.CURSOR_AGENT_REPO_URL;
  const originalToken = process.env.RECIPE_AGENT_GITHUB_TOKEN;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalRef = process.env.CURSOR_AGENT_STARTING_REF;

  process.env.CURSOR_AGENT_REPO_URL = "https://github.com/owner/repo";
  process.env.RECIPE_AGENT_GITHUB_TOKEN = "ghp_fake";
  delete process.env.GITHUB_TOKEN;
  delete process.env.CURSOR_AGENT_STARTING_REF;

  // We need to know the expected content to make the GET mock return it.
  const supabase = fakeSupabase([
    entry({
      canonicalName: "island_default",
      category: "kitchen",
      aliases: ["KitchenIslandDefault"],
    }),
  ]);
  const preview = await regenerateAssetReferenceSkill(supabase, {
    dryRun: true,
    generatedAtUtc: "2026-05-11T07:00:00Z",
  });

  let putCalls = 0;
  global.fetch = (async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/contents/")) {
      // GET existing file: return the EXACT same content as what we just
      // generated so the regen sees "unchanged".
      const body = {
        type: "file",
        encoding: "base64",
        sha: "abc123",
        content: Buffer.from(preview.content, "utf8").toString("base64"),
      };
      // PUT requests would have different method, but our fake doesn't
      // currently distinguish — count any second call as a PUT for the test.
      putCalls += 1;
      return new Response(JSON.stringify(body), { status: 200 });
    }
    throw new Error(`unexpected fetch url: ${url}`);
  }) as typeof fetch;

  try {
    const result = await regenerateAssetReferenceSkill(supabase, {
      generatedAtUtc: "2026-05-11T07:00:00Z",
    });

    assert.equal(result.pushStatus, "unchanged");
    // Only the GET should have been made; no PUT.
    assert.equal(putCalls, 1);
  } finally {
    global.fetch = originalFetch;
    if (originalRepoUrl !== undefined) {
      process.env.CURSOR_AGENT_REPO_URL = originalRepoUrl;
    } else {
      delete process.env.CURSOR_AGENT_REPO_URL;
    }
    if (originalToken !== undefined) {
      process.env.RECIPE_AGENT_GITHUB_TOKEN = originalToken;
    } else {
      delete process.env.RECIPE_AGENT_GITHUB_TOKEN;
    }
    if (originalGithubToken !== undefined) {
      process.env.GITHUB_TOKEN = originalGithubToken;
    }
    if (originalRef !== undefined) {
      process.env.CURSOR_AGENT_STARTING_REF = originalRef;
    }
  }
});
