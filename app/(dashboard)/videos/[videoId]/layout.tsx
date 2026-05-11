import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import {
  VideoProjectBreadcrumbProvider,
  VideoProjectBreadcrumbs,
} from "@/modules/videos/ui/video-project-breadcrumbs";

export default async function VideoProjectLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ videoId: string }>;
}>) {
  const { videoId } = await params;
  const projectTitle = await loadProjectTitleForBreadcrumb(videoId);

  return (
    <VideoProjectBreadcrumbProvider>
      <VideoProjectBreadcrumbs
        projectTitle={projectTitle}
        videoId={videoId}
      />
      {children}
    </VideoProjectBreadcrumbProvider>
  );
}

async function loadProjectTitleForBreadcrumb(videoId: string): Promise<string> {
  try {
    const supabase = createSupabaseAdminClient();
    const project = await getVideoProjectById(supabase, videoId);
    if (project?.title) {
      return project.title;
    }
  } catch {
    /* best-effort breadcrumb label */
  }
  return "Project";
}
