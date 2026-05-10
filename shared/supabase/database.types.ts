export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      allowed_users: {
        Row: {
          id: string;
          email: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          role: string;
          created_at: string;
        };
        Insert: {
          id: string;
          email: string;
          role?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          role?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          id: string;
          title: string;
          slug: string;
          recipe_url: string | null;
          recipe_data: Json | null;
          status: string;
          storyboard: Json | null;
          seedance_segments: Json | null;
          selected_video_model: string;
          selected_image_model: string;
          selected_tts_model: string;
          selected_sfx_model: string;
          total_cost_credits: number;
          total_cost_openai: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
          cursor_agent_id: string | null;
          cursor_agent_runtime: string | null;
          agent_workspace_path: string | null;
          last_agent_run_id: string | null;
          last_agent_sync_at: string | null;
          agent_status: string;
          agent_git_branch: string | null;
          agent_git_commit_sha: string | null;
        };
        Insert: {
          id?: string;
          title: string;
          slug: string;
          recipe_url?: string | null;
          recipe_data?: Json | null;
          status?: string;
          storyboard?: Json | null;
          seedance_segments?: Json | null;
          selected_video_model?: string;
          selected_image_model?: string;
          selected_tts_model?: string;
          selected_sfx_model?: string;
          total_cost_credits?: number;
          total_cost_openai?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          cursor_agent_id?: string | null;
          cursor_agent_runtime?: string | null;
          agent_workspace_path?: string | null;
          last_agent_run_id?: string | null;
          last_agent_sync_at?: string | null;
          agent_status?: string;
          agent_git_branch?: string | null;
          agent_git_commit_sha?: string | null;
        };
        Update: {
          id?: string;
          title?: string;
          slug?: string;
          recipe_url?: string | null;
          recipe_data?: Json | null;
          status?: string;
          storyboard?: Json | null;
          seedance_segments?: Json | null;
          selected_video_model?: string;
          selected_image_model?: string;
          selected_tts_model?: string;
          selected_sfx_model?: string;
          total_cost_credits?: number;
          total_cost_openai?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
          cursor_agent_id?: string | null;
          cursor_agent_runtime?: string | null;
          agent_workspace_path?: string | null;
          last_agent_run_id?: string | null;
          last_agent_sync_at?: string | null;
          agent_status?: string;
          agent_git_branch?: string | null;
          agent_git_commit_sha?: string | null;
        };
        Relationships: [];
      };
      logical_scenes: {
        Row: {
          id: string;
          video_id: string;
          segment_id: string | null;
          position: number;
          scene_type: string;
          arc: string;
          description: string;
          bg: string | null;
          zoom: string | null;
          duration_target: number | null;
          note: string | null;
        };
        Insert: {
          id?: string;
          video_id: string;
          segment_id?: string | null;
          position: number;
          scene_type: string;
          arc: string;
          description: string;
          bg?: string | null;
          zoom?: string | null;
          duration_target?: number | null;
          note?: string | null;
        };
        Update: {
          id?: string;
          video_id?: string;
          segment_id?: string | null;
          position?: number;
          scene_type?: string;
          arc?: string;
          description?: string;
          bg?: string | null;
          zoom?: string | null;
          duration_target?: number | null;
          note?: string | null;
        };
        Relationships: [];
      };
      segments: {
        Row: {
          id: string;
          video_id: string;
          position: number;
          arc: string;
          title: string;
          logical_scene_ids: Json;
          description: string;
          prompt: string;
          prompt_initial: string;
          references: Json;
          duration_target: number;
          status: string;
          selected_generation_id: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          position: number;
          arc: string;
          title: string;
          logical_scene_ids?: Json;
          description: string;
          prompt: string;
          prompt_initial: string;
          references?: Json;
          duration_target: number;
          status?: string;
          selected_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          position?: number;
          arc?: string;
          title?: string;
          logical_scene_ids?: Json;
          description?: string;
          prompt?: string;
          prompt_initial?: string;
          references?: Json;
          duration_target?: number;
          status?: string;
          selected_generation_id?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      media_assets: {
        Row: {
          id: string;
          video_id: string | null;
          segment_id: string | null;
          generation_id: string | null;
          type: string;
          provider: string;
          storage_bucket: string | null;
          storage_path: string | null;
          mux_asset_id: string | null;
          mux_playback_id: string | null;
          runway_output_url: string | null;
          original_filename: string | null;
          mime_type: string | null;
          file_size_bytes: number | null;
          duration_seconds: number | null;
          width: number | null;
          height: number | null;
          status: string;
          metadata: Json | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id?: string | null;
          segment_id?: string | null;
          generation_id?: string | null;
          type: string;
          provider: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mux_asset_id?: string | null;
          mux_playback_id?: string | null;
          runway_output_url?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          width?: number | null;
          height?: number | null;
          status?: string;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string | null;
          segment_id?: string | null;
          generation_id?: string | null;
          type?: string;
          provider?: string;
          storage_bucket?: string | null;
          storage_path?: string | null;
          mux_asset_id?: string | null;
          mux_playback_id?: string | null;
          runway_output_url?: string | null;
          original_filename?: string | null;
          mime_type?: string | null;
          file_size_bytes?: number | null;
          duration_seconds?: number | null;
          width?: number | null;
          height?: number | null;
          status?: string;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      reference_assets: {
        Row: {
          id: string;
          video_id: string | null;
          media_asset_id: string | null;
          type: string;
          canonical_name: string;
          source: string;
          runway_uri: string | null;
          prompt: string | null;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          video_id?: string | null;
          media_asset_id?: string | null;
          type: string;
          canonical_name: string;
          source: string;
          runway_uri?: string | null;
          prompt?: string | null;
          status?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string | null;
          media_asset_id?: string | null;
          type?: string;
          canonical_name?: string;
          source?: string;
          runway_uri?: string | null;
          prompt?: string | null;
          status?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          segment_id: string;
          media_asset_id: string | null;
          model: string;
          model_params: Json;
          runway_task_id: string | null;
          status: string;
          cost_credits: number | null;
          duration_seconds: number | null;
          triggered_by: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          segment_id: string;
          media_asset_id?: string | null;
          model: string;
          model_params?: Json;
          runway_task_id?: string | null;
          status?: string;
          cost_credits?: number | null;
          duration_seconds?: number | null;
          triggered_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          id?: string;
          segment_id?: string;
          media_asset_id?: string | null;
          model?: string;
          model_params?: Json;
          runway_task_id?: string | null;
          status?: string;
          cost_credits?: number | null;
          duration_seconds?: number | null;
          triggered_by?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      scene_feedbacks: {
        Row: {
          id: string;
          segment_id: string;
          generation_id: string;
          message: string;
          prompt_before: string;
          prompt_after: string;
          diff: Json;
          applied: boolean;
          embedding: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          segment_id: string;
          generation_id: string;
          message: string;
          prompt_before: string;
          prompt_after: string;
          diff: Json;
          applied?: boolean;
          embedding?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          segment_id?: string;
          generation_id?: string;
          message?: string;
          prompt_before?: string;
          prompt_after?: string;
          diff?: Json;
          applied?: boolean;
          embedding?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      cost_logs: {
        Row: {
          id: string;
          video_id: string;
          segment_id: string | null;
          provider: string;
          model: string;
          operation: string;
          credits_used: number | null;
          cost_dollars: number | null;
          tokens_input: number | null;
          tokens_output: number | null;
          metadata: Json | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          segment_id?: string | null;
          provider: string;
          model: string;
          operation: string;
          credits_used?: number | null;
          cost_dollars?: number | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          segment_id?: string | null;
          provider?: string;
          model?: string;
          operation?: string;
          credits_used?: number | null;
          cost_dollars?: number | null;
          tokens_input?: number | null;
          tokens_output?: number | null;
          metadata?: Json | null;
          created_by?: string | null;
          created_at?: string;
        };
        Relationships: [];
      };
      compositions: {
        Row: {
          id: string;
          video_id: string;
          export_media_asset_id: string | null;
          segment_order: Json;
          audio_media_asset_id: string | null;
          audio_sync: Json | null;
          remotion_props: Json | null;
          export_status: string;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          export_media_asset_id?: string | null;
          segment_order?: Json;
          audio_media_asset_id?: string | null;
          audio_sync?: Json | null;
          remotion_props?: Json | null;
          export_status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          export_media_asset_id?: string | null;
          segment_order?: Json;
          audio_media_asset_id?: string | null;
          audio_sync?: Json | null;
          remotion_props?: Json | null;
          export_status?: string;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_runs: {
        Row: {
          id: string;
          video_id: string;
          cursor_agent_id: string;
          cursor_run_id: string | null;
          stage: string;
          user_message: string;
          status: string;
          result_summary: string | null;
          error: string | null;
          created_by: string | null;
          started_at: string;
          completed_at: string | null;
          created_at: string;
          updated_at: string;
          agent_git_branch: string | null;
          agent_git_commit_sha: string | null;
          needs_user_input: boolean;
          user_chat_message_id: string | null;
          assistant_chat_message_id: string | null;
        };
        Insert: {
          id?: string;
          video_id: string;
          cursor_agent_id: string;
          cursor_run_id?: string | null;
          stage: string;
          user_message: string;
          status?: string;
          result_summary?: string | null;
          error?: string | null;
          created_by?: string | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          agent_git_branch?: string | null;
          agent_git_commit_sha?: string | null;
          needs_user_input?: boolean;
          user_chat_message_id?: string | null;
          assistant_chat_message_id?: string | null;
        };
        Update: {
          id?: string;
          video_id?: string;
          cursor_agent_id?: string;
          cursor_run_id?: string | null;
          stage?: string;
          user_message?: string;
          status?: string;
          result_summary?: string | null;
          error?: string | null;
          created_by?: string | null;
          started_at?: string;
          completed_at?: string | null;
          created_at?: string;
          updated_at?: string;
          agent_git_branch?: string | null;
          agent_git_commit_sha?: string | null;
          needs_user_input?: boolean;
          user_chat_message_id?: string | null;
          assistant_chat_message_id?: string | null;
        };
        Relationships: [];
      };
      agent_run_events: {
        Row: {
          id: string;
          agent_run_id: string;
          seq: number;
          event_type: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          agent_run_id: string;
          seq: number;
          event_type: string;
          payload?: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          agent_run_id?: string;
          seq?: number;
          event_type?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      recipe_agent_messages: {
        Row: {
          id: string;
          thread_id: string;
          agent_run_id: string | null;
          role: string;
          content: string;
          status: string;
          summary: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          thread_id: string;
          agent_run_id?: string | null;
          role: string;
          content?: string;
          status?: string;
          summary?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          thread_id?: string;
          agent_run_id?: string | null;
          role?: string;
          content?: string;
          status?: string;
          summary?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_agent_steps: {
        Row: {
          id: string;
          agent_run_id: string;
          seq: number;
          step_type: string;
          state: string;
          label: string | null;
          detail: string | null;
          payload: Json;
          source_event_seq: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          agent_run_id: string;
          seq: number;
          step_type: string;
          state?: string;
          label?: string | null;
          detail?: string | null;
          payload?: Json;
          source_event_seq?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          agent_run_id?: string;
          seq?: number;
          step_type?: string;
          state?: string;
          label?: string | null;
          detail?: string | null;
          payload?: Json;
          source_event_seq?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      recipe_agent_threads: {
        Row: {
          id: string;
          video_id: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      agent_artifacts: {
        Row: {
          id: string;
          video_id: string;
          artifact_name: string;
          artifact_path: string;
          content: string;
          content_hash: string | null;
          validation_status: string;
          validation_errors: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          video_id: string;
          artifact_name: string;
          artifact_path: string;
          content: string;
          content_hash?: string | null;
          validation_status?: string;
          validation_errors?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          video_id?: string;
          artifact_name?: string;
          artifact_path?: string;
          content?: string;
          content_hash?: string | null;
          validation_status?: string;
          validation_errors?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      app_settings: {
        Row: {
          key: string;
          value: Json;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          key: string;
          value: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          key?: string;
          value?: Json;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_updated_at: {
        Args: Record<string, never>;
        Returns: unknown;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
