import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

/**
 * Boutons alignés sur la DS Pantry / Licorn (Figma node 300:232).
 *
 * Tokens clés lus dans Figma :
 *   - Forme       : border-radius 1000px → rounded-full (pill)
 *   - Bordure     : 2px solid var(--sticker-edge) (#38382e light / blanc en dark)
 *   - Ombre repos : 0 4px 0 0 var(--sticker-edge)   — effet "autocollant"
 *   - Ombre hover : 0 6px 0 0 var(--sticker-edge)   — légère levée
 *   - Ombre press : 0 1px 0 0 var(--sticker-edge)   — bouton enfoncé
 *   - Default bg  : var(--primary) #f43f65, text blanc
 *   - Default hov : var(--primary-hover) #d40c38
 *   - Outline bg  : transparent, text var(--primary)
 *   - Outline hov : var(--outline-hover) #feecf0 / light pink
 */
const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center",
    "rounded-full border-2 border-sticker-edge",
    "bg-clip-padding text-sm font-semibold whitespace-nowrap",
    "transition-all duration-150 outline-none select-none",
    "focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:ring-offset-1",
    "disabled:pointer-events-none disabled:opacity-40",
    "aria-invalid:ring-3 aria-invalid:ring-destructive/30",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ].join(" "),
  {
    variants: {
      variant: {
        /** Primaire coral — fond plein + ombre sticker. */
        default: [
          "bg-primary text-primary-foreground",
          "shadow-[0_4px_0_0_var(--sticker-edge)]",
          "hover:bg-[var(--primary-hover)] hover:shadow-[0_6px_0_0_var(--sticker-edge)]",
          "active:shadow-[0_1px_0_0_var(--sticker-edge)] active:translate-y-[3px]",
        ].join(" "),
        /** Contour — transparent + texte coral + ombre sticker identique. */
        outline: [
          "bg-transparent text-primary border-sticker-edge",
          "shadow-[0_4px_0_0_var(--sticker-edge)]",
          "hover:bg-[var(--outline-hover)] hover:shadow-[0_6px_0_0_var(--sticker-edge)]",
          "dark:hover:bg-[var(--outline-hover)]",
          "active:shadow-[0_1px_0_0_var(--sticker-edge)] active:translate-y-[3px]",
        ].join(" "),
        /** Secondaire crème (light) — en dark : muted pour rester cohérent avec la nav. */
        secondary: [
          "bg-cream text-cream-foreground",
          "shadow-[0_4px_0_0_var(--sticker-edge)]",
          "hover:bg-[oklch(0.92_0.04_82)] hover:shadow-[0_6px_0_0_var(--sticker-edge)]",
          "active:shadow-[0_1px_0_0_var(--sticker-edge)] active:translate-y-[3px]",
          "dark:bg-muted dark:text-foreground dark:hover:bg-muted/85 dark:hover:shadow-[0_6px_0_0_var(--sticker-edge)]",
        ].join(" "),
        /** Ghost — sans bordure ni ombre, survol discret. */
        ghost: [
          "border-transparent shadow-none",
          "hover:bg-muted hover:text-foreground",
          "aria-expanded:bg-muted aria-expanded:text-foreground",
          "dark:hover:bg-muted/50",
        ].join(" "),
        /** Destructif. */
        destructive: [
          "border-destructive/60 bg-destructive/10 text-destructive shadow-none",
          "hover:bg-destructive/20",
          "focus-visible:ring-destructive/30",
          "dark:bg-destructive/20 dark:hover:bg-destructive/30",
        ].join(" "),
        /** Lien texte. */
        link: "border-transparent shadow-none text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 gap-2 px-5",
        sm:      "h-8 gap-1.5 px-4 text-[0.8rem]",
        lg:      "h-12 gap-2 px-6 text-base",
        icon:    "size-10",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8  rounded-full [&_svg:not([class*='size-'])]:size-3.5",
        "icon-lg": "size-12 rounded-full",
        xs:      "h-7 gap-1 px-3 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size:    "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.ComponentProps<"button"> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(function Button(
  { className, variant = "default", size = "default", asChild = false, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      ref={ref}
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
})

Button.displayName = "Button"

export { Button, buttonVariants }
