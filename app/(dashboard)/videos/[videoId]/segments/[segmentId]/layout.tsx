import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import { getSegmentById } from "@/modules/storyboard/repositories/segment.repository";
import type { SeedanceSegment } from "@/modules/storyboard/storyboard.types";
import { RegisterSegmentCrumb } from "@/modules/videos/ui/register-segment-crumb";

function formatSegmentBreadcrumbTitle(segment: SeedanceSegment) {
  return `S${segment.position}. ${segment.title}`;
}

export default async function SegmentDetailLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ videoId: string; segmentId: string }>;
}>) {
  const { segmentId, videoId } = await params;
  const segment = await loadSegmentForCrumb(videoId, segmentId);
  const crumbTitle = segment
    ? formatSegmentBreadcrumbTitle(segment)
    : "Segment";

  return (
    <>
      <RegisterSegmentCrumb title={crumbTitle} />
      {children}
    </>
  );
}

async function loadSegmentForCrumb(videoId: string, segmentId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    const segment = await getSegmentById(supabase, segmentId);
    if (segment?.videoId === videoId) {
      return segment;
    }
  } catch {
    /* best-effort crumb */
  }
  return null;
}
