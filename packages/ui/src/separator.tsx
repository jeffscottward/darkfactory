// What: shadcn/ui new-york-v4 Separator (decorative by default, like Radix Separator).
// Used by: packages/ui/src/index.ts; apps/web shells.
// See: https://ui.shadcn.com/docs/components/separator.
import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface SeparatorProps extends ComponentPropsWithRef<"div"> {
  decorative?: boolean;
  orientation?: "horizontal" | "vertical";
}

export const Separator = ({
  className,
  decorative = true,
  orientation = "horizontal",
  ...props
}: SeparatorProps) => (
  <div
    {...(decorative
      ? { role: "none" }
      : { "aria-orientation": orientation, role: "separator" })}
    className={cn(
      "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px",
      className
    )}
    data-orientation={orientation}
    data-slot="separator"
    {...props}
  />
);
