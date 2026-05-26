import { cn } from "@/lib/utils";
import { formatRecipeNumberLabel } from "@/modules/videos/recipe-number";

export function ProjectRecipeNumberLabel({
  recipeNumber,
  className,
}: {
  recipeNumber: number | null;
  className?: string;
}) {
  if (recipeNumber == null) {
    return null;
  }
  return (
    <span
      className={cn(
        "shrink-0 font-medium tabular-nums text-muted-foreground",
        className,
      )}
      aria-label={`Recipe number ${recipeNumber}`}
    >
      {formatRecipeNumberLabel(recipeNumber)}
    </span>
  );
}

export function ProjectTitleWithRecipeNumber({
  recipeNumber,
  title,
  titleClassName,
  numberClassName,
  className,
}: {
  recipeNumber: number | null;
  title: string;
  titleClassName?: string;
  numberClassName?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-baseline gap-2", className)}>
      <ProjectRecipeNumberLabel
        className={numberClassName}
        recipeNumber={recipeNumber}
      />
      <span className={cn("min-w-0 truncate", titleClassName)}>{title}</span>
    </span>
  );
}
