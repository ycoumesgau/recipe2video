import Link from "next/link";
import { AlertTriangle } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getAssemblyPageData } from "@/modules/assembly/use-cases/get-assembly-data";
import { AssemblyWorkspace } from "@/modules/assembly/ui/assembly-workspace";

export default async function ProjectAssemblyPage({
  params,
}: {
  params: Promise<{ videoId: string }>;
}) {
  const { videoId } = await params;
  const { data, dataError } = await loadAssembly(videoId);

  if (!data) {
    return (
      <div className="space-y-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Assembly data unavailable</AlertTitle>
          <AlertDescription>{dataError}</AlertDescription>
        </Alert>
        <Button asChild variant="outline">
          <Link href={`/videos/${videoId}`}>Back to project</Link>
        </Button>
      </div>
    );
  }

  return (
    <AssemblyWorkspace
      compositionId={data.composition?.id}
      finalExports={data.finalExports}
      initialRemotionProps={data.remotionProps}
      missingAcceptedSegments={data.missingAcceptedSegments}
      projectStatus={data.projectStatus}
      projectTitle={data.projectTitle}
      videoId={videoId}
    />
  );
}

async function loadAssembly(videoId: string) {
  try {
    return {
      data: await getAssemblyPageData(videoId),
      dataError: null,
    };
  } catch (error) {
    return {
      data: null,
      dataError:
        error instanceof Error
          ? error.message
          : "Unable to load assembly data.",
    };
  }
}
