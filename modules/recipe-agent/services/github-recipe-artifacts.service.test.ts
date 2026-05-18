import assert from "node:assert/strict";
import test from "node:test";

import { fetchCheckpointManifestFromGithub } from "./github-recipe-artifacts.service";

test("fetchCheckpointManifestFromGithub parses latestPushedCommitSha manifests", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify({
            branch: "cursor/recipe-ingest-1234",
            latestPushedCommitSha: "9c088d11b4662c46df35694738e34c51a3dcbaa2",
            artifacts: [{ path: "recipe-analysis.json" }, { path: "changelog.md" }],
          }),
          "utf8",
        ).toString("base64"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const manifest = await fetchCheckpointManifestFromGithub({
      owner: "ycoumesgau",
      repo: "recipe2video-agent-workspace",
      workspacePath: "agent-recipes/video-1",
      ref: "main",
      token: "test-token",
    });

    assert.equal(
      manifest?.commitSha,
      "9c088d11b4662c46df35694738e34c51a3dcbaa2",
    );
    assert.deepEqual(manifest?.artifactPaths, [
      "recipe-analysis.json",
      "changelog.md",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchCheckpointManifestFromGithub keeps commitSha when already present", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify({
            branch: "cursor/recipe-ingest-1234",
            commitSha: "abc1234567",
            artifactPaths: ["recipe-analysis.json"],
          }),
          "utf8",
        ).toString("base64"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const manifest = await fetchCheckpointManifestFromGithub({
      owner: "ycoumesgau",
      repo: "recipe2video-agent-workspace",
      workspacePath: "agent-recipes/video-1",
      ref: "main",
      token: "test-token",
    });

    assert.equal(manifest?.commitSha, "abc1234567");
    assert.deepEqual(manifest?.artifactPaths, ["recipe-analysis.json"]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchCheckpointManifestFromGithub accepts artifacts as string[] (bare filenames)", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify({
            branch: "cursor/recipe-ingest-bibimbap",
            latestPushedCommitSha: "a2ec8d448d36ef917fc845eb6d4a1825c004aab5",
            artifacts: ["recipe-analysis.json", "changelog.md"],
          }),
          "utf8",
        ).toString("base64"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const manifest = await fetchCheckpointManifestFromGithub({
      owner: "ycoumesgau",
      repo: "recipe2video-agent-workspace",
      workspacePath: "agent-recipes/video-1",
      ref: "main",
      token: "test-token",
    });

    assert.equal(
      manifest?.commitSha,
      "a2ec8d448d36ef917fc845eb6d4a1825c004aab5",
    );
    assert.deepEqual(manifest?.artifactPaths, [
      "recipe-analysis.json",
      "changelog.md",
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test("fetchCheckpointManifestFromGithub accepts checkpointCommitSha alias", async () => {
  const originalFetch = global.fetch;
  global.fetch = (async () =>
    new Response(
      JSON.stringify({
        type: "file",
        encoding: "base64",
        content: Buffer.from(
          JSON.stringify({
            videoId: "video-1",
            branch: "cursor/recipe-branch",
            checkpointCommitSha: "645681eb711a57589673b0f78567c80a60bb2eac",
          }),
          "utf8",
        ).toString("base64"),
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    )) as typeof fetch;

  try {
    const manifest = await fetchCheckpointManifestFromGithub({
      owner: "ycoumesgau",
      repo: "recipe2video-agent-workspace",
      workspacePath: "agent-recipes/video-1",
      ref: "main",
      token: "test-token",
    });

    assert.equal(
      manifest?.commitSha,
      "645681eb711a57589673b0f78567c80a60bb2eac",
    );
  } finally {
    global.fetch = originalFetch;
  }
});
