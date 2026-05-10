"use client";

import Link from "next/link";
import { type ReactNode, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowDownUp,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  Filter,
  PlayCircle,
  PlusCircle,
  Search,
  Sparkles,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  VIDEO_STATUS_LABELS,
  VIDEO_STATUSES,
  type VideoStatus,
} from "@/modules/videos/video-status";
import type {
  ActiveGenerationQueueItem,
  DashboardSortKey,
  VideoDashboardData,
  VideoDashboardProject,
} from "@/modules/videos/video-dashboard.types";
import { ProjectCardArchiveMenu } from "@/modules/videos/ui/project-card-archive-menu";

type StatusFilter = "all" | VideoStatus;

const statusBadgeVariant: Record<
  VideoStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  draft: "outline",
  recipe_ingested: "secondary",
  clarification_needed: "destructive",
  storyboard_ready: "default",
  storyboard_approved: "secondary",
  references_ready: "default",
  generating: "default",
  review: "default",
  assembling: "secondary",
  exported: "secondary",
  failed: "destructive",
};

const sortLabels: Record<DashboardSortKey, string> = {
  updated: "Last updated",
  cost: "Cost",
  completion: "Completion",
  status: "Status",
};

const thumbnailToneClasses: Record<VideoDashboardProject["thumbnailTone"], string> = {
  amber: "from-amber-500/35 via-orange-400/20 to-background",
  emerald: "from-emerald-500/35 via-lime-400/20 to-background",
  pink: "from-pink-500/35 via-rose-400/20 to-background",
  sky: "from-sky-500/35 via-cyan-400/20 to-background",
};

export function VideoLibraryDashboard({
  data,
  libraryMode,
}: {
  data: VideoDashboardData;
  libraryMode: "active" | "archived";
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<DashboardSortKey>("updated");

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return data.projects
      .filter((project) => {
        const matchesStatus =
          statusFilter === "all" || project.status === statusFilter;
        const matchesQuery =
          normalizedQuery.length === 0 ||
          [
            project.title,
            project.recipeSourceLabel,
            project.ownerName,
            VIDEO_STATUS_LABELS[project.status],
          ]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery);

        return matchesStatus && matchesQuery;
      })
      .sort((a, b) => compareProjects(a, b, sortKey));
  }, [data.projects, query, sortKey, statusFilter]);

  return (
    <div className="min-w-0 max-w-full space-y-6">
      <section className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Issue #10
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">
            Video project library
          </h2>
          <p className="max-w-3xl text-muted-foreground">
            Monitor every recipe video, visible checkpoint, background task, and
            cost estimate from one batch-first cockpit.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline">
            <Link href="#active-generation-queue">
              <Activity className="h-4 w-4" />
              Active queue
            </Link>
          </Button>
          <Button asChild>
            <Link href="/videos/new">
              <PlusCircle className="h-4 w-4" />
              Create video
            </Link>
          </Button>
        </div>
      </section>

      <section className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {data.kpis.map((kpi) => (
          <Card key={kpi.label} size="sm">
            <CardHeader>
              <CardDescription>{kpi.label}</CardDescription>
              <CardTitle className="text-2xl">{kpi.value}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              {kpi.helper}
            </CardContent>
          </Card>
        ))}
      </section>

      <Alert variant={data.budgetWarningLevel ? "destructive" : "default"}>
        {data.budgetWarningLevel ? (
          <AlertTriangle className="h-4 w-4" />
        ) : (
          <CircleDollarSign className="h-4 w-4" />
        )}
        <AlertTitle>
          {data.budgetWarningLevel
            ? `Runway credits are below the ${data.budgetWarningLevel}% threshold.`
            : "Budget visibility is part of the dashboard state."}
        </AlertTitle>
        <AlertDescription>
          The seeded dashboard shows {formatCredits(data.creditsUsed)} credits
          used and {formatCredits(data.estimatedCreditsRemaining)} estimated
          credits remaining. Costly generation actions stay outside this issue.
        </AlertDescription>
      </Alert>

      <section className="grid min-w-0 gap-4 max-xl:grid-cols-1 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,0.85fr)]">
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clapperboard className="h-5 w-5" />
                  Project library
                </CardTitle>
                <CardDescription>
                  {libraryMode === "archived"
                    ? "Projects you archived stay here until you restore them to the active library."
                    : "Active videos and seeded demos share this grid; archive anything you do not need on the default view."}
                </CardDescription>
              </div>
              <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:flex-wrap">
                <Button
                  asChild
                  variant={libraryMode === "archived" ? "secondary" : "outline"}
                >
                  <Link href={libraryMode === "archived" ? "/" : "/?archived=1"}>
                    {libraryMode === "archived"
                      ? "Back to active library"
                      : "Archived projects"}
                  </Link>
                </Button>
                <div className="relative min-w-0 sm:min-w-60">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    aria-label="Search projects"
                    className="w-full min-w-0 pl-8"
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search projects"
                    value={query}
                  />
                </div>
                <DashboardRadioMenu
                  icon={<Filter className="h-4 w-4" />}
                  label="Status"
                  value={
                    statusFilter === "all"
                      ? "All statuses"
                      : VIDEO_STATUS_LABELS[statusFilter]
                  }
                >
                  <DropdownMenuRadioGroup
                    onValueChange={(value) =>
                      setStatusFilter(value as StatusFilter)
                    }
                    value={statusFilter}
                  >
                    <DropdownMenuRadioItem value="all">
                      All statuses
                    </DropdownMenuRadioItem>
                    {VIDEO_STATUSES.map((status) => (
                      <DropdownMenuRadioItem key={status} value={status}>
                        {VIDEO_STATUS_LABELS[status]}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DashboardRadioMenu>
                <DashboardRadioMenu
                  icon={<ArrowDownUp className="h-4 w-4" />}
                  label="Sort"
                  value={sortLabels[sortKey]}
                >
                  <DropdownMenuRadioGroup
                    onValueChange={(value) =>
                      setSortKey(value as DashboardSortKey)
                    }
                    value={sortKey}
                  >
                    {(Object.keys(sortLabels) as DashboardSortKey[]).map(
                      (key) => (
                        <DropdownMenuRadioItem key={key} value={key}>
                          {sortLabels[key]}
                        </DropdownMenuRadioItem>
                      ),
                    )}
                  </DropdownMenuRadioGroup>
                </DashboardRadioMenu>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {data.projects.length === 0 ? (
              <ProjectEmptyState
                libraryMode={libraryMode}
                onClearFilters={() => undefined}
              />
            ) : filteredProjects.length === 0 ? (
              <ProjectEmptyState
                copy="No project matches the current search and status filters."
                libraryMode={libraryMode}
                onClearFilters={() => {
                  setQuery("");
                  setStatusFilter("all");
                }}
                title="No matching projects"
              />
            ) : (
              <div className="grid min-w-0 gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    libraryMode={libraryMode}
                    project={project}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="min-w-0 space-y-4">
          <ActiveQueueCard queue={data.activeQueue} />
          <RecentlyUpdatedCard projects={data.projects} />
        </div>
      </section>
    </div>
  );
}

function DashboardRadioMenu({
  children,
  icon,
  label,
  value,
}: {
  children: ReactNode;
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="w-full min-w-0 sm:w-auto sm:max-w-full">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            className="w-full min-w-0 max-w-full justify-start sm:w-auto [&>span:last-child]:min-w-0"
            variant="outline"
          >
            {icon}
            <span className="text-muted-foreground">{label}:</span>
            <span className="max-w-28 truncate">{value}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56">
          <DropdownMenuLabel>{label}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ProjectCard({
  libraryMode,
  project,
}: {
  libraryMode: "active" | "archived";
  project: VideoDashboardProject;
}) {
  const completion = getSegmentProgress(project);
  const agentStatus = project.agentStatus ?? "idle";
  const projectHref =
    project.recipeSourceKind === "demo_fixture" && project.id === "paris-brest-demo"
      ? "/demo"
      : `/videos/${project.id}`;

  return (
    <Card className="min-w-0" size="sm">
      {project.thumbnailUrl ? (
        <div className="relative mx-3 h-32 overflow-hidden rounded-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt={project.thumbnailLabel}
            className="h-full w-full object-cover"
            src={project.thumbnailUrl}
          />
          <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/70 to-transparent p-3">
            <div>
              <Badge variant="secondary">{project.recipeSourceLabel}</Badge>
              <p className="mt-2 text-lg font-semibold text-white drop-shadow">
                {project.thumbnailLabel}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`mx-3 flex h-32 items-end rounded-lg bg-gradient-to-br p-3 ${thumbnailToneClasses[project.thumbnailTone]}`}
        >
          <div>
            <Badge variant="secondary">{project.recipeSourceLabel}</Badge>
            <p className="mt-2 text-lg font-semibold">{project.thumbnailLabel}</p>
          </div>
        </div>
      )}
      <CardHeader>
        <CardAction>
          <div className="flex items-center gap-1">
            <Badge variant={statusBadgeVariant[project.status]}>
              {VIDEO_STATUS_LABELS[project.status]}
            </Badge>
            {project.canArchive ? (
              <ProjectCardArchiveMenu
                libraryMode={libraryMode}
                videoId={project.id}
              />
            ) : null}
          </div>
        </CardAction>
        <CardTitle className="pr-24">{project.title}</CardTitle>
        <CardDescription>
          Last updated {formatDateTime(project.updatedAt)} by {project.ownerName}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Segment progress</span>
            <span className="font-medium">
              {project.acceptedSegments} of {project.totalSegments} accepted
            </span>
          </div>
          <Progress value={completion} />
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Metric label="Active tasks" value={String(project.activeTaskCount)} />
          <Metric label="Cost so far" value={formatCredits(project.totalCostCredits)} />
        </div>

        <div className="rounded-lg border bg-muted/30 p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">Next action</p>
            <Badge variant={agentStatus === "failed" || agentStatus === "validation_failed" ? "destructive" : "outline"}>
              Agent {agentStatus.replace(/_/g, " ")}
            </Badge>
          </div>
          <p className="font-medium">{project.nextAction}</p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild className="flex-1" variant="outline">
            <Link href={projectHref}>
              Open project
              <ChevronRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild className="flex-1">
            <Link href={projectHref}>
              Resume
              <PlayCircle className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}

function ActiveQueueCard({ queue }: { queue: ActiveGenerationQueueItem[] }) {
  return (
    <Card id="active-generation-queue">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Active generation queue
        </CardTitle>
        <CardDescription>
          Async work stays visible across projects.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {queue.length === 0 ? (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>No active tasks</AlertTitle>
            <AlertDescription>
              Queued, running, failed, or blocked generation jobs will appear
              here when workflows are connected.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {queue.map((task) => (
              <div key={task.id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{task.projectTitle}</p>
                    <p className="text-sm text-muted-foreground">
                      {task.targetLabel}: {task.operation}
                    </p>
                  </div>
                  <Badge variant={queueBadgeVariant(task.status)}>
                    {task.status}
                  </Badge>
                </div>
                <div className="mt-3 space-y-2">
                  <Progress value={task.progress} />
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>Model: {task.model}</span>
                    <span>Cost est.: {formatCredits(task.costEstimateCredits)}</span>
                    <span>By {task.triggeredBy}</span>
                    <span>{formatDateTime(task.startedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RecentlyUpdatedCard({
  projects,
}: {
  projects: VideoDashboardProject[];
}) {
  const recentlyUpdated = [...projects]
    .sort((a, b) => compareProjects(a, b, "updated"))
    .slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock3 className="h-5 w-5" />
          Recently updated projects
        </CardTitle>
        <CardDescription>
          Shared state should make ownership and last activity obvious.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Project</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recentlyUpdated.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link
                    className="font-medium hover:underline"
                    href={`/videos/${project.id}`}
                  >
                    {project.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(project.updatedAt)}
                  </p>
                </TableCell>
                <TableCell>
                  <Badge variant={statusBadgeVariant[project.status]}>
                    {VIDEO_STATUS_LABELS[project.status]}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  {formatCredits(project.totalCostCredits)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function ProjectEmptyState({
  copy,
  libraryMode,
  onClearFilters,
  title,
}: {
  copy?: string;
  libraryMode: "active" | "archived";
  onClearFilters: () => void;
  title?: string;
}) {
  const resolvedTitle =
    title ??
    (libraryMode === "archived"
      ? "No archived projects"
      : "No video projects yet");
  const resolvedCopy =
    copy ??
    (libraryMode === "archived"
      ? "Anything you archive from the active library or a project page will land here for easy reuse."
      : "Create your first recipe video to start using Runway credits productively.");

  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <Sparkles className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
      <h3 className="font-medium">{resolvedTitle}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
        {resolvedCopy}
      </p>
      <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
        {libraryMode === "active" ? (
          <>
            <Button asChild>
              <Link href="/videos/new">Create video</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/demo">Load demo project</Link>
            </Button>
          </>
        ) : (
          <Button asChild variant="outline">
            <Link href="/">Back to active library</Link>
          </Button>
        )}
        <Button onClick={onClearFilters} variant="ghost">
          Clear filters
        </Button>
      </div>
    </div>
  );
}

function compareProjects(
  a: VideoDashboardProject,
  b: VideoDashboardProject,
  sortKey: DashboardSortKey,
) {
  if (sortKey === "cost") {
    return b.totalCostCredits - a.totalCostCredits;
  }

  if (sortKey === "completion") {
    return getSegmentProgress(b) - getSegmentProgress(a);
  }

  if (sortKey === "status") {
    return VIDEO_STATUS_LABELS[a.status].localeCompare(VIDEO_STATUS_LABELS[b.status]);
  }

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

function getSegmentProgress(project: VideoDashboardProject) {
  if (project.totalSegments === 0) {
    return 0;
  }

  return Math.round((project.acceptedSegments / project.totalSegments) * 100);
}

function queueBadgeVariant(
  status: ActiveGenerationQueueItem["status"],
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "failed") {
    return "destructive";
  }

  if (status === "succeeded") {
    return "secondary";
  }

  if (status === "queued") {
    return "outline";
  }

  return "default";
}

function formatCredits(credits: number) {
  return `${credits.toLocaleString("en-US")} cr`;
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
