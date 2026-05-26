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
  initialRecipeNumber: number | null;
  className?: string;
}

function recipeNumberToDraft(value: number | null) {
  return value == null ? "" : String(value);
}

export function EditableProjectRecipeNumber({
  videoId,
  initialRecipeNumber,
  className,
}: EditableProjectRecipeNumberProps) {
  const [recipeNumber, setRecipeNumber] = useState(initialRecipeNumber);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(() => recipeNumberToDraft(initialRecipeNumber));
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const [prevInitialRecipeNumber, setPrevInitialRecipeNumber] =
    useState(initialRecipeNumber);

  if (initialRecipeNumber !== prevInitialRecipeNumber) {
    setPrevInitialRecipeNumber(initialRecipeNumber);
    setRecipeNumber(initialRecipeNumber);
    if (!editing) {
      setDraft(recipeNumberToDraft(initialRecipeNumber));
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
    const currentDraft = recipeNumberToDraft(recipeNumber);
    if (trimmed === currentDraft) {
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
          if (!trimmed) {
            setRecipeNumber(null);
            setDraft("");
          } else {
            const parsed = Number(trimmed);
            setRecipeNumber(parsed);
            setDraft(String(parsed));
          }
          setError(null);
          setEditing(false);
        } else {
          setError(result.message);
        }
      })();
    });
  }, [draft, recipeNumber, videoId]);

  const cancel = useCallback(() => {
    setDraft(recipeNumberToDraft(recipeNumber));
    setError(null);
    setEditing(false);
  }, [recipeNumber]);

  function startEditing() {
    setDraft(recipeNumberToDraft(recipeNumber));
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

  const displayLabel =
    recipeNumber == null ? "No #" : formatRecipeNumberLabel(recipeNumber);

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
            aria-label="Recipe number"
            className="h-auto w-[4.5rem] border-transparent bg-transparent px-0 py-0 text-right font-medium tabular-nums text-muted-foreground shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            disabled={isPending}
            inputMode="numeric"
            placeholder="No #"
            value={draft}
            onBlur={() => {
              if (isPending) {
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
                "cursor-text text-right font-medium tabular-nums licorn-page-title",
                recipeNumber == null
                  ? "text-muted-foreground/70"
                  : "text-muted-foreground",
              )}
              title={recipeNumber == null ? "Add a recipe number" : undefined}
              onDoubleClick={startEditing}
            >
              {displayLabel}
            </span>
            <Button
              className="h-8 w-8 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
              size="icon"
              type="button"
              variant="ghost"
              aria-label={
                recipeNumber == null ? "Add recipe number" : "Edit recipe number"
              }
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
