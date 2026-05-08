import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, Clapperboard } from "lucide-react";

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
import { Progress } from "@/components/ui/progress";

const stats = [
  { label: "Active videos", value: "0" },
  { label: "Segments generating", value: "0" },
  { label: "Waiting for review", value: "0" },
  { label: "Runway credits used", value: "0" },
];

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <Badge className="mb-3" variant="outline">
            Issue #1 placeholder
          </Badge>
          <h2 className="text-3xl font-semibold tracking-tight">Dashboard</h2>
          <p className="text-muted-foreground">
            Manage recipe video projects, background generations, costs, and
            checkpoints from one place.
          </p>
        </div>
        <Button asChild>
          <Link href="/videos/new">Create video</Link>
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardHeader className="pb-2">
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="text-3xl">{stat.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5" />
              Project library
            </CardTitle>
            <CardDescription>
              Supabase-backed project cards will appear here once the data layer
              lands.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-dashed p-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
              <h3 className="font-medium">No video projects yet.</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first recipe video or load the Paris-Brest demo
                fixture after the demo mode issue is implemented.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Active generation queue
            </CardTitle>
            <CardDescription>
              Every async job must expose status and next action.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Progress value={0} />
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>No active tasks</AlertTitle>
              <AlertDescription>
                Inngest workflows and Runway polling are not wired yet.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
