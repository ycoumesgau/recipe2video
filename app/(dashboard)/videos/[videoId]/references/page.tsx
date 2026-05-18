import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { GenerationRscSync } from "@/modules/generation/ui/generation-rsc-sync";
import { getReferenceReviewData } from "@/modules/references/use-cases/get-reference-review";
import { ReferenceReviewWorkflow } from "@/modules/references/ui/reference-review-workflow";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { VIDEO_STATUS_LABELS } from "@/modules/videos/video-status";

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

  const hasGeneratingRecipeReferences = referenceData.recipeReferences.some(
    (item) => item.reference.status === "generating",
  );

  return (
    <div className="space-y-6">
      <GenerationRscSync enabled={hasGeneratingRecipeReferences} pollMs={4_000} />
      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Badge variant="outline">References</Badge>
          {project ? (
            <Badge variant="outline">
              {VIDEO_STATUS_LABELS[project.status]}
            </Badge>
          ) : null}
        </div>
        <h2 className="licorn-page-title">
          {project?.title ?? "Video project"}
        </h2>
        <p className="max-w-3xl text-muted-foreground">
          Validate global and recipe-specific reference images before Seedance
          generation. Approved references stay in Supabase Storage; Runway URI
          upload is explicit and tracked.
          {project ? (
            <>
              {" "}
              Selected image model: {project.selectedImageModel}.
            </>
          ) : null}
        </p>
      </div>

      {!project ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Project not found</AlertTitle>
          <AlertDescription>
            The references workflow can still render, but no project metadata was
            found for this ID.
          </AlertDescription>
        </Alert>
      ) : null}

      <ReferenceReviewWorkflow
        data={referenceData}
        notice={getNotice(query)}
        projectStatus={project?.status ?? null}
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
