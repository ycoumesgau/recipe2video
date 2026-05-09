import { NextRequest, NextResponse } from "next/server";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { inngest } from "@/inngest/client";
import { INNGEST_EVENTS } from "@/inngest/events";

export async function POST(request: NextRequest) {
  try {
    const { profile } = await assertCostlyActionAllowed();
    const body = (await request.json().catch(() => null)) as {
      segmentId?: unknown;
    } | null;
    const segmentId =
      typeof body?.segmentId === "string" ? body.segmentId.trim() : "";

    if (!segmentId) {
      return NextResponse.json(
        { error: "segmentId is required." },
        { status: 400 },
      );
    }

    const event = await inngest.send({
      name: INNGEST_EVENTS.segmentGenerationRequested,
      data: {
        segmentId,
        requestedByUserId: profile.id,
        isAllowlisted: true,
      },
    });

    return NextResponse.json({
      status: "queued",
      event,
    });
  } catch (error) {
    if (isAuthAccessError(error)) {
      return NextResponse.json(
        {
          error:
            error.code === "unauthenticated"
              ? "Authentication is required before launching workflows."
              : "This user is not authorized to launch workflows.",
        },
        { status: error.code === "unauthenticated" ? 401 : 403 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to queue segment generation workflow.",
      },
      { status: 500 },
    );
  }
}
