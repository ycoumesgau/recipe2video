import { NextResponse } from "next/server";

import {
  assertCostlyActionAllowed,
  isAuthAccessError,
} from "@/modules/auth/assert-allowlisted-user";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  listCostLogs,
  listCostLogsByVideoId,
} from "@/modules/costs/repositories/cost.repository";
import type { CostLog } from "@/modules/costs/cost.types";

const CSV_HEADERS = [
  "id",
  "created_at",
  "video_id",
  "segment_id",
  "provider",
  "model",
  "operation",
  "credits_used",
  "cost_dollars",
  "tokens_input",
  "tokens_output",
  "metadata",
] as const;

export async function GET(request: Request) {
  try {
    await assertCostlyActionAllowed();
  } catch (error) {
    if (isAuthAccessError(error)) {
      return NextResponse.json(
        {
          error:
            error.code === "unauthenticated"
              ? "Authentication is required to export cost logs."
              : "This user is not authorized to export cost logs.",
        },
        { status: error.code === "unauthenticated" ? 401 : 403 },
      );
    }
    return NextResponse.json(
      { error: "Unable to export cost logs." },
      { status: 500 },
    );
  }

  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get("videoId");
  const supabase = createSupabaseAdminClient();
  const logs = videoId
    ? await listCostLogsByVideoId(supabase, videoId)
    : await listCostLogs(supabase, { limit: 1000 });

  const csv = [
    CSV_HEADERS.join(","),
    ...logs.map(serializeLogRow),
  ].join("\n");

  const filename = videoId
    ? `recipe2video-cost-logs-${videoId}.csv`
    : `recipe2video-cost-logs.csv`;

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function serializeLogRow(log: CostLog): string {
  return [
    log.id,
    log.createdAt,
    log.videoId,
    log.segmentId ?? "",
    log.provider,
    log.model,
    log.operation,
    log.creditsUsed?.toString() ?? "",
    log.costDollars?.toString() ?? "",
    log.tokensInput?.toString() ?? "",
    log.tokensOutput?.toString() ?? "",
    serializeMetadata(log.metadata),
  ]
    .map(escapeCsv)
    .join(",");
}

function serializeMetadata(metadata: CostLog["metadata"]): string {
  if (!metadata) {
    return "";
  }
  try {
    return JSON.stringify(metadata);
  } catch {
    return "";
  }
}

function escapeCsv(value: string): string {
  if (value === undefined || value === null) {
    return "";
  }

  const stringValue = String(value);
  if (
    stringValue.includes(",") ||
    stringValue.includes('"') ||
    stringValue.includes("\n")
  ) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}
