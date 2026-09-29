import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  invalid?: boolean;
}

export const Textarea = ({
  "aria-invalid": ariaInvalid,
  className,
  invalid = false,
  rows = 4,
  ...props
}: TextareaProps) => (
  <textarea
    {...props}
    aria-invalid={invalid || ariaInvalid || undefined}
    className={cn(
      "min-h-28 w-full resize-y rounded-sm border border-border-strong bg-surface px-3 py-2 font-body text-base text-foreground leading-6 shadow-inner transition-colors duration-base ease-out placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100 disabled:placeholder:text-disabled-foreground aria-invalid:border-destructive aria-invalid:ring-destructive",
      className
    )}
    rows={rows}
  />
);
