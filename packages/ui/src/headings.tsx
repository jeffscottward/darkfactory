import type { ComponentPropsWithRef, JSX, ReactNode } from "react";

import { cn } from "./utilities.ts";

export interface PageHeaderProps
  extends Omit<ComponentPropsWithRef<"header">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  variant?: "portal" | "public";
}

export const PageHeader = ({
  actions,
  className,
  description,
  eyebrow,
  title,
  variant = "portal",
  ...props
}: PageHeaderProps) => (
  <header
    {...props}
    className={cn(
      "grid gap-6 border-border border-b md:grid-cols-[minmax(0,1fr)_auto] md:items-end",
      variant === "public" ? "pb-10" : "pb-6",
      className
    )}
    data-variant={variant}
  >
    <div className="min-w-0 space-y-3">
      {eyebrow === undefined ? null : (
        <p className="font-body font-semibold text-primary text-xs uppercase tracking-wide">
          {eyebrow}
        </p>
      )}
      <h1
        className={cn(
          "font-heading font-semibold text-foreground tracking-tight",
          variant === "public" ? "text-4xl" : "text-2xl"
        )}
      >
        {title}
      </h1>
      {description === undefined ? null : (
        <p
          className={cn(
            "max-w-reading text-muted-foreground",
            variant === "public" ? "text-lg leading-7" : "text-base leading-6"
          )}
        >
          {description}
        </p>
      )}
    </div>
    {actions === undefined ? null : (
      <div className="flex flex-wrap items-center gap-3 md:justify-end">
        {actions}
      </div>
    )}
  </header>
);

export type SectionHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface SectionHeaderProps
  extends Omit<ComponentPropsWithRef<"div">, "title"> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  headingLevel?: SectionHeadingLevel;
}

export const SectionHeader = ({
  actions,
  className,
  description,
  headingLevel = 2,
  title,
  ...props
}: SectionHeaderProps) => {
  const Heading = `h${headingLevel}` as keyof Pick<
    JSX.IntrinsicElements,
    "h2" | "h3" | "h4" | "h5" | "h6"
  >;

  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-border border-b pb-4 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        <Heading className="font-heading font-semibold text-foreground text-xl tracking-tight">
          {title}
        </Heading>
        {description === undefined ? null : (
          <p className="max-w-reading text-muted-foreground text-sm leading-5">
            {description}
          </p>
        )}
      </div>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap gap-3">{actions}</div>
      )}
    </div>
  );
};
