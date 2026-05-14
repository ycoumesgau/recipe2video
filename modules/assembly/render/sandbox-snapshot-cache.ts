import "server-only";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

export { computeSandboxRenderCacheKey } from "./sandbox-snapshot-cache-key";

const SCOPE = "composition_render" as const;

/**
 * Default snapshot TTL — 14 days is well under Vercel's 30-day cap and gives
 * us a comfortable cushion before snapshots auto-expire. We re-create on the
 * next cold render after expiration.
 */
const DEFAULT_EXPIRATION_MS = 14 * 24 * 60 * 60 * 1000;

export interface SandboxSnapshotCacheEntry {
  snapshotId: string;
  cacheKey: string;
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
}

/**
 * Find a non-expired cached snapshot id for the given cache key. Returns
 * `null` when no row matches or the matching row has expired.
 */
export async function findSandboxSnapshot(
  supabase: SupabaseDataClient,
  cacheKey: string,
): Promise<SandboxSnapshotCacheEntry | null> {
  const { data, error } = await supabase
    .from("sandbox_snapshots")
    .select("snapshot_id, cache_key, created_at, expires_at, last_used_at")
    .eq("scope", SCOPE)
    .eq("cache_key", cacheKey)
    .maybeSingle();

  throwIfSupabaseError(error, "findSandboxSnapshot failed");

  if (!data) return null;

  if (data.expires_at && Date.parse(data.expires_at) < Date.now()) {
    return null;
  }

  return {
    snapshotId: data.snapshot_id,
    cacheKey: data.cache_key,
    createdAt: data.created_at,
    expiresAt: data.expires_at,
    lastUsedAt: data.last_used_at,
  };
}

/**
 * Upsert a snapshot for `cacheKey`. Concurrent cold renders that race here
 * both succeed — the second write replaces the first, keeping the freshest
 * `created_at` and the longer remaining TTL.
 */
export async function persistSandboxSnapshot(
  supabase: SupabaseDataClient,
  input: {
    cacheKey: string;
    snapshotId: string;
    expiresAt?: Date;
  },
): Promise<void> {
  const expiresAt = (input.expiresAt ?? defaultExpirationDate()).toISOString();
  const { error } = await supabase.from("sandbox_snapshots").upsert(
    {
      scope: SCOPE,
      cache_key: input.cacheKey,
      snapshot_id: input.snapshotId,
      expires_at: expiresAt,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "scope,cache_key" },
  );

  throwIfSupabaseError(error, "persistSandboxSnapshot failed");
}

/**
 * Mark a snapshot as no longer usable — typically called when
 * `Sandbox.create({ source: { type: "snapshot", ... } })` fails because the
 * snapshot was deleted upstream or has corrupted state. We delete the row
 * outright so the next render falls back to cold and re-creates a fresh
 * snapshot.
 */
export async function invalidateSandboxSnapshot(
  supabase: SupabaseDataClient,
  cacheKey: string,
): Promise<void> {
  const { error } = await supabase
    .from("sandbox_snapshots")
    .delete()
    .eq("scope", SCOPE)
    .eq("cache_key", cacheKey);

  throwIfSupabaseError(error, "invalidateSandboxSnapshot failed");
}

/**
 * Bump `last_used_at` on a cache hit. Best-effort: failure here never blocks
 * a render. Used by `/active-generations` follow-up cards to surface "cold
 * for X days" snapshots.
 */
export async function touchSandboxSnapshot(
  supabase: SupabaseDataClient,
  cacheKey: string,
): Promise<void> {
  const { error } = await supabase
    .from("sandbox_snapshots")
    .update({ last_used_at: new Date().toISOString() })
    .eq("scope", SCOPE)
    .eq("cache_key", cacheKey);

  if (error) {
    console.warn(
      "[sandbox-snapshot-cache] touchSandboxSnapshot failed (ignored):",
      error.message,
    );
  }
}

export function defaultSnapshotExpirationMs(): number {
  return DEFAULT_EXPIRATION_MS;
}

function defaultExpirationDate(): Date {
  return new Date(Date.now() + DEFAULT_EXPIRATION_MS);
}
