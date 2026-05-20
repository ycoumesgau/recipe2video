-- Extend the `agent_runs.stage` CHECK constraint with `publication_planning`
-- so the new Spotify publication assets workflow (album cover + Canvas)
-- can dispatch `recipe.agent.message.requested` events to the cloud
-- agent. Without this update, the `Ask the agent to plan Spotify assets`
-- CTA on the Cover & Canvas tab fails at INSERT time with:
--
--   new row for relation "agent_runs" violates check constraint
--   "agent_runs_stage_check"
--
-- The matching app-side enum in
-- `modules/recipe-agent/recipe-agent.types.ts` (RecipeAgentStage) already
-- ships the new value; this migration brings the DB schema in line.

alter table public.agent_runs
  drop constraint if exists agent_runs_stage_check;

alter table public.agent_runs
  add constraint agent_runs_stage_check check (
    stage in (
      'recipe_ingest',
      'storyboard_revision',
      'seedance_segmentation',
      'reference_planning',
      'segment_prompt_revision',
      'suno_prompt_revision',
      'publication_planning',
      'general'
    )
  );
