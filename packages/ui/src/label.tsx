// What: shadcn/ui new-york-v4 Label (native <label>, same classes), with an optional "Optional" hint.
// Used by: packages/ui/src/index.ts; apps/web forms.
// See: https://ui.shadcn.com/docs/components/label.
import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "./utilities.ts";

export interface LabelProps extends ComponentPropsWithRef<"label"> {
  optional?: boolean;
  optionalLabel?: ReactNode;
}

export const Label = ({
  children,
  className,
  optional = false,
  optionalLabel = "Optional",
  ...props
}: LabelProps) => (
  // biome-ignore lint/a11y/noLabelWithoutControl: callers associate the control through the forwarded htmlFor prop.
  <label
    className={cn(
      "flex select-none items-center gap-2 font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-50 group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
      className
    )}
    data-slot="label"
    {...props}
  >
    {children}
    {optional ? (
      <span className="ml-auto font-normal text-muted-foreground">
        {optionalLabel}
      </span>
    ) : null}
  </label>
);
