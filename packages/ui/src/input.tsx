// What: shadcn/ui new-york-v4 Input. The only change from shadcn is min-h-11: a text field cannot draw a smaller chrome inside a 44px box, so it is 44px tall (touch-target gate).
// Used by: packages/ui/src/index.ts; apps/web forms.
// See: https://ui.shadcn.com/docs/components/input; design-system/darkfactory/MASTER.md ("Touch targets").
import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface InputProps extends ComponentPropsWithRef<"input"> {
  invalid?: boolean;
}

export const Input = ({
  "aria-invalid": ariaInvalid,
  className,
  invalid = false,
  type,
  ...props
}: InputProps) => (
  <input
    {...props}
    aria-invalid={invalid || ariaInvalid || undefined}
    className={cn(
      "h-9 min-h-11 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
      "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
      "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
      className
    )}
    data-slot="input"
    type={type}
  />
);
