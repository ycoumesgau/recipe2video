"use client";

import { cn } from "@/lib/utils";
import { EditableProjectRecipeNumber } from "@/modules/videos/ui/editable-project-recipe-number";
import { ProjectRecipeNumberLabel } from "@/modules/videos/ui/project-recipe-number-label";

export function ProjectTitleWithEditableRecipeNumber({
  videoId,
  recipeNumber,
  title,
  editable,
  titleClassName,
  numberClassName,
  className,
}: {
  videoId: string;
  recipeNumber: number;
  title: string;
  editable: boolean;
  titleClassName?: string;
  numberClassName?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-w-0 max-w-full items-baseline gap-2",
        className,
      )}
    >
      {editable ? (
        <EditableProjectRecipeNumber
          className="shrink-0"
          initialRecipeNumber={recipeNumber}
          numberClassName={numberClassName}
          variant="compact"
          videoId={videoId}
        />
      ) : (
        <ProjectRecipeNumberLabel
          className={numberClassName}
          recipeNumber={recipeNumber}
        />
      )}
      <span className={cn("min-w-0 truncate", titleClassName)}>{title}</span>
    </span>
  );
}
