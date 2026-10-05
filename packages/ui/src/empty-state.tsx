import type { ComponentPropsWithRef, JSX, ReactNode } from "react";
import { useId } from "react";

import { cn } from "./utilities.ts";

export type EmptyStateHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface EmptyStateProps
  extends Omit<ComponentPropsWithRef<"section">, "title"> {
  title: ReactNode;
  description: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  headingLevel?: EmptyStateHeadingLevel;
}

export const EmptyState = ({
  action,
  className,
  description,
  headingLevel = 2,
  icon,
  title,
  ...props
}: EmptyStateProps) => {
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const Heading = `h${headingLevel}` as keyof Pick<
    JSX.IntrinsicElements,
    "h2" | "h3" | "h4" | "h5" | "h6"
  >;

  return (
    <section
      {...props}
      aria-labelledby={titleId}
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 text-balance rounded-lg border border-dashed p-6 text-center md:p-12",
        className
      )}
      role="region"
    >
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6"
        >
          {icon}
        </span>
      )}
      <div className="flex max-w-sm flex-col items-center gap-2">
        <Heading className="font-medium text-lg tracking-tight" id={titleId}>
          {title}
        </Heading>
        <p className="text-muted-foreground text-sm/relaxed">{description}</p>
      </div>
      {action === undefined ? null : (
        <div className="flex items-center gap-2">{action}</div>
      )}
    </section>
  );
};
