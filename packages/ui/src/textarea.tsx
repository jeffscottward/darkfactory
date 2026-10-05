// What: shadcn/ui new-york-v4 Textarea (class string verbatim).
// Used by: packages/ui/src/index.ts; apps/web forms.
// See: https://ui.shadcn.com/docs/components/textarea.
import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface TextareaProps extends ComponentPropsWithRef<"textarea"> {
  invalid?: boolean;
}

export const Textarea = ({
  "aria-invalid": ariaInvalid,
  className,
  invalid = false,
  ...props
}: TextareaProps) => (
  <textarea
    {...props}
    aria-invalid={invalid || ariaInvalid || undefined}
    className={cn(
      "field-sizing-content flex min-h-16 w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
      className
    )}
    data-slot="textarea"
  />
);
