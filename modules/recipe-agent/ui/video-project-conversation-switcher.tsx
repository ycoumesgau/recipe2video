"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentConversation } from "@/modules/recipe-agent/recipe-agent.types";
import { switchActiveConversationAction } from "@/modules/recipe-agent/actions";

import { useActiveConversationId } from "./use-active-conversation-id";

export function VideoProjectConversationSwitcher({
  conversations,
  serverActiveConversationId,
  videoId,
}: {
  conversations: AgentConversation[];
  serverActiveConversationId: string | null;
  videoId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { activeConversationId, setActiveConversationId } =
    useActiveConversationId(videoId, conversations, serverActiveConversationId);

  if (conversations.length === 0) {
    return null;
  }

  function handleSwitch(conversationId: string) {
    if (conversationId === activeConversationId) {
      return;
    }

    setActiveConversationId(conversationId);
    startTransition(async () => {
      await switchActiveConversationAction(videoId, conversationId);
      router.refresh();
    });
  }

  return (
    <div className="flex w-full shrink-0 flex-col gap-1 sm:w-auto sm:min-w-[14rem]">
      <Label className="text-xs text-muted-foreground" htmlFor="video-conversation-select">
        Agent conversation
      </Label>
      <Select
        disabled={pending}
        onValueChange={handleSwitch}
        value={activeConversationId ?? undefined}
      >
        <SelectTrigger className="w-full sm:w-[min(100%,18rem)]" id="video-conversation-select">
          <SelectValue placeholder="Select conversation" />
        </SelectTrigger>
        <SelectContent position="popper">
          {conversations.map((conversation) => (
            <SelectItem key={conversation.id} value={conversation.id}>
              {conversation.name}
              {conversation.isActive ? " (active)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
