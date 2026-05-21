import {
  RUNWAY_BUDGET_WARNING_THRESHOLDS,
} from "./cost.constants";
import type { RunwayOrganizationBalance } from "./runway-organization-balance";
import type {
  CostBreakdownRow,
  CostBudgetState,
  CostDashboardData,
  CostDashboardProjectRef,
  CostLog,
} from "./cost.types";

interface GetCostDashboardDataInput {
  logs: CostLog[];
  globalLogs?: CostLog[];
  projects?: CostDashboardProjectRef[];
  scope?: "global" | "project";
  projectId?: string;
  projectTitle?: string;
  runwayBalance?: RunwayOrganizationBalance | null;
}

export function getCostDashboardData(
  input: GetCostDashboardDataInput,
): CostDashboardData {
  const scope = input.scope ?? "global";
  const logs = [...input.logs].sort(compareLogsByCreatedAtDesc);
  const budgetLogs = input.globalLogs ?? logs;
  const runwayCreditsForScope = sumRunwayCredits(logs);
  const budget = getRunwayBudgetState(sumRunwayCredits(budgetLogs), {
    runwayCreditBalance: input.runwayBalance?.creditBalance ?? null,
    maxMonthlyCreditSpend: input.runwayBalance?.maxMonthlyCreditSpend ?? null,
  });
  const failedOrRejected = buildFailedOrRejectedRow(logs);
  const acceptedSegmentCount = countAcceptedSegments(logs);
  const exportedVideoCount =
    input.projects?.filter((project) => project.status === "exported").length ?? 0;

  return {
    scope,
    projectId: input.projectId,
    projectTitle: input.projectTitle,
    logs,
    recentLogs: logs.slice(0, 25),
    budget,
    summaryMetrics: [
      {
        label: "Runway credits used",
        value: formatCredits(runwayCreditsForScope),
        helper:
          scope === "global"
            ? "Logged across all projects"
            : "Logged for this project",
      },
      {
        label: "Credits remaining",
        value: budget.runwayBalanceKnown
          ? formatCredits(budget.creditsRemaining)
          : "n/a",
        helper: budget.runwayBalanceKnown
          ? input.runwayBalance?.maxMonthlyCreditSpend
            ? `${budget.percentRemaining}% vs Runway monthly spend cap`
            : `${budget.percentRemaining}% vs balance + app-logged usage`
          : "Runway balance unavailable — set RUNWAYML_API_SECRET",
      },
      {
        label: "OpenAI token spend",
        value: formatDollars(sumDollarsForProvider(logs, "openai")),
        helper: `${formatInteger(sumTokens(logs))} logged tokens`,
      },
      {
        label: "Mux estimate",
        value: formatDollars(sumDollarsForProvider(logs, "mux")),
        helper: "Playback/storage estimate from cost logs",
      },
      {
        label: "Rejected or failed spend",
        value: formatCredits(failedOrRejected.creditsUsed),
        helper: `${formatDollars(
          failedOrRejected.costDollars,
        )} in dollar-denominated logs`,
      },
      {
        label:
          scope === "global" ? "Cost per accepted video" : "Cost per accepted segment",
        value:
          scope === "global"
            ? formatRatio(runwayCreditsForScope, exportedVideoCount, "cr")
            : formatRatio(runwayCreditsForScope, acceptedSegmentCount, "cr"),
        helper:
          scope === "global"
            ? "Uses exported projects when available"
            : "Uses accepted segment metadata when available",
      },
    ],
    byProvider: sortBreakdownRows(buildBreakdown(logs, getProviderKey)),
    byModel: sortBreakdownRows(buildBreakdown(logs, getModelKey)),
    bySegment: sortBreakdownRows(buildBreakdown(logs, getSegmentKey)),
    failedOrRejected,
    providerOptions: uniqueSorted(logs.map((log) => log.provider)),
    modelOptions: uniqueSorted(logs.map((log) => log.model)),
  };
}

export interface RunwayBudgetOptions {
  runwayCreditBalance?: number | null;
  maxMonthlyCreditSpend?: number | null;
}

export function getRunwayBudgetState(
  runwayCreditsUsed: number,
  options: RunwayBudgetOptions = {},
): CostBudgetState {
  const balanceRaw = options.runwayCreditBalance;
  const runwayBalanceKnown =
    typeof balanceRaw === "number" && Number.isFinite(balanceRaw);
  const creditsRemainingFromApi = runwayBalanceKnown
    ? Math.max(0, Math.round(balanceRaw as number))
    : 0;

  const monthlyRaw = options.maxMonthlyCreditSpend;
  const hasMonthlyCap =
    typeof monthlyRaw === "number" &&
    Number.isFinite(monthlyRaw) &&
    monthlyRaw > 0;

  let budgetCredits: number;
  if (runwayBalanceKnown && hasMonthlyCap) {
    budgetCredits = Math.round(monthlyRaw as number);
  } else if (runwayBalanceKnown) {
    budgetCredits = Math.max(
      creditsRemainingFromApi + Math.round(runwayCreditsUsed),
      1,
    );
  } else {
    budgetCredits = Math.max(Math.round(runwayCreditsUsed), 1);
  }

  const creditsRemaining = runwayBalanceKnown ? creditsRemainingFromApi : 0;
  const rawPercentRemaining =
    budgetCredits > 0 ? (creditsRemaining / budgetCredits) * 100 : 0;
  const percentRemaining = Math.round(Math.min(100, rawPercentRemaining));

  let warningLevel: 20 | 10 | null = null;
  if (runwayBalanceKnown) {
    if (rawPercentRemaining <= RUNWAY_BUDGET_WARNING_THRESHOLDS[1]) {
      warningLevel = RUNWAY_BUDGET_WARNING_THRESHOLDS[1];
    } else if (rawPercentRemaining <= RUNWAY_BUDGET_WARNING_THRESHOLDS[0]) {
      warningLevel = RUNWAY_BUDGET_WARNING_THRESHOLDS[0];
    }
  }

  return {
    budgetCredits,
    runwayCreditsUsed,
    creditsRemaining,
    percentRemaining,
    warningLevel,
    runwayBalanceKnown,
  };
}

function buildBreakdown(
  logs: CostLog[],
  getKey: (log: CostLog) => CostBreakdownRow,
) {
  const rows = new Map<string, CostBreakdownRow>();

  for (const log of logs) {
    const next = getKey(log);
    const row = rows.get(next.key) ?? next;

    row.creditsUsed += log.creditsUsed ?? 0;
    row.costDollars += log.costDollars ?? 0;
    row.tokensInput += log.tokensInput ?? 0;
    row.tokensOutput += log.tokensOutput ?? 0;
    row.logCount += 1;

    if (isFailedOrRejectedSpend(log)) {
      row.failedOrRejectedCredits += log.creditsUsed ?? 0;
      row.failedOrRejectedCostDollars += log.costDollars ?? 0;
    }

    rows.set(row.key, row);
  }

  return Array.from(rows.values());
}

function buildFailedOrRejectedRow(logs: CostLog[]): CostBreakdownRow {
  const row = createBreakdownRow("failed-or-rejected", "Rejected or failed spend");

  for (const log of logs) {
    if (!isFailedOrRejectedSpend(log)) {
      continue;
    }

    row.creditsUsed += log.creditsUsed ?? 0;
    row.costDollars += log.costDollars ?? 0;
    row.tokensInput += log.tokensInput ?? 0;
    row.tokensOutput += log.tokensOutput ?? 0;
    row.logCount += 1;
    row.failedOrRejectedCredits += log.creditsUsed ?? 0;
    row.failedOrRejectedCostDollars += log.costDollars ?? 0;
  }

  return row;
}

function createBreakdownRow(
  key: string,
  label: string,
  extra: Partial<CostBreakdownRow> = {},
): CostBreakdownRow {
  return {
    key,
    label,
    creditsUsed: 0,
    costDollars: 0,
    tokensInput: 0,
    tokensOutput: 0,
    logCount: 0,
    failedOrRejectedCredits: 0,
    failedOrRejectedCostDollars: 0,
    ...extra,
  };
}

function getProviderKey(log: CostLog) {
  return createBreakdownRow(log.provider, providerLabel(log.provider), {
    provider: log.provider,
  });
}

function getModelKey(log: CostLog) {
  return createBreakdownRow(`${log.provider}:${log.model}`, log.model, {
    provider: log.provider,
    model: log.model,
  });
}

function getSegmentKey(log: CostLog) {
  const segmentId = log.segmentId ?? null;
  const label = segmentId ? getSegmentLabel(log) : "Project-level logs";

  return createBreakdownRow(segmentId ?? "project-level", label, {
    segmentId,
  });
}

function getSegmentLabel(log: CostLog) {
  const title = readMetadataString(log, "segmentTitle");
  const position = readMetadataNumber(log, "segmentPosition");

  if (title && position) {
    return `Segment ${position}: ${title}`;
  }

  if (title) {
    return title;
  }

  if (position) {
    return `Segment ${position}`;
  }

  return log.segmentId ? `Segment ${log.segmentId.slice(0, 8)}` : "Project-level logs";
}

function isFailedOrRejectedSpend(log: CostLog) {
  if (log.operation.endsWith("_refunded")) {
    return true;
  }

  const values = [
    readMetadataString(log, "generationStatus"),
    readMetadataString(log, "segmentStatus"),
    readMetadataString(log, "status"),
    readMetadataString(log, "outcome"),
  ];

  return values.some((value) => value === "failed" || value === "rejected");
}

function countAcceptedSegments(logs: CostLog[]) {
  return new Set(
    logs
      .filter((log) => log.segmentId && readMetadataString(log, "segmentStatus") === "accepted")
      .map((log) => log.segmentId),
  ).size;
}

function sumRunwayCredits(logs: CostLog[]) {
  return logs
    .filter((log) => log.provider === "runway")
    .reduce((total, log) => total + (log.creditsUsed ?? 0), 0);
}

function sumDollarsForProvider(logs: CostLog[], provider: string) {
  return logs
    .filter((log) => log.provider === provider)
    .reduce((total, log) => total + (log.costDollars ?? 0), 0);
}

function sumTokens(logs: CostLog[]) {
  return logs.reduce(
    (total, log) => total + (log.tokensInput ?? 0) + (log.tokensOutput ?? 0),
    0,
  );
}

function readMetadataString(log: CostLog, key: string) {
  const value = readMetadata(log, key);
  return typeof value === "string" ? value : null;
}

function readMetadataNumber(log: CostLog, key: string) {
  const value = readMetadata(log, key);
  return typeof value === "number" ? value : null;
}

function readMetadata(log: CostLog, key: string) {
  const metadata = log.metadata;

  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  return metadata[key];
}

function sortBreakdownRows(rows: CostBreakdownRow[]) {
  return rows.sort((a, b) => {
    const totalA = a.creditsUsed + a.costDollars;
    const totalB = b.creditsUsed + b.costDollars;
    return totalB - totalA || a.label.localeCompare(b.label);
  });
}

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function compareLogsByCreatedAtDesc(a: CostLog, b: CostLog) {
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

function providerLabel(provider: string) {
  if (provider === "openai") {
    return "OpenAI";
  }

  if (provider === "runway") {
    return "Runway";
  }

  if (provider === "mux") {
    return "Mux";
  }

  return provider;
}

function formatCredits(value: number) {
  return `${formatInteger(value)} cr`;
}

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatInteger(value: number) {
  return Math.round(value).toLocaleString("en-US");
}

function formatRatio(total: number, count: number, suffix: string) {
  if (count <= 0) {
    return "n/a";
  }

  return `${formatInteger(total / count)} ${suffix}`;
}
