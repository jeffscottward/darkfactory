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
        "mx-auto flex max-w-reading flex-col items-start gap-2 border-border border-y py-4 text-left",
        className
      )}
      role="region"
    >
      {icon === undefined ? null : (
        <span
          aria-hidden="true"
          className="text-muted-foreground [&_svg]:size-6"
        >
          {icon}
        </span>
      )}
      <div className="space-y-1">
        <Heading
          className="font-heading font-semibold text-2xl text-foreground tracking-tight"
          id={titleId}
        >
          {title}
        </Heading>
        <p className="max-w-reading text-base text-muted-foreground leading-6">
          {description}
        </p>
      </div>
      {action === undefined ? null : <div className="pt-1">{action}</div>}
    </section>
  );
};
