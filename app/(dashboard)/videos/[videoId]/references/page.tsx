import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getReferenceReviewData } from "@/modules/references/use-cases/get-reference-review";
import { ReferenceReviewWorkflow } from "@/modules/references/ui/reference-review-workflow";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";

export default async function ProjectReferencesPage({
  params,
  searchParams,
}: {
  params: Promise<{ videoId: string }>;
  searchParams: Promise<{ message?: string; notice?: string }>;
}) {
  const { videoId } = await params;
  const query = await searchParams;
  const supabase = createSupabaseAdminClient();
  const [project, referenceData] = await Promise.all([
    getVideoProjectById(supabase, videoId),
    getReferenceReviewData(supabase, videoId),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <Badge className="mb-3" variant="outline">
          Issue #13
        </Badge>
        <h2 className="licorn-page-title">Reference review</h2>
        <p className="max-w-3xl text-muted-foreground">
          Validate global and recipe-specific reference images before Seedance
          generation. Approved references stay in Supabase Storage; Runway URI
          upload is explicit and tracked.
        </p>
      </div>

      {project ? (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium">{project.title}</p>
          <p className="text-muted-foreground">
            Project status: {project.status}. Selected image model:{" "}
            {project.selectedImageModel}.
          </p>
        </div>
      ) : (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project not found</AlertTitle>
          <AlertDescription>
            The references workflow can still render, but no project metadata was
            found for this ID.
          </AlertDescription>
        </Alert>
      )}

      <ReferenceReviewWorkflow
        data={referenceData}
        notice={getNotice(query)}
        videoId={videoId}
      />
    </div>
  );
}

function getNotice(query: {
  message?: string;
  notice?: string;
}): { type: "success" | "error"; message: string } | null {
  if (
    (query.notice !== "success" && query.notice !== "error") ||
    !query.message
  ) {
    return null;
  }

  return {
    type: query.notice,
    message: query.message,
  };
}
