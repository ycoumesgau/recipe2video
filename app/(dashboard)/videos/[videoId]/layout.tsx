import { Suspense } from "react";

import { createSupabaseAdminClient } from "@/modules/auth/supabase/admin";
import {
  getActiveAgentConversationByVideoId,
  listAgentConversationsByVideoId,
} from "@/modules/recipe-agent/repositories/agent-conversations.repository";
import { VideoProjectConversationSwitcher } from "@/modules/recipe-agent/ui/video-project-conversation-switcher";
import { ensureActiveAgentConversation } from "@/modules/recipe-agent/use-cases/ensure-agent-conversation";
import { getVideoProjectById } from "@/modules/videos/repositories/video.repository";
import { VideoProjectLayoutShell } from "@/modules/videos/ui/video-project-layout-shell";

export default async function VideoProjectLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ videoId: string }>;
}>) {
  const { videoId } = await params;
  const [projectTitle, conversationSwitcherProps] = await Promise.all([
    loadProjectTitleForBreadcrumb(videoId),
    loadConversationSwitcherProps(videoId),
  ]);

  return (
    <VideoProjectLayoutShell
      headerAside={
        <Suspense fallback={null}>
          <VideoProjectConversationSwitcher
            conversations={conversationSwitcherProps.conversations}
            serverActiveConversationId={
              conversationSwitcherProps.serverActiveConversationId
            }
            videoId={videoId}
          />
        </Suspense>
      }
      projectTitle={projectTitle}
      videoId={videoId}
    >
      {children}
    </VideoProjectLayoutShell>
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

async function loadConversationSwitcherProps(videoId: string) {
  try {
    const supabase = createSupabaseAdminClient();
    let conversations = await listAgentConversationsByVideoId(supabase, videoId);
    if (conversations.length === 0) {
      await ensureActiveAgentConversation(supabase, videoId);
      conversations = await listAgentConversationsByVideoId(supabase, videoId);
    }
    const serverActive =
      (await getActiveAgentConversationByVideoId(supabase, videoId)) ??
      conversations.find((conversation) => conversation.isActive) ??
      conversations[0] ??
      null;

    return {
      conversations,
      serverActiveConversationId: serverActive?.id ?? null,
    };
  } catch {
    return { conversations: [], serverActiveConversationId: null };
  }
}
