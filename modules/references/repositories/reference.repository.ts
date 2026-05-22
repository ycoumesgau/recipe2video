import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import type { Database } from "@/shared/supabase/database.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import type { RunwayTaskStatusValue } from "@/modules/generation/runway.types";

import { normalizeReferenceName } from "../reference-matching";
import type {
  ReferenceAsset,
  ReferenceAssetKind,
} from "../reference.types";
import type { ReferenceStatus } from "../reference-status";

type ReferenceAssetRow =
  Database["public"]["Tables"]["reference_assets"]["Row"];

export interface CreateReferenceAssetInput {
  id?: string;
  videoId?: string | null;
  mediaAssetId?: string | null;
  type: string;
  canonicalName: string;
  source: string;
  runwayUri?: string | null;
  prompt?: string | null;
  status?: ReferenceStatus;
  conditioningCanonicalNames?: string[];
}

/**
 * Return the recipe-specific reference_assets for a video. Used to live with
 * `OR video_id IS NULL` so legacy globals stored in this table appeared too,
 * but globals now live in `asset_library`; callers compose the two sources
 * (library + recipe-specific) themselves via `getReferenceReviewData`.
 */
export async function listReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceAsset[]> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", videoId)
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listReferenceAssetsForVideo failed");
  return data.map(mapReferenceAsset);
}

export async function getReferenceAssetById(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<ReferenceAsset | null> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("id", referenceId)
    .maybeSingle();

  throwIfSupabaseError(error, "getReferenceAssetById failed");
  return data ? mapReferenceAsset(data) : null;
}

/**
 * Resolve a recipe-specific reference by its stable `(video_id,
 * canonical_name)` key. Returns null when the name is unused on this
 * video.
 */
export async function getReferenceAssetByCanonicalNameForVideo(
  supabase: SupabaseDataClient,
  input: { videoId: string; canonicalName: string },
): Promise<ReferenceAsset | null> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", input.videoId)
    .eq("canonical_name", input.canonicalName)
    .maybeSingle();

  throwIfSupabaseError(
    error,
    "getReferenceAssetByCanonicalNameForVideo failed",
  );
  return data ? mapReferenceAsset(data) : null;
}

/**
 * Index a recipe-specific reference under its canonical name and a
 * normalized form so conditioning resolution survives small casing drift.
 */
export function indexRecipeReferenceEntry(
  result: Map<string, ReferenceAsset>,
  entry: ReferenceAsset,
): void {
  const keys = new Set<string>([
    entry.canonicalName,
    normalizeReferenceName(entry.canonicalName),
  ]);

  for (const key of keys) {
    if (key.length > 0) {
      result.set(key, entry);
    }
  }
}

/**
 * Look up recipe-specific `reference_assets` for a video by canonical name.
 * Returns a Map keyed by every indexed name form (canonical + normalized).
 */
export async function findReferenceAssetsByCanonicalNamesForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  canonicalNames: string[],
): Promise<Map<string, ReferenceAsset>> {
  if (canonicalNames.length === 0) {
    return new Map();
  }

  const deduped = Array.from(new Set(canonicalNames));
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", videoId)
    .in("canonical_name", deduped);

  throwIfSupabaseError(
    error,
    "findReferenceAssetsByCanonicalNamesForVideo failed",
  );

  const byCanonical = new Map(
    (data ?? []).map((row) => [row.canonical_name, mapReferenceAsset(row)]),
  );

  const normalizedWanted = new Set(
    deduped.map((name) => normalizeReferenceName(name)),
  );

  const result = new Map<string, ReferenceAsset>();
  for (const row of data ?? []) {
    indexRecipeReferenceEntry(result, mapReferenceAsset(row));
  }

  const missingNormalized = deduped.filter(
    (name) =>
      !byCanonical.has(name) &&
      normalizedWanted.has(normalizeReferenceName(name)),
  );

  if (missingNormalized.length === 0) {
    return result;
  }

  const { data: allRows, error: allError } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", videoId);

  throwIfSupabaseError(
    allError,
    "findReferenceAssetsByCanonicalNamesForVideo fallback failed",
  );

  for (const row of allRows ?? []) {
    const entry = mapReferenceAsset(row);
    const normalized = normalizeReferenceName(entry.canonicalName);
    if (!normalizedWanted.has(normalized)) {
      continue;
    }
    indexRecipeReferenceEntry(result, entry);
  }

  return result;
}

export async function insertReferenceAsset(
  supabase: SupabaseDataClient,
  input: CreateReferenceAssetInput,
): Promise<ReferenceAsset> {
  const row = {
    ...(input.id ? { id: input.id } : {}),
    video_id: input.videoId ?? null,
    media_asset_id: input.mediaAssetId ?? null,
    type: input.type,
    canonical_name: input.canonicalName,
    source: input.source,
    runway_uri: input.runwayUri ?? null,
    prompt: input.prompt ?? null,
    status: input.status ?? "planned",
    conditioning_canonical_names: input.conditioningCanonicalNames ?? [],
  };

  const { data, error } = await supabase
    .from("reference_assets")
    .insert(row)
    .select("*")
    .single();

  throwIfSupabaseError(error, "insertReferenceAsset failed");
  return mapReferenceAsset(data);
}

/**
 * Non-destructive sync of agent-authored references for a video, keyed by
 * `(video_id, canonical_name)` across every `reference_assets` source
 * (including `extracted_frame` rows created during segment review).
 *
 * Why upsert (not replace): the previous `replace` implementation deleted
 * every existing `agent_reference_plan` row before inserting the new
 * batch. That destroyed `media_asset_id`, `runway_uri`, `status`, and
 * `runway_task_*` — every operator-touched runtime field — whenever the
 * agent re-pushed `reference-plan.json` for any reason (e.g. running the
 * new `publication_planning` stage which also re-syncs the recipe
 * artifacts). Generated images survived in `media_assets` but became
 * orphaned because their parent row was gone and re-created with a
 * fresh UUID. Same protection segments already enjoy via
 * `upsertSegmentsForVideoByPosition`.
 *
 * Semantics:
 *   - Existing canonical names are updated in place: agent-authored
 *     fields (`type`, `prompt`, `conditioning_canonical_names`) are
 *     overwritten; runtime / operator-touched fields (`media_asset_id`,
 *     `runway_uri`, `status`, `runway_task_id`, `runway_task_status`,
 *     `runway_progress`) are preserved.
 *   - New canonical names are inserted as `planned`.
 *   - Canonical names present in the DB but absent from the incoming
 *     batch are PRESERVED. Agents may temporarily drop a reference from
 *     their plan (e.g. while iterating on the storyboard) and we do not
 *     want to lose its generated image. The operator can manually clean
 *     up stale rows from the References page.
 *
 * Returns every active `agent_reference_plan` row (the upserted batch
 * plus any preserved row absent from the incoming batch) so downstream
 * `segment_references` wiring can resolve names against the full set.
 */
export async function upsertAgentReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  references: CreateReferenceAssetInput[],
): Promise<ReferenceAsset[]> {
  // Load every recipe-specific row for the video, not only
  // `agent_reference_plan`. Operator-generated images (e.g.
  // `extracted_frame`) already occupy `(video_id, canonical_name)` and
  // must be updated in place when the agent re-syncs reference-plan.json.
  const existingRows = await listReferenceAssetsForVideo(supabase, videoId);
  const existingByCanonicalName = new Map(
    existingRows.map((reference) => [reference.canonicalName, reference]),
  );

  const persistedByCanonicalName = new Map<string, ReferenceAsset>();

  for (const reference of references) {
    const current = existingByCanonicalName.get(reference.canonicalName);

    if (current) {
      const { data, error } = await supabase
        .from("reference_assets")
        .update({
          type: reference.type,
          prompt: reference.prompt ?? null,
          conditioning_canonical_names:
            reference.conditioningCanonicalNames ?? [],
        })
        .eq("id", current.id)
        .select("*")
        .single();

      throwIfSupabaseError(
        error,
        "upsertAgentReferenceAssetsForVideo update failed",
      );
      const persisted = mapReferenceAsset(data);
      persistedByCanonicalName.set(reference.canonicalName, persisted);
      existingByCanonicalName.set(reference.canonicalName, persisted);
      continue;
    }

    const { data, error } = await supabase
      .from("reference_assets")
      .insert({
        ...(reference.id ? { id: reference.id } : {}),
        video_id: videoId,
        media_asset_id: reference.mediaAssetId ?? null,
        type: reference.type,
        canonical_name: reference.canonicalName,
        source: "agent_reference_plan",
        runway_uri: reference.runwayUri ?? null,
        prompt: reference.prompt ?? null,
        status: reference.status ?? "planned",
        conditioning_canonical_names:
          reference.conditioningCanonicalNames ?? [],
      })
      .select("*")
      .single();

    throwIfSupabaseError(
      error,
      "upsertAgentReferenceAssetsForVideo insert failed",
    );
    const persisted = mapReferenceAsset(data);
    persistedByCanonicalName.set(reference.canonicalName, persisted);
    existingByCanonicalName.set(reference.canonicalName, persisted);
  }

  // Preserve existing rows absent from the incoming batch so their
  // images stay reachable. Order: persisted batch first (in incoming
  // order), then the preserved rows by their original creation date.
  const out: ReferenceAsset[] = references
    .map((reference) => persistedByCanonicalName.get(reference.canonicalName))
    .filter((value): value is ReferenceAsset => value !== undefined);

  for (const existing of existingRows) {
    if (!persistedByCanonicalName.has(existing.canonicalName)) {
      out.push(existing);
    }
  }

  return out;
}

/**
 * @deprecated Use `upsertAgentReferenceAssetsForVideo`. Kept as a thin
 * wrapper that forwards to the upsert so any caller still importing the
 * old name keeps working until the next cleanup.
 */
export async function replaceAgentReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
  references: CreateReferenceAssetInput[],
): Promise<ReferenceAsset[]> {
  return upsertAgentReferenceAssetsForVideo(supabase, videoId, references);
}

async function listAgentReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<ReferenceAsset[]> {
  const { data, error } = await supabase
    .from("reference_assets")
    .select("*")
    .eq("video_id", videoId)
    .eq("source", "agent_reference_plan")
    .order("created_at", { ascending: true });

  throwIfSupabaseError(error, "listAgentReferenceAssetsForVideo failed");
  return data.map(mapReferenceAsset);
}

export async function updateReferenceAssetStatus(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    status: ReferenceStatus;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      status: input.status,
      runway_task_id: null,
      runway_task_status: null,
      runway_progress: null,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetStatus failed");
  return mapReferenceAsset(data);
}

/**
 * Persists Runway task id + latest poll snapshot while a recipe-specific
 * reference image is generating.
 */
export async function updateReferenceAssetRunwayPollState(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    runwayTaskId: string;
    runwayTaskStatus: string;
    runwayProgress: number | null;
  },
): Promise<void> {
  const { error } = await supabase
    .from("reference_assets")
    .update({
      runway_task_id: input.runwayTaskId,
      runway_task_status: input.runwayTaskStatus,
      runway_progress: input.runwayProgress,
    })
    .eq("id", input.referenceId);

  throwIfSupabaseError(error, "updateReferenceAssetRunwayPollState failed");
}

export async function listGeneratingReferenceAssets(
  supabase: SupabaseDataClient,
  options: { limit?: number } = {},
): Promise<ReferenceAsset[]> {
  let query = supabase
    .from("reference_assets")
    .select("*")
    .eq("status", "generating")
    .order("created_at", { ascending: false });

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  throwIfSupabaseError(error, "listGeneratingReferenceAssets failed");
  return (data ?? []).map(mapReferenceAsset);
}

export async function countGeneratingReferenceAssetsForVideo(
  supabase: SupabaseDataClient,
  videoId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("reference_assets")
    .select("id", { count: "exact", head: true })
    .eq("video_id", videoId)
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingReferenceAssetsForVideo failed");
  return count ?? 0;
}

export async function countGeneratingReferenceAssets(
  supabase: SupabaseDataClient,
): Promise<number> {
  const { count, error } = await supabase
    .from("reference_assets")
    .select("id", { count: "exact", head: true })
    .eq("status", "generating");

  throwIfSupabaseError(error, "countGeneratingReferenceAssets failed");
  return count ?? 0;
}

export async function updateReferenceAssetMedia(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    mediaAssetId: string;
    status?: ReferenceStatus;
    /**
     * When true, clear `runway_uri` alongside the media update. Set on
     * regeneration so the old ephemeral Runway upload (now pointing at a
     * stale image) can never be reused for a Seedance call. The operator
     * must re-approve and re-upload the new image explicitly.
     */
    clearRunwayUri?: boolean;
  },
): Promise<ReferenceAsset> {
  const update: Database["public"]["Tables"]["reference_assets"]["Update"] = {
    media_asset_id: input.mediaAssetId,
    runway_task_id: null,
    runway_task_status: null,
    runway_progress: null,
  };
  if (input.status !== undefined) {
    update.status = input.status;
  }
  if (input.clearRunwayUri) {
    update.runway_uri = null;
  }

  const { data, error } = await supabase
    .from("reference_assets")
    .update(update)
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetMedia failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetPrompt(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    prompt: string | null;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({ prompt: input.prompt })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetPrompt failed");
  return mapReferenceAsset(data);
}

export async function updateReferenceAssetRunwayUri(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    runwayUri: string;
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      runway_uri: input.runwayUri,
      status: "uploaded_to_runway",
      runway_task_id: null,
      runway_task_status: null,
      runway_progress: null,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetRunwayUri failed");
  return mapReferenceAsset(data);
}

export function mapReferenceAsset(row: ReferenceAssetRow): ReferenceAsset {
  // The `kind`, `source_segment_id`, and `source_timestamp_seconds`
  // columns are added by migration 20260518200000. We cast through a
  // partial extension so this maps cleanly even before
  // `database.types.ts` has been regenerated; the runtime values are
  // still validated against `ReferenceAssetKind` to surface schema drift.
  const extendedRow = row as ReferenceAssetRow & {
    kind?: string | null;
    source_segment_id?: string | null;
    source_timestamp_seconds?: number | string | null;
  };

  const kindValue = extendedRow.kind;
  const allowedKinds: ReferenceAssetKind[] = [
    "generated_image",
    "extracted_frame",
    "external_image",
    "extracted_frame_pending",
  ];
  const kind: ReferenceAssetKind | undefined =
    typeof kindValue === "string" &&
    allowedKinds.includes(kindValue as ReferenceAssetKind)
      ? (kindValue as ReferenceAssetKind)
      : undefined;

  const timestampRaw = extendedRow.source_timestamp_seconds;
  const sourceTimestampSeconds: number | null =
    timestampRaw === null || timestampRaw === undefined
      ? null
      : Number(timestampRaw);

  return {
    id: row.id,
    videoId: row.video_id,
    mediaAssetId: row.media_asset_id,
    type: row.type,
    canonicalName: row.canonical_name,
    kind,
    sourceSegmentId: extendedRow.source_segment_id ?? null,
    sourceTimestampSeconds:
      sourceTimestampSeconds !== null && Number.isFinite(sourceTimestampSeconds)
        ? sourceTimestampSeconds
        : null,
    source: row.source,
    runwayUri: row.runway_uri,
    prompt: row.prompt,
    status: row.status as ReferenceStatus,
    conditioningCanonicalNames: row.conditioning_canonical_names ?? [],
    createdAt: row.created_at,
    runwayTaskId: row.runway_task_id ?? null,
    runwayTaskStatus: (row.runway_task_status as RunwayTaskStatusValue | null) ?? null,
    runwayProgress:
      row.runway_progress === null || row.runway_progress === undefined
        ? null
        : Number(row.runway_progress),
  };
}

export interface PendingExtractedFrameDescriptor {
  referenceAssetId: string;
  canonicalName: string;
  sourceSegmentId: string | null;
  sourceTimestampSeconds: number | null;
}

/**
 * Return every `reference_assets` row tied to a segment via
 * `segment_references` whose `kind` is `extracted_frame_pending`. Used
 * by the orchestrator to refuse generation when an upstream frame has
 * not been extracted yet, and by the segment-review UI to render the
 * "awaiting frame from segment-X" banner.
 */
export async function listPendingExtractedFramesForSegment(
  supabase: SupabaseDataClient,
  segmentId: string,
): Promise<PendingExtractedFrameDescriptor[]> {
  // Two-step query: first list every recipe_reference_id wired to the
  // segment, then re-fetch the matching reference_assets rows. We do
  // not embed the relation in a single Supabase select because the FK
  // type generator in CI does not always include
  // `segment_references_recipe_reference_id_fkey`, which surfaces as a
  // `SelectQueryError<"could not find the relation between
  // segment_references and reference_assets">` at type-check time.
  const { data: links, error: linksError } = await supabase
    .from("segment_references")
    .select("recipe_reference_id")
    .eq("segment_id", segmentId)
    .not("recipe_reference_id", "is", null);

  throwIfSupabaseError(linksError, "listPendingExtractedFramesForSegment failed");

  const referenceIds = (links ?? [])
    .map((row) => row.recipe_reference_id)
    .filter((id): id is string => Boolean(id));
  if (referenceIds.length === 0) {
    return [];
  }

  const { data: refs, error: refsError } = await supabase
    .from("reference_assets")
    .select("*")
    .in("id", referenceIds);

  throwIfSupabaseError(refsError, "listPendingExtractedFramesForSegment refs failed");

  return (refs ?? [])
    .map((row) => mapReferenceAsset(row as ReferenceAssetRow))
    .filter((reference) => reference.kind === "extracted_frame_pending")
    .map((reference) => ({
      referenceAssetId: reference.id,
      canonicalName: reference.canonicalName,
      sourceSegmentId: reference.sourceSegmentId ?? null,
      sourceTimestampSeconds: reference.sourceTimestampSeconds ?? null,
    }));
}

export interface InsertExtractedFrameReferenceAssetInput {
  videoId: string;
  mediaAssetId: string;
  canonicalName: string;
  sourceSegmentId: string;
  sourceTimestampSeconds: number;
  prompt?: string | null;
}

/**
 * Insert or replace a recipe-specific reference asset that points at a
 * frame extracted from another segment's render.
 *
 * When `canonical_name` already exists on the video (planner-declared
 * reference, prior GPT-Image 2 generation, or an earlier extraction),
 * the existing row is updated in place so `segment_references` and
 * downstream Seedance conditioning keep the same `reference_assets.id`.
 * A new `media_assets` row is linked as the active image; prior images
 * remain in Storage as historical variants (same semantics as
 * Regenerate on the references page).
 *
 * Fresh names insert a new row with `kind = 'extracted_frame'` and
 * `status = 'approved'` so the frame is immediately usable as a
 * Seedance reference once linked via `segment_references`.
 */
export async function upsertExtractedFrameReferenceAsset(
  supabase: SupabaseDataClient,
  input: InsertExtractedFrameReferenceAssetInput,
): Promise<ReferenceAsset> {
  const extractedFramePatch: Record<string, unknown> = {
    media_asset_id: input.mediaAssetId,
    type: "recipe_extracted_frame",
    source: "extracted_frame",
    prompt: input.prompt ?? null,
    status: "approved" as ReferenceStatus,
    kind: "extracted_frame" satisfies ReferenceAssetKind,
    source_segment_id: input.sourceSegmentId,
    source_timestamp_seconds: input.sourceTimestampSeconds,
    runway_uri: null,
    runway_task_id: null,
    runway_task_status: null,
    runway_progress: null,
  };

  const existing = await getReferenceAssetByCanonicalNameForVideo(supabase, {
    videoId: input.videoId,
    canonicalName: input.canonicalName,
  });

  if (existing) {
    const { data, error } = await supabase
      .from("reference_assets")
      .update(
        extractedFramePatch as unknown as Database["public"]["Tables"]["reference_assets"]["Update"],
      )
      .eq("id", existing.id)
      .select("*")
      .single();

    throwIfSupabaseError(error, "upsertExtractedFrameReferenceAsset update failed");
    return mapReferenceAsset(data);
  }

  const insertRow: Record<string, unknown> = {
    video_id: input.videoId,
    canonical_name: input.canonicalName,
    ...extractedFramePatch,
  };

  const { data, error } = await supabase
    .from("reference_assets")
    // Cast through unknown because the generated Database types do not
    // yet include the columns added by migration 20260518200000.
    .insert(insertRow as unknown as Database["public"]["Tables"]["reference_assets"]["Insert"])
    .select("*")
    .single();

  throwIfSupabaseError(error, "upsertExtractedFrameReferenceAsset insert failed");
  return mapReferenceAsset(data);
}

/**
 * @deprecated Use `upsertExtractedFrameReferenceAsset`.
 */
export async function insertExtractedFrameReferenceAsset(
  supabase: SupabaseDataClient,
  input: InsertExtractedFrameReferenceAssetInput,
): Promise<ReferenceAsset> {
  return upsertExtractedFrameReferenceAsset(supabase, input);
}

/**
 * Update the conditioning anchors for a recipe-specific reference asset.
 * Used by the references UI when the operator tweaks which library globals
 * should ground the next GPT-Image 2 regeneration. The list is stored as
 * given (no dedupe/casing) and resolved against `asset_library` at
 * generation time, so the operator can paste either canonical names or
 * aliases.
 */
/**
 * Remove a recipe-specific reference row. `segment_references` rows that
 * pointed at it are deleted via ON DELETE CASCADE — callers must rewire
 * links before invoking this.
 */
export async function deleteReferenceAsset(
  supabase: SupabaseDataClient,
  referenceId: string,
): Promise<void> {
  const { error } = await supabase
    .from("reference_assets")
    .delete()
    .eq("id", referenceId);

  throwIfSupabaseError(error, "deleteReferenceAsset failed");
}

export async function updateReferenceAssetConditioning(
  supabase: SupabaseDataClient,
  input: {
    referenceId: string;
    conditioningCanonicalNames: string[];
  },
): Promise<ReferenceAsset> {
  const { data, error } = await supabase
    .from("reference_assets")
    .update({
      conditioning_canonical_names: input.conditioningCanonicalNames,
    })
    .eq("id", input.referenceId)
    .select("*")
    .single();

  throwIfSupabaseError(error, "updateReferenceAssetConditioning failed");
  return mapReferenceAsset(data);
}
