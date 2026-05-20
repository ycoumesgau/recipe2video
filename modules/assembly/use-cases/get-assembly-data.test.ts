import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { AssemblyPreset } from "../assembly.types";
import { resolveActivePreset } from "../resolve-active-preset";

function makePreset(id: string, name: string): AssemblyPreset {
  return {
    id,
    videoId: "video-1",
    name,
    segmentOrder: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("resolveActivePreset", () => {
  const presets = [
    makePreset("preset-a", "Vidéo"),
    makePreset("preset-b", "Canvas"),
  ];

  it("returns null when there are no presets", () => {
    assert.equal(resolveActivePreset([]), null);
  });

  it("returns the requested preset when it exists", () => {
    assert.equal(resolveActivePreset(presets, "preset-b")?.name, "Canvas");
  });

  it("falls back to the first preset when the requested id is invalid", () => {
    assert.equal(resolveActivePreset(presets, "missing")?.id, "preset-a");
  });

  it("falls back to the first preset when no id is provided", () => {
    assert.equal(resolveActivePreset(presets)?.id, "preset-a");
  });
});
