# Plan — Assembly segment placements (split + middle-cut)

> Status: proposed — implementation lives in a follow-up PR.
> Owner: assembly module.
> Tracks the third improvement raised after merging the timeline editor (PR #77, then PR #79 for the trim-ghost / layout pass).

## Why this needs its own PR

The first two timeline editor improvements (per-clip trims, multi-audio clips) only changed the JSON shape stored in `compositions.audio_sync` and did so with zero schema migration: the reader auto-detects the legacy shape and projects it forward.

Splitting a video clip in the middle does **not** fit in that envelope. The current contract treats every accepted Seedance segment as appearing **at most once** on the timeline:

```ts
// modules/assembly/repositories/assembly.repository.ts (today)
compositions.segment_order: string[]   // array of segmentIds, in order
```

If the user splits one clip into two pieces, both pieces share the same `segmentId` (and the same `media_asset_id`) but cover different `[in, out]` windows. A `string[]` cannot represent that without ambiguity, and the per-segment trims map (`segmentTrims`) we ship today is keyed by `segmentId`, so it cannot store distinct trims for two pieces of the same source either.

This is also why the user-visible workflow "remove a chunk in the middle" is impossible today — there's nowhere to express "I want this segment to play from `[2s, 4s]` then skip to `[6s, 8s]`".

The fix is structural: introduce **placements** as a first-class concept on the timeline, separate from **segments** (the generation units). One Seedance segment can appear in zero, one, or many placements, each with its own `[in, out]`.

## Mental model

```
seedance_segments (DB)            timeline placements (composition state)

Hook       ◀──────── 1:N ────▶    placement_a ([0, 4])    @ position 0
                                   placement_b ([6, 8])    @ position 1
Beat       ◀──────── 1:1 ────▶    placement_c ([0, 8])    @ position 2
Payoff     ◀──────── 1:0 ────▶    (not on timeline yet — still in the "bin")
```

The sidebar becomes a media bin of "available segments to drop on the timeline", which is exactly the convention every NLE follows.

## Proposed data model

### TypeScript

```ts
// modules/assembly/assembly.types.ts

export interface SegmentPlacement {
  /** Stable id for this placement on the timeline. UUID generated client-side. */
  placementId: string;
  /** Foreign key to seedance_segments. May appear in several placements. */
  segmentId: string;
  /** Trim window inside the source media, in seconds. */
  inSeconds: number;
  outSeconds: number;
}

// AssemblySegmentClip becomes the *runtime* shape the editor reads:
// it joins the placement with the metadata from the segment + media_asset.
export interface AssemblySegmentClip {
  placementId: string;
  segmentId: string;
  mediaAssetId: string;
  generationId?: string | null;
  title: string;
  position: number;          // index in the placement array
  durationSeconds: number;   // source duration (drives trim bounds)
  inSeconds: number;
  outSeconds: number;
  sourceUrl: string;
  storageBucket: string;
  storagePath: string;
}
```

### Persistence

Store the placements inside the existing `compositions.segment_order` JSON column. The column was always typed `Json` so no SQL migration is required:

```jsonc
// new shape
{
  "schema": "placements_v1",
  "placements": [
    { "placementId": "p_AAAA", "segmentId": "seg_hook", "inSeconds": 0,    "outSeconds": 4 },
    { "placementId": "p_BBBB", "segmentId": "seg_hook", "inSeconds": 6,    "outSeconds": 8 },
    { "placementId": "p_CCCC", "segmentId": "seg_beat", "inSeconds": 0,    "outSeconds": 8 }
  ]
}
```

`compositions.audio_sync` (which already holds `AssemblyTimelineState` since #77) loses the `segmentTrims` map — trims are now inline in the placement. We keep the `audioClips` array unchanged in there. The `audio_sync` JSON shape becomes:

```jsonc
{ "schema": "timeline_v2", "audioClips": [...] }
```

Older rows that still write `{ schema: "timeline_v2", segmentTrims: {...}, audioClips: [...] }` will continue to be readable; `segmentTrims` is just ignored once placements have been built.

## Backward compatibility & migration

### Read path (always tolerant)

`modules/assembly/timeline-state.ts` already hosts the legacy reader for `audio_sync`. Add a sibling reader `readPlacementsState(segmentOrderJson, segmentTrimsJson, availableSegments)` that handles three cases on the way in:

| Stored shape                                                | Action on read |
|-------------------------------------------------------------|----------------|
| `{ schema: "placements_v1", placements: [...] }`            | Use as-is. |
| `string[]` + `audio_sync.segmentTrims` (current `timeline_v2`) | Project to one placement per segmentId, with `[in, out]` from `segmentTrims` (or `[0, durationSeconds]` if missing). |
| `string[]` only (legacy from before #77)                    | Project to one placement per segmentId at `[0, durationSeconds]`. |

If a placement references a `segmentId` that no longer exists in `seedance_segments` (or whose media_asset is missing/unavailable), drop it on read and surface it via `missingAcceptedSegments` in the page data — same defensive behaviour as today.

### Write path (always emits the new shape)

`upsertDraftComposition` and `createComposition` write `segment_order` as the new placements object and `audio_sync` as `{ schema: "timeline_v2", audioClips }` (no `segmentTrims`). No data is destroyed: legacy fields just stop being written. Re-reads of older rows still work because the reader covers all three cases above.

### One-shot data sweep (optional, can be skipped)

A SQL or `tsx` script can read every composition row, project to the new shape via the same reader, and rewrite `segment_order`. This is **not** required for correctness but is recommended once for two reasons:

1. It makes follow-up code paths simpler if we ever want to drop the legacy reader.
2. It makes the JSON in the DB easier to inspect during support.

The script is idempotent (writing the same shape twice is a no-op), can run live (no exclusive lock — Postgres `UPDATE` on a JSON column), and rolls back trivially because we keep the legacy reader in place.

```ts
// scripts/migrate-compositions-to-placements.ts (sketch)
for await (const row of forEachComposition(supabase)) {
  const placements = readPlacementsState(
    row.segment_order,
    row.audio_sync,
    await loadAvailableSegments(row.video_id),
  );
  await supabase
    .from("compositions")
    .update({
      segment_order: { schema: "placements_v1", placements },
      audio_sync: stripSegmentTrims(row.audio_sync),
    })
    .eq("id", row.id);
}
```

We will only ship the script once the read path has been live for one deploy (so the new shape can be both written and read), to avoid the chicken-and-egg between deploy order and DB content.

## Code-level cascade

| File | Change |
|------|--------|
| `modules/assembly/assembly.types.ts` | Add `SegmentPlacement` + `placementId` on `AssemblySegmentClip`. Drop `segmentTrims` from `AssemblyTimelineState`. |
| `modules/assembly/timeline-state.ts` | New `readPlacementsState`, drop `applySegmentTrims` (no longer needed), keep `readTimelineState` but remove `segmentTrims` from its return. Backward-compat reader handles all three legacy shapes. |
| `modules/assembly/timeline-state.test.ts` | Add coverage for the three legacy shapes + clamping when stored `[in, out]` exceeds source duration + dropping placements that point to missing segments. |
| `modules/assembly/repositories/assembly.repository.ts` | `serializeSegmentOrderColumn` helper that always writes the new shape. |
| `modules/assembly/use-cases/get-assembly-data.ts` | Build `AssemblySegmentClip[]` from placements (not segments). Sidebar gets a separate `availableSegments` list (dedup of segments not yet placed, plus segments already placed for re-drop). |
| `modules/assembly/actions.ts` | Form payload renamed from `segmentOrder` to `placements` (JSON-encoded). Same read tolerance applies on parse. |
| `modules/assembly/ui/timeline-editor.tsx` | React keys, drag selection and drag mode discriminators switch from `segmentId` to `placementId`. The split shortcut (`S`) extends to video clips: split at playhead = replace 1 placement with 2 adjacent placements that share the `segmentId`. The Delete shortcut becomes generic (already wired for audio). |
| `modules/assembly/ui/assembly-workspace.tsx` | Sidebar shows the segment **bin**: drag from sidebar → drop on the video track creates a new placement at the cursor's seconds position. Used segments stay in the bin (re-droppable). |
| `remotion/compositions/recipe-assembly.tsx` | Iterate placements instead of segments. The `<Video startFrom endAt>` primitive is unchanged. Use `placementId` as React key. |

## UX of "remove a chunk in the middle"

With placements in place, the workflow is the same five clicks every NLE has:

1. Move the playhead to the start of the chunk to remove.
2. Press `S` (split). The placement becomes two adjacent placements.
3. Move the playhead to the end of the chunk.
4. Press `S`. Three placements now.
5. Click the middle placement, press `Del`. The two remaining placements automatically butt up against each other because layout is sequential.

No new UI primitives needed beyond what already exists in `TimelineEditor` — the keyboard shortcuts for `S` and `Del` already exist for audio; the implementation extends them to the video track.

## Side-effects & risks

- **Costs / Runway quotas**: zero. Splitting only duplicates a metadata pointer; no new generation is triggered.
- **Storage**: zero. `media_assets` is unchanged; one accepted clip can be referenced from N placements.
- **Mux / final export**: zero. Remotion encodes whatever the composition renders. Two `<Video>` elements with the same `src` is supported (browser cache reuses the byte range).
- **Available segments sidebar**: needs to evolve from "1:1 list of timeline cards" to "bin of droppable assets". This is a UI change but does not affect the data model further.
- **Race condition on `placementId` collisions**: the IDs are generated client-side with `crypto.randomUUID()` so a collision across users is negligible. The server validates that all placements reference an existing `segmentId` for the current video before persisting.
- **Cascading delete of a `seedance_segment`**: today the `segmentOrder` legacy reader drops missing IDs on read. The new reader does the same — safe.
- **Deep-link to a specific clip**: not affected; we don't expose placementIds in URLs.
- **Existing PRs in flight (#79)**: only touches UI; will rebase cleanly on top of placements.

## Test plan

### Unit (Node test runner via `tsx --test`)

Add to `modules/assembly/timeline-state.test.ts`:

- Reads new `placements_v1` shape unchanged.
- Reads `string[] + segmentTrims` legacy shape and projects 1:1 to placements.
- Reads bare `string[]` legacy shape and projects to placements with `[0, durationSeconds]`.
- Drops placements that reference unknown segmentIds.
- Clamps `outSeconds > durationSeconds` and `inSeconds < 0`.
- Splitting a placement: `[in, out]` with split point `p` → `[in, p]` + `[p, out]`, both share `segmentId`.

### Integration (Server Actions, no Supabase mocks)

Reuse the pattern from `modules/storyboard/services/openai-planning-client.test.ts` to call the action with a fake `FormData`:

- `saveAssemblySettingsAction` round-trips a placements payload (write new, read new).
- `saveAssemblySettingsAction` upgrades a row written in the legacy shape (write new, read on next call).

### Manual e2e

On `/timeline-editor-demo` (already auth-free):

- Split a video clip at the playhead. Two placements with the same colour appear; the title carries through; the Live state JSON shows two placements with the same `segmentId`.
- Repeat split, then delete the middle piece. The neighbours reflow.
- Reorder a split half independently (drag one of the two pieces past the next clip).
- Drag a segment from the sidebar bin onto the timeline at an explicit position.

Capture a `RecordScreen` walkthrough and verify with `videoReview` (same pattern as #77 and #79).

## Rollout sequence

This is the order we'll deploy to keep production safe:

1. **Deploy #1 — readers tolerant.** Ship the read-side changes only: `readPlacementsState`, the new `AssemblySegmentClip.placementId`, and the Remotion composition + UI iterating on placements. Writes still emit the legacy shape. After this deploy, every existing row and every new row both render correctly and ghosts/trims keep working.

2. **Deploy #2 — writers emit the new shape.** Switch `actions.ts` and the repository to write `{ schema: "placements_v1", ... }` and stop writing `segmentTrims`. Old rows continue to be read by the tolerant reader.

3. **Deploy #3 — split / middle-cut UI lit up.** Bind `S` and `Del` shortcuts on selected video placements. The `S` shortcut for audio is unchanged. This is purely UI.

4. **(Optional) one-shot DB sweep.** Run `scripts/migrate-compositions-to-placements.ts` once production has been on Deploy #2 for a deploy or two. Verify no row still has `segmentTrims` afterwards.

Each deploy is independently revertable because the reader stays tolerant of all three shapes throughout.

## Resolutions on the open questions

### 1. JSON vs normalised `composition_placements` table — **JSON, with a deferred upgrade path**

We map every realistic query against placements to whether it needs a normalised row layout to perform well, then weigh the cost.

| Use case | Frequency in Recipe2Video today | JSON enough? | Notes |
|---|---|---|---|
| Load the editor for a composition (read by `composition_id`) | very hot | ✅ JSON | Single row, single parse. A normalised table would force a JOIN for the same data. |
| Save a composition (user clicks "Save") | hot | ✅ JSON | One atomic `UPDATE` on the JSON column. Normalised table = `DELETE` + N `INSERT`s in a transaction; same end-state, more plumbing and more contention. |
| "Which Seedance segments are never used by any composition?" (find paid-but-orphaned generations) | rare, batch admin | ⚠️ JSON works but is heavy (full-scan + parse) | Same answer is already reachable today via `media_assets` orphan detection. Not a sufficient motivator on its own. |
| "For this `media_asset`, where is it used?" (safe storage GC before soft-delete) | rare, but matters | ⚠️ JSON with a GIN index | `WHERE segment_order @> '[{"segmentId": "..."}]'` is fine with `CREATE INDEX ... USING GIN (segment_order jsonb_path_ops)`. Normalised table is faster but the gap is a non-issue at our row count. |
| "Aggregate Runway cost of a final export" | medium, dashboard "Costs" | ✅ JSON | Already served by `cost_logs.generation_id → generations.segment_id`. A given `media_asset` was generated **once** even if it appears in N placements, so the placements layer adds nothing here. |
| "Average number of cuts per project" (product analytics) | nice-to-have, never asked | ⚠️ Heavy in JSON | `SELECT AVG(jsonb_array_length(segment_order->'placements'))` — slow but acceptable for a weekly cron. |
| "Find compositions where segment X is trimmed to <50% of its source" (debug "is this segment always cut short? prompt too long?") | rare, product debug | ⚠️ Heavy in JSON | The textbook case where a normalised table shines. But the data isn't exploited by the product today. |
| Concurrent multi-user editing on the same timeline | not on the roadmap | ✅ JSON | Multi-user editing needs more than a table anyway (CRDT, op log). Not a justification for normalising now. |

The classical NLE-style features that *would* benefit from a normalised table — cross-project clip library, per-clip parallel rendering, version diffing — are not on the Recipe2Video backlog today.

**Trigger conditions for revisiting this decision** (commit to migrate the day any of these happens):

1. A "library of reusable clips across projects" feature lands.
2. We need product analytics like "average cut rate per generation across all users".
3. Concurrent editing on the same timeline appears at the backlog.

Until then, **stay on JSON**. If/when the storage GC reverse-lookup or any other admin query gets hot, add a `GIN` index on `compositions.segment_order` (~10 lines of migration) before going as far as a normalised table. The migration from JSON to a table is mechanical when needed: a single `tsx` script iterates compositions, parses the JSON and `INSERT`s rows. The `SegmentPlacement` TypeScript contract does not change — only an extra repository layer is added.

### 2. Ripple delete on video, free position on audio — **keep**

When the user removes a video placement, the right-side placements shift left to close the gap. Matches the "stitched short-form clip" mental model that the rest of the editor already follows (sequential video track, no holes). Audio stays free-positioned, as it already is in `timeline_v2`.

### 3. A segment in the bin is always re-droppable — **yes**

A `seedance_segment` in the sidebar bin can be dragged onto the timeline regardless of how many placements already reference it. Matches every NLE convention and is precisely the value the placements model unlocks.

### 4. Naming — **`placementId`**

`AssemblyAudioClip.id` already exists in the codebase, so `clipId` would collide visually. `placementId` is unambiguous and signals the new concept introduced by this PR.

## Implementation packaging — **single PR, no need for the 3-deploy rollout**

The earlier "Rollout sequence" section above is conservative: 3 independently revertable deploys, useful when readers/writers can be deployed asynchronously and external consumers exist. For Recipe2Video that's overkill:

- The reader is tolerant of all three legacy shapes throughout the change, so flipping reads and writes in the same deploy is safe.
- There's a single environment and a single consumer of `compositions.audio_sync` / `compositions.segment_order`: the assembly module itself.
- A single deploy means the reviewer sees the full contract change in one place, which is clearer than three sequential PRs that each leave the codebase in a transitional state.

The implementation will land as a small PR sequence:

- **PR A — placements contract**: types (`SegmentPlacement` + `placementId`), tolerant `readPlacementsState`, repository, server actions, `get-assembly-data`, Remotion composition iterating placements. UI behaviour unchanged. Tests cover read tolerance for the three legacy shapes. *No visible product change.*
- **PR B — split / middle-cut UX**: extend the `S` / `Del` keyboard shortcuts to the video track in `TimelineEditor`. Walkthrough video covers the five-click middle-cut workflow. *Pure UI change; depends on PR A.*

The optional one-shot DB sweep script is unchanged from above and remains a "ship if/when we want clean JSON in the DB", not a prerequisite.

## Definition of done

- All three legacy data shapes still load correctly on `/videos/<id>/assembly` after the new code is deployed.
- Splitting + deleting a middle chunk on the timeline editor produces the expected geometry in the Remotion preview.
- `npm test`, `npm run lint`, `npm run build` all pass.
- A walkthrough video on `/timeline-editor-demo` shows split + middle-cut + reorder of split halves, verified frame-by-frame by `videoReview`.
- No regression on the auth-protected `/videos/<id>/assembly` path: it still redirects unauthenticated requests to `/login` and serves authenticated ones with the new editor.
