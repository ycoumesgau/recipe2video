import { NextResponse } from "next/server";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getRecipeAgentThreadByVideoId,
  listRecipeAgentMessagesByThreadId,
  listRecipeAgentStepsByRunId,
} from "@/modules/recipe-agent/repositories/recipe-agent-chat.repository";
import { listAgentRunsByVideoId } from "@/modules/recipe-agent/repositories/recipe-agent.repository";

export async function GET(
  _request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  try {
    await assertCostlyActionAllowed();
  } catch (error) {
    if (isAuthAccessError(error)) {
      return NextResponse.json(
        {
          error:
            error.code === "unauthenticated"
              ? "Authentication is required."
              : "This user is not authorized.",
        },
        { status: error.code === "unauthenticated" ? 401 : 403 },
      );
    }

    return NextResponse.json({ error: "Unexpected auth failure." }, { status: 500 });
  }

  const { videoId } = await context.params;
  const supabase = createSupabaseAdminClient();
  const thread = await getRecipeAgentThreadByVideoId(supabase, videoId);
  const runs = await listAgentRunsByVideoId(supabase, videoId);
  const latestRunId = runs[0]?.id ?? null;

  if (!thread) {
    return NextResponse.json(
      {
        videoId,
        threadId: null,
        messages: [],
        latestRunId,
        steps: [],
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const messages = await listRecipeAgentMessagesByThreadId(supabase, thread.id);
  const steps =
    latestRunId !== null
      ? await listRecipeAgentStepsByRunId(supabase, latestRunId)
      : [];

  return NextResponse.json(
    {
      videoId,
      threadId: thread.id,
      messages,
      latestRunId,
      steps,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
