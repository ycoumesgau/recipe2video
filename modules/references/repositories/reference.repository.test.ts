import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import {
  upsertAgentReferenceAssetsForVideo,
  type CreateReferenceAssetInput,
} from "./reference.repository";

interface ReferenceRow {
  id: string;
  video_id: string;
  media_asset_id: string | null;
  type: string;
  category: string | null;
  canonical_name: string;
  source: string;
  runway_uri: string | null;
  prompt: string | null;
  status: string;
  conditioning_canonical_names: string[];
  runway_task_id: string | null;
  runway_task_status: string | null;
  runway_progress: number | null;
  created_at: string;
}

interface State {
  rows: ReferenceRow[];
  /** Operation log so tests can assert the exact statements issued. */
  operations: Array<
    | { kind: "delete"; rowId?: string; filters: Record<string, unknown> }
    | { kind: "update"; rowId: string; patch: Record<string, unknown> }
    | { kind: "insert"; values: Record<string, unknown> }
  >;
  /** Counter for new row UUIDs returned by INSERTs. */
  insertCounter: number;
}

function makeRow(overrides: Partial<ReferenceRow>): ReferenceRow {
  return {
    id: `row-${Math.random().toString(36).slice(2, 10)}`,
    video_id: "video-1",
    media_asset_id: null,
    type: "recipe_state",
    category: null,
    canonical_name: "Unnamed",
    source: "agent_reference_plan",
    runway_uri: null,
    prompt: null,
    status: "planned",
    conditioning_canonical_names: [],
    runway_task_id: null,
    runway_task_status: null,
    runway_progress: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function fakeSupabase(state: State): SupabaseDataClient {
  function selectBuilder(predicate: (row: ReferenceRow) => boolean) {
    const builder = {
      eq(column: string, value: unknown) {
        const inner = (row: ReferenceRow) =>
          predicate(row) && (row as unknown as Record<string, unknown>)[column] === value;
        return selectBuilder(inner);
      },
      order(_column: string, _options: { ascending: boolean }) {
        return selectBuilder(predicate);
      },
      single() {
        const rows = state.rows.filter(predicate);
        return Promise.resolve({ data: rows[0] ?? null, error: null });
      },
      then(
        resolve: (value: { data: ReferenceRow[]; error: null }) => void,
      ) {
        resolve({ data: state.rows.filter(predicate), error: null });
      },
    };
    return builder;
  }

  function tableBuilder() {
    return {
      select() {
        return selectBuilder(() => true);
      },
      update(patch: Record<string, unknown>) {
        let filter: ((row: ReferenceRow) => boolean) | null = null;
        const updateChain = {
          eq(column: string, value: unknown) {
            filter = (row) => (row as unknown as Record<string, unknown>)[column] === value;
            return updateChain;
          },
          select() {
            return {
              single() {
                const target = filter
                  ? state.rows.find((row) => filter!(row))
                  : null;
                if (!target) {
                  return Promise.resolve({
                    data: null,
                    error: { message: "row not found" },
                  });
                }
                Object.assign(target, patch);
                state.operations.push({
                  kind: "update",
                  rowId: target.id,
                  patch,
                });
                return Promise.resolve({ data: target, error: null });
              },
            };
          },
        };
        return updateChain;
      },
      insert(values: Record<string, unknown>) {
        return {
          select() {
            return {
              single() {
                state.insertCounter += 1;
                const newRow = makeRow({
                  ...values,
                  id:
                    (values.id as string | undefined) ??
                    `new-${state.insertCounter}`,
                  conditioning_canonical_names:
                    (values.conditioning_canonical_names as
                      | string[]
                      | undefined) ?? [],
                });
                state.rows.push(newRow);
                state.operations.push({ kind: "insert", values });
                return Promise.resolve({ data: newRow, error: null });
              },
            };
          },
        };
      },
      delete() {
        const filters: Record<string, unknown> = {};
        const deleteChain = {
          eq(column: string, value: unknown) {
            filters[column] = value;
            return deleteChain;
          },
          then(
            resolve: (value: { error: null }) => void,
          ) {
            const before = state.rows.length;
            state.rows = state.rows.filter(
              (row) =>
                !Object.entries(filters).every(
                  ([k, v]) =>
                    (row as unknown as Record<string, unknown>)[k] === v,
                ),
            );
            const removed = before - state.rows.length;
            state.operations.push({
              kind: "delete",
              rowId: removed > 0 ? `removed-${removed}` : undefined,
              filters,
            });
            resolve({ error: null });
          },
        };
        return deleteChain;
      },
    };
  }

  return {
    from(_name: string) {
      return tableBuilder();
    },
  } as unknown as SupabaseDataClient;
}

function asInput(
  overrides: Partial<CreateReferenceAssetInput> & { canonicalName: string },
): CreateReferenceAssetInput {
  return {
    type: "recipe_state",
    source: "agent_reference_plan",
    ...overrides,
  };
}

test("upsertAgentReferenceAssetsForVideo preserves media_asset_id, status, runway_uri, and runway_task fields when the canonical name already exists", async () => {
  const existing = makeRow({
    canonical_name: "FinalDishVisual",
    media_asset_id: "media-1",
    runway_uri: "runway://existing",
    status: "approved",
    runway_task_id: "task-1",
    runway_task_status: "SUCCEEDED",
    runway_progress: 100,
    prompt: "old prompt",
    conditioning_canonical_names: ["KitchenIslandDefault"],
  });
  const state: State = { rows: [existing], operations: [], insertCounter: 0 };
  const supabase = fakeSupabase(state);

  const result = await upsertAgentReferenceAssetsForVideo(supabase, "video-1", [
    asInput({
      canonicalName: "FinalDishVisual",
      prompt: "new prompt from the agent",
      conditioningCanonicalNames: ["KitchenIslandDefault", "CharacterSheet"],
    }),
  ]);

  // The function MUST update (not delete+insert) — that is the whole
  // point of the fix. No DELETE statement should be issued.
  assert.equal(
    state.operations.some((op) => op.kind === "delete"),
    false,
    "upsert must NOT delete rows when the canonical name already exists",
  );

  // Runtime / operator-touched fields must survive the update.
  assert.equal(result.length, 1);
  const [persisted] = result;
  assert.equal(persisted.id, existing.id, "the existing row id must be preserved");
  assert.equal(persisted.mediaAssetId, "media-1");
  assert.equal(persisted.runwayUri, "runway://existing");
  assert.equal(persisted.status, "approved");
  assert.equal(persisted.runwayTaskId, "task-1");
  assert.equal(persisted.runwayTaskStatus, "SUCCEEDED");
  assert.equal(persisted.runwayProgress, 100);

  // Agent-authored fields ARE overwritten.
  assert.equal(persisted.prompt, "new prompt from the agent");
  assert.deepEqual(persisted.conditioningCanonicalNames, [
    "KitchenIslandDefault",
    "CharacterSheet",
  ]);
});

test("upsertAgentReferenceAssetsForVideo inserts new canonical names not present in the DB", async () => {
  const state: State = { rows: [], operations: [], insertCounter: 0 };
  const supabase = fakeSupabase(state);

  const result = await upsertAgentReferenceAssetsForVideo(supabase, "video-1", [
    asInput({ canonicalName: "BrandNewState", prompt: "fresh" }),
  ]);

  assert.equal(state.operations.length, 1);
  assert.equal(state.operations[0].kind, "insert");
  assert.equal(result.length, 1);
  assert.equal(result[0].canonicalName, "BrandNewState");
  assert.equal(result[0].mediaAssetId, null);
});

test("upsertAgentReferenceAssetsForVideo preserves rows present in the DB but absent from the incoming batch", async () => {
  const survivor = makeRow({
    canonical_name: "OrphanReference",
    media_asset_id: "media-survivor",
    status: "approved",
  });
  const state: State = { rows: [survivor], operations: [], insertCounter: 0 };
  const supabase = fakeSupabase(state);

  const result = await upsertAgentReferenceAssetsForVideo(supabase, "video-1", [
    asInput({ canonicalName: "BrandNewState", prompt: "fresh" }),
  ]);

  assert.equal(
    state.operations.some((op) => op.kind === "delete"),
    false,
    "absent canonical names must be preserved, not deleted",
  );
  assert.equal(result.length, 2, "result includes both new and preserved rows");
  const canonicalNames = result.map((reference) => reference.canonicalName);
  assert.ok(canonicalNames.includes("BrandNewState"));
  assert.ok(canonicalNames.includes("OrphanReference"));

  const orphan = result.find((r) => r.canonicalName === "OrphanReference");
  assert.equal(orphan?.mediaAssetId, "media-survivor");
  assert.equal(orphan?.status, "approved");
});

test("upsertAgentReferenceAssetsForVideo returns existing-first ordering in the incoming batch", async () => {
  const existing = makeRow({ canonical_name: "A", media_asset_id: "a-media" });
  const state: State = { rows: [existing], operations: [], insertCounter: 0 };
  const supabase = fakeSupabase(state);

  const result = await upsertAgentReferenceAssetsForVideo(supabase, "video-1", [
    asInput({ canonicalName: "B", prompt: "new b" }),
    asInput({ canonicalName: "A", prompt: "updated a" }),
    asInput({ canonicalName: "C", prompt: "new c" }),
  ]);

  assert.deepEqual(
    result.map((reference) => reference.canonicalName),
    ["B", "A", "C"],
  );
});
