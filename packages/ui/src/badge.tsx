// What: shadcn/ui new-york-v4 Badge. "neutral" and "primary" are kept as aliases of "secondary" and "default".
// Used by: packages/ui/src/index.ts; apps/web components.
// See: https://ui.shadcn.com/docs/components/badge; packages/ui/src/status-badge.tsx.
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-full border border-transparent px-2 py-0.5 font-medium text-xs transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        primary: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        neutral:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-destructive-foreground focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends ComponentPropsWithRef<"span">,
    VariantProps<typeof badgeVariants> {}

export const Badge = ({
  className,
  variant = "default",
  ...props
}: BadgeProps) => (
  <span
    className={cn(badgeVariants({ variant }), className)}
    data-slot="badge"
    data-variant={variant}
    {...props}
  />
);
