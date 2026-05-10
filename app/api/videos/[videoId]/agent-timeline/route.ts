import { NextResponse } from "next/server";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  listAgentRunEventsByAgentRunId,
  listAgentRunsByVideoId,
} from "@/modules/recipe-agent/repositories/recipe-agent.repository";

export async function GET(
  request: Request,
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
  const { searchParams } = new URL(request.url);
  const runIdParam = searchParams.get("runId");

  const supabase = createSupabaseAdminClient();
  const runs = await listAgentRunsByVideoId(supabase, videoId);

  let resolvedRunId = runIdParam;
  if (!resolvedRunId) {
    resolvedRunId = runs[0]?.id ?? null;
  } else if (!runs.some((run) => run.id === resolvedRunId)) {
    return NextResponse.json(
      { error: "Agent run not found for this video." },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!resolvedRunId) {
    return NextResponse.json(
      { videoId, runId: null, events: [] },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const events = await listAgentRunEventsByAgentRunId(supabase, resolvedRunId);

  return NextResponse.json(
    { videoId, runId: resolvedRunId, events },
    { headers: { "Cache-Control": "no-store" } },
  );
}
