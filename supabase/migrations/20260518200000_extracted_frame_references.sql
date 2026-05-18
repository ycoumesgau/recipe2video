-- Frame extraction tool: track recipe-specific reference assets that are
-- extracted as a single frame from a previously-generated Seedance segment.
--
-- Use case:
--   Segments often need to enforce visual continuity on objects whose state
--   changes mid-arc (a sliced lasagna, a spoon-dived dish, a partially
--   garnished plate). Without the ability to use the closing frame of
--   segment N as a reference for segment N+1, the agent can only ever
--   describe the state in text — Seedance routinely re-renders the object
--   in its "canonical" intact state.
--
-- New shape:
--   * `reference_assets.kind` distinguishes generated images, externally
--     uploaded images, and frames extracted from another segment's output.
--   * `source_segment_id` + `source_timestamp_seconds` fully describe the
--     extracted-frame provenance and are used by the segment-review UI to
--     render a deep link back to the source segment + timestamp.
--   * The new `awaiting_upstream_frame` status on `segments` is set by the
--     orchestrator when a required reference is `extracted_frame_pending`
--     and the upstream segment has not been rendered yet; the segment
--     leaves that status as soon as the operator extracts the frame.

alter table public.reference_assets
  add column if not exists kind text not null default 'generated_image'
    check (kind in (
      'generated_image',
      'extracted_frame',
      'external_image',
      'extracted_frame_pending'
    ));

alter table public.reference_assets
  add column if not exists source_segment_id uuid
    references public.segments(id) on delete set null;

alter table public.reference_assets
  add column if not exists source_timestamp_seconds numeric;

create index if not exists idx_reference_assets_source_segment
  on public.reference_assets(source_segment_id)
  where source_segment_id is not null;

-- Extend the segments status enum with a dedicated waiting state so the
-- UI can surface "blocked: awaiting frame from segment-X" without
-- collapsing into the generic `blocked` bucket. Postgres requires us to
-- drop and re-create the check constraint to extend it.
alter table public.segments
  drop constraint if exists segments_status_check;

alter table public.segments
  add constraint segments_status_check
  check (
    status in (
      'pending',
      'ready',
      'queued',
      'generating',
      'review',
      'accepted',
      'rejected',
      'failed',
      'blocked',
      'awaiting_upstream_frame'
    )
  );
