import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { NewVideoWizardForm } from "@/modules/videos/ui/new-video-wizard-form";

export default function NewVideoPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Breadcrumb className="mb-2">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Dashboard</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Create video</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div>
        <Badge className="mb-3" variant="outline">
          Issue #11
        </Badge>
        <h2 className="licorn-page-title">
          Create video
        </h2>
        <p className="text-muted-foreground">
          The production wizard will accept recipe URLs, photos, pasted text,
          and demo fixtures.
        </p>
      </div>

      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle>Draft-first creation</CardTitle>
          <CardDescription>
            The app stores a draft video project before any expensive planning
            or generation step can run. Selected models stay visible and are
            persisted with the project.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Submit creates status <code>draft</code>, uploads recipe photos to
          Supabase Storage when provided, and redirects to the project overview.
        </CardContent>
      </Card>

      <NewVideoWizardForm />
    </div>
  );
}
