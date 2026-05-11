import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getSegmentById } from "@/modules/storyboard/repositories/segment.repository";
import { RegisterSegmentCrumb } from "@/modules/videos/ui/video-project-breadcrumbs";

export default async function SegmentDetailLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ videoId: string; segmentId: string }>;
}>) {
  const { segmentId, videoId } = await params;
  const segmentTitle = await loadSegmentTitleForBreadcrumb(videoId, segmentId);

  return (
    <>
      <RegisterSegmentCrumb title={segmentTitle} />
      {children}
    </>
  );
}

async function loadSegmentTitleForBreadcrumb(
  videoId: string,
  segmentId: string,
): Promise<string> {
  try {
    const supabase = createSupabaseAdminClient();
    const segment = await getSegmentById(supabase, segmentId);
    if (segment?.videoId === videoId && segment.title) {
      return segment.title;
    }
  } catch {
    /* best-effort crumb */
  }
  return "Segment";
}
