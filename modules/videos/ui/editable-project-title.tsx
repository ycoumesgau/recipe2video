"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type KeyboardEvent,
} from "react";
import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { updateVideoProjectTitleAction } from "@/modules/videos/actions";

interface EditableProjectTitleProps {
  videoId: string;
  initialTitle: string;
  className?: string;
}

export function EditableProjectTitle({
  videoId,
  initialTitle,
  className,
}: EditableProjectTitleProps) {
  const [title, setTitle] = useState(initialTitle);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initialTitle);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTitle(initialTitle);
    if (!editing) {
      setDraft(initialTitle);
    }
  }, [initialTitle, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const next = draft.trim();
    if (!next) {
      setError("Title cannot be empty.");
      return;
    }
    if (next === title) {
      setError(null);
      setEditing(false);
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await updateVideoProjectTitleAction(videoId, next);
        if (result.ok) {
          setTitle(next);
          setDraft(next);
          setError(null);
          setEditing(false);
        } else {
          setError(result.message);
        }
      })();
    });
  }, [draft, title, videoId]);

  const cancel = useCallback(() => {
    setDraft(title);
    setError(null);
    setEditing(false);
  }, [title]);

  function startEditing() {
    setDraft(title);
    setError(null);
    setEditing(true);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div
        className={cn(
          "group flex items-center gap-2",
          editing ? "items-stretch" : "",
        )}
      >
        {editing ? (
          <Input
            ref={inputRef}
            aria-invalid={error ? true : undefined}
            className="h-auto border-transparent bg-transparent px-0 py-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 md:text-3xl"
            disabled={isPending}
            value={draft}
            onBlur={() => {
              if (isPending) {
                return;
              }
              const next = draft.trim();
              if (!next) {
                setDraft(title);
                setError(null);
                setEditing(false);
                return;
              }
              if (next === title) {
                setEditing(false);
                setError(null);
                return;
              }
              commit();
            }}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
          />
        ) : (
          <>
            <h2
              className="cursor-text text-3xl font-semibold tracking-tight"
              onDoubleClick={startEditing}
            >
              {title}
            </h2>
            <Button
              className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              type="button"
              variant="ghost"
              aria-label="Edit project title"
              onClick={startEditing}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="status">
          {error}
        </p>
      ) : null}
    </div>
  );
}
