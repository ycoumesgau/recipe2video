import type { SupabaseDataClient } from "@/shared/supabase/client.types";
import { throwIfSupabaseError } from "@/shared/supabase/errors";

import {
  getAgentConversationById,
  mirrorActiveConversationToVideo,
  updateAgentConversation,
} from "../repositories/agent-conversations.repository";

export async function switchActiveConversation(input: {
  supabase: SupabaseDataClient;
  videoId: string;
  toConversationId: string;
}): Promise<void> {
  const target = await getAgentConversationById(
    input.supabase,
    input.toConversationId,
  );

  if (!target || target.videoId !== input.videoId || target.deletedAt) {
    throw new Error("Conversation not found for this video.");
  }

  if (target.isActive) {
    await mirrorActiveConversationToVideo(input.supabase, input.videoId, target);
    return;
  }

  const { error: deactivateConversationsError } = await input.supabase
    .from("agent_conversations")
    .update({ is_active: false })
    .eq("video_id", input.videoId)
    .eq("is_active", true);

  throwIfSupabaseError(
    deactivateConversationsError,
    "switchActiveConversation deactivate conversations failed",
  );

  const { error: deactivateScenesError } = await input.supabase
    .from("logical_scenes")
    .update({ is_active: false })
    .eq("video_id", input.videoId)
    .eq("is_active", true);

  throwIfSupabaseError(
    deactivateScenesError,
    "switchActiveConversation deactivate logical_scenes failed",
  );

  const { error: deactivateSegmentsError } = await input.supabase
    .from("segments")
    .update({ is_active: false })
    .eq("video_id", input.videoId)
    .eq("is_active", true);

  throwIfSupabaseError(
    deactivateSegmentsError,
    "switchActiveConversation deactivate segments failed",
  );

  const { error: deactivateSegmentRefsError } = await input.supabase
    .from("segment_references")
    .update({ is_active: false })
    .eq("agent_conversation_id", target.id);

  throwIfSupabaseError(
    deactivateSegmentRefsError,
    "switchActiveConversation deactivate segment_references failed",
  );

  // Deactivate segment_references tied to segments from other conversations
  const { data: otherConversationSegments, error: otherSegmentsError } =
    await input.supabase
      .from("segments")
      .select("id")
      .eq("video_id", input.videoId)
      .neq("agent_conversation_id", target.id);

  throwIfSupabaseError(
    otherSegmentsError,
    "switchActiveConversation list other segments failed",
  );

  const otherSegmentIds = (otherConversationSegments ?? []).map(
    (row) => row.id,
  );
  if (otherSegmentIds.length > 0) {
    const { error: deactivateOtherRefsError } = await input.supabase
      .from("segment_references")
      .update({ is_active: false })
      .in("segment_id", otherSegmentIds);

    throwIfSupabaseError(
      deactivateOtherRefsError,
      "switchActiveConversation deactivate other segment_references failed",
    );
  }

  const { error: activateScenesError } = await input.supabase
    .from("logical_scenes")
    .update({ is_active: true })
    .eq("video_id", input.videoId)
    .eq("agent_conversation_id", target.id);

  throwIfSupabaseError(
    activateScenesError,
    "switchActiveConversation activate logical_scenes failed",
  );

  const { error: activateSegmentsError } = await input.supabase
    .from("segments")
    .update({ is_active: true })
    .eq("video_id", input.videoId)
    .eq("agent_conversation_id", target.id);

  throwIfSupabaseError(
    activateSegmentsError,
    "switchActiveConversation activate segments failed",
  );

  const { error: activateSegmentRefsError } = await input.supabase
    .from("segment_references")
    .update({ is_active: true })
    .eq("agent_conversation_id", target.id);

  throwIfSupabaseError(
    activateSegmentRefsError,
    "switchActiveConversation activate segment_references failed",
  );

  const activated = await updateAgentConversation(
    input.supabase,
    target.id,
    { isActive: true },
  );

  await mirrorActiveConversationToVideo(input.supabase, input.videoId, activated);
}
