"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  CircleDollarSign,
  Database,
  Download,
  ListFilter,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import type { CostBreakdownRow, CostDashboardData, CostLog } from "../cost.types";

export function CostDashboard({ data }: { data: CostDashboardData }) {
  const [providerFilter, setProviderFilter] = useState("all");
  const [modelFilter, setModelFilter] = useState("all");

  const filteredLogs = useMemo(
    () =>
      data.recentLogs.filter(
        (log) =>
          (providerFilter === "all" || log.provider === providerFilter) &&
          (modelFilter === "all" || log.model === modelFilter),
      ),
    [data.recentLogs, modelFilter, providerFilter],
  );

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Issue #16
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            {data.scope === "global"
              ? "Cost dashboard"
              : `${data.projectTitle ?? "Project"} costs`}
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Track Runway credits, OpenAI token spend, Mux estimates, and
            rejected or failed generation spend from append-only cost logs.
          </p>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <Button asChild size="sm" variant="outline">
            <a
              href={`/api/costs/export.csv${data.projectId ? `?videoId=${data.projectId}` : ""}`}
            >
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
          <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-sm">
            <span className="flex items-center gap-2 text-muted-foreground">
              <ListFilter className="h-4 w-4" />
              Provider
            </span>
            <Select value={providerFilter} onValueChange={setProviderFilter}>
              <SelectTrigger
                aria-label="Filter cost logs by provider"
                className="w-full font-normal md:min-w-48"
              >
                <SelectValue placeholder="Pick a provider" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">All providers</SelectItem>
                {data.providerOptions.map((provider) => (
                  <SelectItem key={provider} value={provider}>
                    {providerLabel(provider)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          <label className="space-y-1 text-sm">
            <span className="text-muted-foreground">Model</span>
            <Select value={modelFilter} onValueChange={setModelFilter}>
              <SelectTrigger
                aria-label="Filter cost logs by model"
                className="w-full font-normal md:min-w-48"
              >
                <SelectValue placeholder="Pick a model" />
              </SelectTrigger>
              <SelectContent position="popper">
                <SelectItem value="all">All models</SelectItem>
                {data.modelOptions.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
          </div>
        </div>
      </section>

      {data.budget.warningLevel ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            Runway credits are below the {data.budget.warningLevel}% threshold.
          </AlertTitle>
          <AlertDescription>
            {formatCredits(data.budget.creditsRemaining)} remain from the{" "}
            {formatCredits(data.budget.budgetCredits)} hackathon budget. Pause
            new generations if this is unexpected.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <CircleDollarSign className="h-4 w-4" />
          <AlertTitle>Budget is visible before costly work.</AlertTitle>
          <AlertDescription>
            {data.budget.percentRemaining}% of Runway credits remain. Warnings
            will appear at 20% and 10% remaining.
          </AlertDescription>
        </Alert>
      )}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {data.summaryMetrics.map((metric) => (
          <Card key={metric.label} size="sm">
            <CardHeader>
              <CardDescription>{metric.label}</CardDescription>
              <CardTitle className="text-2xl">{metric.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {metric.helper}
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <BreakdownCard
          description="Runway, OpenAI, and Mux totals from cost_logs."
          rows={data.byProvider}
          title="Cost by provider"
        />
        <BreakdownCard
          description="Model-level spend makes expensive settings visible."
          rows={data.byModel}
          title="Cost by model"
        />
        <BreakdownCard
          description="Segment rows separate accepted, rejected, and failed spend when metadata is available."
          rows={data.bySegment}
          title="Cost by segment"
        />
        <RecentLogsCard logs={filteredLogs} />
      </section>
    </div>
  );
}

function BreakdownCard({
  description,
  rows,
  title,
}: {
  description: string;
  rows: CostBreakdownRow[];
  title: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <EmptyCostState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Credits</TableHead>
                <TableHead className="text-right">Dollars</TableHead>
                <TableHead className="text-right">Rejected/failed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell>
                    <p className="font-medium">{row.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.logCount} log{row.logCount === 1 ? "" : "s"}
                    </p>
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCredits(row.creditsUsed)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatDollars(row.costDollars)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCredits(row.failedOrRejectedCredits)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function RecentLogsCard({ logs }: { logs: CostLog[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent cost logs</CardTitle>
        <CardDescription>
          Cost logs are append-only and can be estimated when exact billing is
          unavailable.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {logs.length === 0 ? (
          <EmptyCostState />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Operation</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Model</TableHead>
                <TableHead className="text-right">Spend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>
                    {log.videoId && log.segmentId ? (
                      <Link
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                        href={`/videos/${log.videoId}/segments/${log.segmentId}`}
                      >
                        {log.operation}
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    ) : log.videoId ? (
                      <Link
                        className="inline-flex items-center gap-1 font-medium hover:underline"
                        href={`/videos/${log.videoId}`}
                      >
                        {log.operation}
                        <ChevronRight className="h-3 w-3" />
                      </Link>
                    ) : (
                      <p className="font-medium">{log.operation}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(log.createdAt)}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{providerLabel(log.provider)}</Badge>
                  </TableCell>
                  <TableCell>{log.model}</TableCell>
                  <TableCell className="text-right">
                    {log.creditsUsed
                      ? formatCredits(log.creditsUsed)
                      : formatDollars(log.costDollars ?? 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyCostState() {
  return (
    <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
      <Database className="mx-auto mb-2 h-6 w-6" />
      No cost logs match this view yet.
    </div>
  );
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
  return `${Math.round(value).toLocaleString("en-US")} cr`;
}

function formatDollars(value: number) {
  return new Intl.NumberFormat("en-US", {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value);
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    timeZone: "UTC",
    timeZoneName: "short",
  }).format(new Date(value));
}
