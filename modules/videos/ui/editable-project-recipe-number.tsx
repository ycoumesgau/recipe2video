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
import { formatRecipeNumberLabel } from "@/modules/videos/recipe-number";
import { updateVideoProjectRecipeNumberAction } from "@/modules/videos/actions";

interface EditableProjectRecipeNumberProps {
  videoId: string;
  initialRecipeNumber: number;
  className?: string;
  /** `page` matches overview title; `compact` fits dashboard cards. */
  variant?: "page" | "compact";
  numberClassName?: string;
}

export function EditableProjectRecipeNumber({
  videoId,
  initialRecipeNumber,
  className,
  variant = "page",
  numberClassName,
}: EditableProjectRecipeNumberProps) {
  const isCompact = variant === "compact";
  const [recipeNumber, setRecipeNumber] = useState(initialRecipeNumber);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(initialRecipeNumber));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevInitialRecipeNumber, setPrevInitialRecipeNumber] =
    useState(initialRecipeNumber);

  if (initialRecipeNumber !== prevInitialRecipeNumber) {
    setPrevInitialRecipeNumber(initialRecipeNumber);
    setRecipeNumber(initialRecipeNumber);
    if (!editing) {
      setDraft(String(initialRecipeNumber));
    }
  }

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = useCallback(() => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Recipe number cannot be empty.");
      return;
    }
    if (trimmed === String(recipeNumber)) {
      setError(null);
      setEditing(false);
      return;
    }

    startTransition(() => {
      void (async () => {
        const result = await updateVideoProjectRecipeNumberAction(
          videoId,
          trimmed,
        );
        if (result.ok) {
          const parsed = Number(trimmed);
          setRecipeNumber(parsed);
          setDraft(String(parsed));
          setError(null);
          setEditing(false);
        } else {
          setError(result.message);
        }
      })();
    });
  }, [draft, recipeNumber, videoId]);

  const cancel = useCallback(() => {
    setDraft(String(recipeNumber));
    setError(null);
    setEditing(false);
  }, [recipeNumber]);

  function startEditing() {
    setDraft(String(recipeNumber));
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
    <div
      className={cn("space-y-1", className)}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
      }}
    >
      <div
        className={cn(
          "group flex items-center gap-1",
          editing ? "items-stretch" : "",
          isCompact ? "gap-0.5" : "gap-2",
        )}
      >
        {editing ? (
          <Input
            ref={inputRef}
            aria-invalid={error ? true : undefined}
            aria-label="Recipe number"
            className={cn(
              "h-auto border-transparent bg-transparent px-0 py-0 font-medium tabular-nums shadow-none focus-visible:ring-0 focus-visible:ring-offset-0",
              isCompact
                ? "w-[2.75rem] text-inherit"
                : "w-[4.5rem] text-right text-muted-foreground",
              numberClassName,
            )}
            disabled={isPending}
            inputMode="numeric"
            value={draft}
            onBlur={() => {
              if (isPending) {
                return;
              }
              const trimmed = draft.trim();
              if (!trimmed) {
                setDraft(String(recipeNumber));
                setError(null);
                setEditing(false);
                return;
              }
              if (trimmed === String(recipeNumber)) {
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
            <span
              className={cn(
                "cursor-text font-medium tabular-nums",
                isCompact
                  ? "text-inherit"
                  : "text-right text-muted-foreground licorn-page-title",
                numberClassName,
              )}
              title={error ?? undefined}
              onDoubleClick={startEditing}
            >
              {formatRecipeNumberLabel(recipeNumber)}
            </span>
            <Button
              className={cn(
                "shrink-0 opacity-0 transition-opacity group-hover:opacity-100",
                isCompact ? "h-6 w-6" : "h-8 w-8",
              )}
              size="icon"
              type="button"
              variant="ghost"
              aria-label="Edit recipe number"
              onClick={startEditing}
            >
              <Pencil className={isCompact ? "h-3 w-3" : "h-4 w-4"} />
            </Button>
          </>
        )}
      </div>
      {error ? (
        <p
          className={cn(
            "text-destructive",
            isCompact ? "max-w-[10rem] text-xs leading-tight" : "text-sm",
          )}
          role="status"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
