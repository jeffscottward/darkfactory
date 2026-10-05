import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export const statusBadgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-2 py-0.5 font-medium text-xs before:size-1.5 before:rounded-full before:bg-current",
  {
    variants: {
      status: {
        neutral: "border-border text-foreground",
        success:
          "border-success-border bg-success-subtle text-success-foreground",
        warning:
          "border-warning-border bg-warning-subtle text-warning-foreground",
        info: "border-info-border bg-info-subtle text-info-foreground",
        destructive:
          "border-destructive-border bg-destructive-subtle text-destructive",
      },
    },
    defaultVariants: { status: "neutral" },
  }
);

export interface StatusBadgeProps
  extends ComponentPropsWithRef<"span">,
    VariantProps<typeof statusBadgeVariants> {
  status: NonNullable<VariantProps<typeof statusBadgeVariants>["status"]>;
}

export const StatusBadge = ({
  children,
  className,
  status,
  ...props
}: StatusBadgeProps) => (
  <span
    className={cn(statusBadgeVariants({ status }), className)}
    data-slot="badge"
    data-status={status}
    {...props}
  >
    <span className="sr-only">Status:</span>
    <span>{children}</span>
  </span>
);
