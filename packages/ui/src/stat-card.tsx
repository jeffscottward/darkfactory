import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "./utilities.ts";

export interface StatCardProps
  extends Omit<ComponentPropsWithRef<"dl">, "title"> {
  label: ReactNode;
  value: ReactNode;
  description?: ReactNode;
}

export const StatCard = ({
  className,
  description,
  label,
  value,
  ...props
}: StatCardProps) => (
  <dl
    className={cn(
      "grid min-w-0 gap-2 border-primary border-l-2 pl-4 text-left",
      className
    )}
    {...props}
  >
    <dt className="font-body font-medium text-muted-foreground text-sm">
      {label}
    </dt>
    <dd className="font-heading font-semibold text-2xl text-foreground tracking-tight">
      {value}
    </dd>
    {description === undefined ? null : (
      <dd className="font-body text-muted-foreground text-xs leading-4">
        {description}
      </dd>
    )}
  </dl>
);
