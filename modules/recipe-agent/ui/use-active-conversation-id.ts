"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

function storageKey(videoId: string) {
  return `recipe-agent:active-conversation:${videoId}`;
}

export function useActiveConversationId(
  videoId: string,
  conversations: Array<{ id: string; isActive?: boolean }>,
  serverActiveConversationId: string | null,
) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const conversationIds = useMemo(
    () => new Set(conversations.map((conversation) => conversation.id)),
    [conversations],
  );

  const resolvedFromServer = useMemo(() => {
    if (
      serverActiveConversationId &&
      conversationIds.has(serverActiveConversationId)
    ) {
      return serverActiveConversationId;
    }

    const active = conversations.find((conversation) => conversation.isActive);
    return active?.id ?? conversations[0]?.id ?? null;
  }, [conversationIds, conversations, serverActiveConversationId]);

  const queryConversationId = searchParams.get("conversation");
  const queryConversationValid =
    queryConversationId && conversationIds.has(queryConversationId)
      ? queryConversationId
      : null;

  const activeConversationId = queryConversationValid ?? resolvedFromServer;

  const setActiveConversationId = useCallback(
    (conversationId: string) => {
      if (!conversationIds.has(conversationId)) {
        return;
      }

      try {
        localStorage.setItem(storageKey(videoId), conversationId);
      } catch {
        // ignore quota / private mode
      }

      const params = new URLSearchParams(searchParams.toString());
      params.set("conversation", conversationId);
      router.replace(`${pathname}?${params.toString()}`);
    },
    [conversationIds, pathname, router, searchParams, videoId],
  );

  return { activeConversationId, setActiveConversationId };
}
