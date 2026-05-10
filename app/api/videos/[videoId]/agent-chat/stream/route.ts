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
import { getAgentRunById } from "@/modules/recipe-agent/repositories/recipe-agent.repository";

export async function GET(
  request: Request,
  context: { params: Promise<{ videoId: string }> },
) {
  try {
    await assertCostlyActionAllowed();
  } catch (error) {
    if (isAuthAccessError(error)) {
      return new Response(
        JSON.stringify({
          error:
            error.code === "unauthenticated"
              ? "Authentication is required."
              : "This user is not authorized.",
        }),
        {
          status: error.code === "unauthenticated" ? 401 : 403,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({ error: "Unexpected auth failure." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { videoId } = await context.params;
  const { searchParams } = new URL(request.url);
  const runId = searchParams.get("runId");

  if (!runId) {
    return new Response(JSON.stringify({ error: "runId is required." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const supabase = createSupabaseAdminClient();
  const run = await getAgentRunById(supabase, runId);
  if (!run || run.videoId !== videoId) {
    return new Response(JSON.stringify({ error: "Agent run not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      let finishedTicks = 0;

      const tick = async () => {
        const thread = await getRecipeAgentThreadByVideoId(supabase, videoId);
        if (!thread) {
          send({
            type: "snapshot",
            messages: [],
            steps: [],
            runStatus: run.status,
          });
          return;
        }
        const messages = await listRecipeAgentMessagesByThreadId(supabase, thread.id);
        const steps = await listRecipeAgentStepsByRunId(supabase, runId);
        const latestRun = await getAgentRunById(supabase, runId);
        const runStatus = latestRun?.status ?? run.status;
        send({
          type: "snapshot",
          messages,
          steps,
          runStatus,
        });

        if (runStatus !== "running" && runStatus !== "queued") {
          finishedTicks += 1;
          if (finishedTicks >= 2) {
            send({ type: "done" });
            controller.close();
          }
        }
      };

      await tick();
      const id = setInterval(() => {
        void tick().catch(() => {
          clearInterval(id);
          controller.close();
        });
      }, 800);

      request.signal.addEventListener("abort", () => {
        clearInterval(id);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
    },
  });
}
