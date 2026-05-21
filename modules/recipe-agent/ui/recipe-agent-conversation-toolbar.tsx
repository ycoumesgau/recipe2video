"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { AgentConversation } from "@/modules/recipe-agent/recipe-agent.types";
import {
  CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL,
  CURSOR_AGENT_MODEL_OPTIONS,
  CURSOR_AGENT_REASONING_OPTIONS,
  DEFAULT_CURSOR_AGENT_MODEL,
  MAX_COMPLEMENTARY_AGENT_INSTRUCTIONS_LENGTH,
} from "@/modules/videos/video.constants";

import {
  createAgentConversationAction,
  deleteAgentConversationAction,
  refreshAssetsManifestAction,
  renameAgentConversationAction,
  switchActiveConversationAction,
  type RecipeAgentActionState,
} from "../actions";
import { useActiveConversationId } from "./use-active-conversation-id";

export function RecipeAgentConversationToolbar({
  videoId,
  conversations,
  serverActiveConversationId,
}: {
  videoId: string;
  conversations: AgentConversation[];
  serverActiveConversationId: string | null;
}) {
  const { activeConversationId, setActiveConversationId } =
    useActiveConversationId(videoId, conversations, serverActiveConversationId);
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );

  async function handleSwitch(conversationId: string) {
    if (conversationId === activeConversationId) {
      return;
    }

    setActiveConversationId(conversationId);
    startTransition(async () => {
      const result = await switchActiveConversationAction(videoId, conversationId);
      setActionMessage(result.message ?? null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[12rem] flex-1 space-y-1">
          <Label htmlFor="recipe-agent-conversation-select">Agent conversation</Label>
          <Select
            disabled={pending || conversations.length === 0}
            onValueChange={handleSwitch}
            value={activeConversationId ?? undefined}
          >
            <SelectTrigger className="w-full" id="recipe-agent-conversation-select">
              <SelectValue placeholder="Select conversation" />
            </SelectTrigger>
            <SelectContent>
              {conversations.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.name}
                  {conversation.isActive ? " (active)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <NewConversationDialog
          onCreated={(conversationId) => {
            setDialogOpen(false);
            setActiveConversationId(conversationId);
            setActionMessage("New agent conversation created and initialization queued.");
            router.refresh();
          }}
          onError={setActionMessage}
          open={dialogOpen}
          setOpen={setDialogOpen}
          videoId={videoId}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button disabled={!activeConversation} size="icon" variant="outline">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={() => {
                setRenameValue(activeConversation?.name ?? "");
                setRenameOpen(true);
              }}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={conversations.length <= 1}
              onSelect={() => {
                if (!activeConversationId) {
                  return;
                }
                startTransition(async () => {
                  const result = await deleteAgentConversationAction(
                    videoId,
                    activeConversationId,
                  );
                  setActionMessage(result.message ?? null);
                });
              }}
            >
              Delete
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!activeConversation?.includeAssetsManifest}
              onSelect={() => {
                if (!activeConversationId) {
                  return;
                }
                startTransition(async () => {
                  const result = await refreshAssetsManifestAction(
                    videoId,
                    activeConversationId,
                  );
                  setActionMessage(result.message ?? null);
                });
              }}
            >
              Refresh assets manifest
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {actionMessage ? (
        <p className="text-xs text-muted-foreground">{actionMessage}</p>
      ) : null}

      <RenameConversationDialog
        conversationId={activeConversationId}
        name={renameValue}
        onNameChange={setRenameValue}
        onOpenChange={setRenameOpen}
        open={renameOpen}
        setActionMessage={setActionMessage}
        videoId={videoId}
      />
    </div>
  );
}

function NewConversationDialog({
  videoId,
  open,
  setOpen,
  onCreated,
  onError,
}: {
  videoId: string;
  open: boolean;
  setOpen: (open: boolean) => void;
  onCreated: (conversationId: string) => void;
  onError: (message: string | null) => void;
}) {
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [model, setModel] = useState(DEFAULT_CURSOR_AGENT_MODEL);
  const [reasoning, setReasoning] = useState<string>("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [includeAssetsManifest, setIncludeAssetsManifest] = useState(true);

  const reasoningOptions = useMemo(() => {
    return (
      CURSOR_AGENT_REASONING_OPTIONS[
        model as keyof typeof CURSOR_AGENT_REASONING_OPTIONS
      ] ?? []
    );
  }, [model]);

  const defaultReasoning =
    CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL[
      model as keyof typeof CURSOR_AGENT_DEFAULT_REASONING_BY_MODEL
    ] ?? reasoningOptions[0]?.value;

  return (
    <Dialog
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setErrorMessage(null);
          onError(null);
        }
      }}
      open={open}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Plus className="mr-2 h-4 w-4" />
          New conversation
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New agent conversation</DialogTitle>
          <DialogDescription>
            Start a fresh Cursor agent with its own model, instructions, and Git
            branch. Existing reference images and generated segment videos stay
            available via the assets manifest.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="conversation-name">Name</Label>
            <Input
              id="conversation-name"
              onChange={(event) => setName(event.target.value)}
              placeholder="Retry with Opus"
              value={name}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Cursor model</Label>
              <Select onValueChange={setModel} value={model}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURSOR_AGENT_MODEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Reasoning</Label>
              {reasoningOptions.length > 0 ? (
                <Select
                  onValueChange={setReasoning}
                  value={reasoning || defaultReasoning || undefined}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {reasoningOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input disabled value="Not configurable" />
              )}
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="custom-instructions">Custom instructions</Label>
            <Textarea
              id="custom-instructions"
              onChange={(event) => setCustomInstructions(event.target.value)}
              placeholder="Leave empty to start without custom instructions from a previous conversation."
              rows={4}
              value={customInstructions}
            />
          </div>

          <label className="flex items-start gap-2 text-sm">
            <input
              checked={includeAssetsManifest}
              className="mt-1"
              onChange={(event) => setIncludeAssetsManifest(event.target.checked)}
              type="checkbox"
            />
            <span>
              Include manifest of already generated reference images and segment
              videos (`available-assets.json`).
            </span>
          </label>
        </div>

        {errorMessage ? (
          <p className="text-sm text-destructive">{errorMessage}</p>
        ) : null}

        <DialogFooter>
          <Button
            disabled={pending || name.trim().length < 2}
            onClick={async () => {
              setPending(true);
              setErrorMessage(null);
              onError(null);

              try {
                const result = await createAgentConversationAction({
                  videoId,
                  name: name.trim(),
                  cursorAgentModel: model,
                  cursorAgentReasoning:
                    reasoningOptions.length > 0
                      ? reasoning || defaultReasoning || null
                      : null,
                  customInstructions: customInstructions.trim() || null,
                  includeAssetsManifest,
                });

                if (result.kind === "success" && result.conversationId) {
                  onCreated(result.conversationId);
                  setName("");
                  setCustomInstructions("");
                  setErrorMessage(null);
                  return;
                }

                const message =
                  result.message ?? "Unable to create agent conversation.";
                setErrorMessage(message);
                onError(message);
              } finally {
                setPending(false);
              }
            }}
            type="button"
          >
            {pending ? "Creating…" : "Create and launch"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RenameConversationDialog({
  videoId,
  conversationId,
  name,
  onNameChange,
  open,
  onOpenChange,
  setActionMessage,
}: {
  videoId: string;
  conversationId: string | null;
  name: string;
  onNameChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  setActionMessage: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename conversation</DialogTitle>
        </DialogHeader>
        <Input onChange={(event) => onNameChange(event.target.value)} value={name} />
        <DialogFooter>
          <Button
            disabled={pending || !conversationId || name.trim().length < 2}
            onClick={() => {
              if (!conversationId) {
                return;
              }
              startTransition(async () => {
                const result = await renameAgentConversationAction(
                  videoId,
                  conversationId,
                  name.trim(),
                );
                setActionMessage(result.message ?? null);
                onOpenChange(false);
              });
            }}
            type="button"
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
