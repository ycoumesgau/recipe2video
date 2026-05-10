import assert from "node:assert/strict";
import test from "node:test";

import type { SupabaseDataClient } from "@/shared/supabase/client.types";

import {
  createAgentRun,
  listAgentArtifactsByVideoId,
  listAgentRunsByVideoId,
  mapAgentArtifact,
  mapAgentRun,
  updateAgentRun,
  updateVideoAgentSession,
  upsertAgentArtifact,
} from "./recipe-agent.repository";

test("mapAgentRun maps database rows to domain shape", () => {
  assert.deepEqual(
    mapAgentRun({
      id: "run-row-1",
      video_id: "video-1",
      cursor_agent_id: "bc-agent",
      cursor_run_id: "run-1",
      stage: "recipe_ingest",
      user_message: "Analyze recipe",
      status: "finished",
      result_summary: "Done",
      error: null,
      created_by: "user-1",
      started_at: "2026-05-10T00:00:00.000Z",
      completed_at: "2026-05-10T00:01:00.000Z",
      created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-05-10T00:01:00.000Z",
      agent_git_branch: null,
      agent_git_commit_sha: null,
      needs_user_input: false,
      user_chat_message_id: null,
      assistant_chat_message_id: null,
    }),
    {
      id: "run-row-1",
      videoId: "video-1",
      cursorAgentId: "bc-agent",
      cursorRunId: "run-1",
      stage: "recipe_ingest",
      userMessage: "Analyze recipe",
      status: "finished",
      resultSummary: "Done",
      error: null,
      createdBy: "user-1",
      startedAt: "2026-05-10T00:00:00.000Z",
      completedAt: "2026-05-10T00:01:00.000Z",
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:01:00.000Z",
      agentGitBranch: null,
      agentGitCommitSha: null,
      needsUserInput: false,
      userChatMessageId: null,
      assistantChatMessageId: null,
    },
  );
});

test("mapAgentArtifact maps validation errors JSON", () => {
  assert.deepEqual(
    mapAgentArtifact({
      id: "artifact-1",
      video_id: "video-1",
      artifact_name: "recipe-analysis.json",
      artifact_path: "agent-recipes/video-1/recipe-analysis.json",
      content: "{\"ok\":true}",
      content_hash: "hash-1",
      validation_status: "invalid",
      validation_errors: ["Missing title"],
      created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-05-10T00:00:00.000Z",
    }),
    {
      id: "artifact-1",
      videoId: "video-1",
      artifactName: "recipe-analysis.json",
      artifactPath: "agent-recipes/video-1/recipe-analysis.json",
      content: "{\"ok\":true}",
      contentHash: "hash-1",
      validationStatus: "invalid",
      validationErrors: ["Missing title"],
      createdAt: "2026-05-10T00:00:00.000Z",
      updatedAt: "2026-05-10T00:00:00.000Z",
    },
  );
});

test("repositories write and read agent rows with snake_case payloads", async () => {
  const supabase = new FakeSupabaseClient();

  await updateVideoAgentSession(supabase.client, "video-1", {
    cursorAgentId: "bc-agent",
    cursorAgentRuntime: "cloud",
    agentWorkspacePath: "agent-recipes/video-1",
    lastAgentRunId: "run-1",
    lastAgentSyncAt: "2026-05-10T00:00:00.000Z",
    agentStatus: "idle",
  });

  await createAgentRun(supabase.client, {
    videoId: "video-1",
    cursorAgentId: "bc-agent",
    stage: "recipe_ingest",
    userMessage: "Analyze recipe",
    status: "running",
    createdBy: "user-1",
  });

  await updateAgentRun(supabase.client, "agent-run-1", {
    cursorRunId: "run-1",
    status: "finished",
    resultSummary: "Done",
    error: null,
    completedAt: "2026-05-10T00:01:00.000Z",
  });

  await upsertAgentArtifact(supabase.client, {
    videoId: "video-1",
    artifactName: "recipe-analysis.json",
    artifactPath: "agent-recipes/video-1/recipe-analysis.json",
    content: "{\"ok\":true}",
    contentHash: "hash-1",
    validationStatus: "valid",
    validationErrors: [],
  });

  await listAgentRunsByVideoId(supabase.client, "video-1");
  await listAgentArtifactsByVideoId(supabase.client, "video-1");

  assert.deepEqual(supabase.operations, [
    {
      table: "videos",
      method: "update",
      payload: {
        cursor_agent_id: "bc-agent",
        cursor_agent_runtime: "cloud",
        agent_workspace_path: "agent-recipes/video-1",
        last_agent_run_id: "run-1",
        last_agent_sync_at: "2026-05-10T00:00:00.000Z",
        agent_status: "idle",
      },
    },
    {
      table: "agent_runs",
      method: "insert",
      payload: {
        video_id: "video-1",
        cursor_agent_id: "bc-agent",
        stage: "recipe_ingest",
        user_message: "Analyze recipe",
        status: "running",
        created_by: "user-1",
      },
    },
    {
      table: "agent_runs",
      method: "update",
      payload: {
        cursor_run_id: "run-1",
        status: "finished",
        result_summary: "Done",
        error: null,
        completed_at: "2026-05-10T00:01:00.000Z",
      },
    },
    {
      table: "agent_artifacts",
      method: "upsert",
      payload: {
        video_id: "video-1",
        artifact_name: "recipe-analysis.json",
        artifact_path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{\"ok\":true}",
        content_hash: "hash-1",
        validation_status: "valid",
        validation_errors: [],
      },
      options: { onConflict: "video_id,artifact_name" },
    },
  ]);
});

class FakeSupabaseClient {
  operations: Array<Record<string, unknown>> = [];

  get client() {
    return {
      from: (table: string) => new FakeQuery(table, this),
    } as unknown as SupabaseDataClient;
  }
}

class FakeQuery {
  private method: string | null = null;
  private payload: unknown;
  private options: unknown;

  constructor(
    private readonly table: string,
    private readonly supabase: FakeSupabaseClient,
  ) {}

  insert(payload: unknown) {
    this.method = "insert";
    this.payload = payload;
    return this;
  }

  update(payload: unknown) {
    this.method = "update";
    this.payload = payload;
    return this;
  }

  upsert(payload: unknown, options?: unknown) {
    this.method = "upsert";
    this.payload = payload;
    this.options = options;
    return this;
  }

  select() {
    return this;
  }

  eq() {
    return this;
  }

  order() {
    return this;
  }

  single() {
    this.recordOperation();
    return Promise.resolve({ data: this.row(), error: null });
  }

  then(resolve: (value: unknown) => void) {
    resolve({ data: [this.row()], error: null });
  }

  private recordOperation() {
    if (!this.method) {
      return;
    }

    const operation: Record<string, unknown> = {
      table: this.table,
      method: this.method,
      payload: this.payload,
    };

    if (this.options) {
      operation.options = this.options;
    }

    this.supabase.operations.push(operation);
  }

  private row() {
    if (this.table === "videos") {
      return {
        id: "video-1",
        title: "Paris-Brest",
        slug: "paris-brest",
        recipe_url: null,
        recipe_data: null,
        status: "draft",
        storyboard: null,
        seedance_segments: null,
        selected_video_model: "seedance2",
        selected_image_model: "gpt_image_2",
        selected_tts_model: "eleven_multilingual_v2",
        selected_sfx_model: "eleven_text_to_sound_v2",
        total_cost_credits: 0,
        total_cost_openai: 0,
        created_by: "user-1",
        created_at: "2026-05-10T00:00:00.000Z",
        updated_at: "2026-05-10T00:00:00.000Z",
        cursor_agent_id: "bc-agent",
        cursor_agent_runtime: "cloud",
        agent_workspace_path: "agent-recipes/video-1",
        last_agent_run_id: "run-1",
        last_agent_sync_at: "2026-05-10T00:00:00.000Z",
        agent_status: "idle",
      };
    }

    if (this.table === "agent_artifacts") {
      return {
        id: "artifact-1",
        video_id: "video-1",
        artifact_name: "recipe-analysis.json",
        artifact_path: "agent-recipes/video-1/recipe-analysis.json",
        content: "{\"ok\":true}",
        content_hash: "hash-1",
        validation_status: "valid",
        validation_errors: [],
        created_at: "2026-05-10T00:00:00.000Z",
        updated_at: "2026-05-10T00:00:00.000Z",
      };
    }

    return {
      id: "agent-run-1",
      video_id: "video-1",
      cursor_agent_id: "bc-agent",
      cursor_run_id: "run-1",
      stage: "recipe_ingest",
      user_message: "Analyze recipe",
      status: "finished",
      result_summary: "Done",
      error: null,
      created_by: "user-1",
      started_at: "2026-05-10T00:00:00.000Z",
      completed_at: "2026-05-10T00:01:00.000Z",
      created_at: "2026-05-10T00:00:00.000Z",
      updated_at: "2026-05-10T00:01:00.000Z",
    };
  }
}
