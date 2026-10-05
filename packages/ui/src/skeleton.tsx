import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface SkeletonProps
  extends Omit<ComponentPropsWithRef<"div">, "aria-hidden"> {}

export const Skeleton = ({ className, ...props }: SkeletonProps) => (
  <div
    {...props}
    aria-hidden="true"
    data-slot="skeleton"
    className={cn(
      "animate-pulse rounded-md bg-accent motion-reduce:animate-none",
      className
    )}
  />
);

export interface SkeletonGroupProps
  extends Omit<ComponentPropsWithRef<"div">, "aria-label"> {
  label: string;
}

export const SkeletonGroup = ({
  className,
  label,
  ...props
}: SkeletonGroupProps) => (
  <div
    {...props}
    aria-label={label}
    aria-live="polite"
    className={cn("space-y-3", className)}
    role="status"
  />
);
