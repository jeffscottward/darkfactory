import type { ComponentPropsWithRef, ReactNode } from "react";

import { cn } from "./utilities.ts";

export interface StatCardProps
  extends Omit<ComponentPropsWithRef<"dl">, "title"> {
  description?: ReactNode;
  label: ReactNode;
  value: ReactNode;
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
      "flex min-w-0 flex-col gap-1.5 rounded-xl border bg-card px-6 py-6 text-left text-card-foreground shadow-sm",
      className
    )}
    {...props}
  >
    <dt className="text-muted-foreground text-sm">{label}</dt>
    <dd className="font-semibold text-2xl tabular-nums">{value}</dd>
    {description === undefined ? null : (
      <dd className="text-muted-foreground text-sm">{description}</dd>
    )}
  </dl>
);
