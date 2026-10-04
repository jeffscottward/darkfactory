import type { ComponentPropsWithRef, JSX, ReactNode } from "react";

import { cn } from "./utilities.ts";

interface PageHeaderBaseProps
  extends Omit<ComponentPropsWithRef<"header">, "title"> {
  actions?: ReactNode;
  title: ReactNode;
}

/** Portal headers carry a title and actions only; descriptions are public-site copy. */
export interface PortalPageHeaderProps extends PageHeaderBaseProps {
  description?: never;
  eyebrow?: never;
  variant?: "portal";
}

export interface PublicPageHeaderProps extends PageHeaderBaseProps {
  description?: ReactNode;
  eyebrow?: ReactNode;
  variant: "public";
}

export type PageHeaderProps = PortalPageHeaderProps | PublicPageHeaderProps;

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
      variant === "public"
        ? "grid gap-4 border-border border-b pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"
        : "flex flex-wrap items-center justify-between gap-2",
      className
    )}
    data-variant={variant}
  >
    <div className={cn("min-w-0", variant === "public" && "space-y-3")}>
      {eyebrow === undefined ? null : (
        <p className="font-body font-semibold text-primary text-xs uppercase tracking-wide">
          {eyebrow}
        </p>
      )}
      <h1
        className={cn(
          "font-heading font-semibold text-foreground tracking-tight",
          variant === "public" ? "text-4xl" : "text-xl"
        )}
      >
        {title}
      </h1>
      {description === undefined ? null : (
        <p className="max-w-reading text-lg text-muted-foreground leading-7">
          {description}
        </p>
      )}
    </div>
    {actions === undefined ? null : (
      <div className="flex flex-wrap items-center gap-2 md:justify-end">
        {actions}
      </div>
    )}
  </header>
);

export type SectionHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface SectionHeaderProps
  extends Omit<ComponentPropsWithRef<"div">, "title"> {
  actions?: ReactNode;
  headingLevel?: SectionHeadingLevel;
  title: ReactNode;
}

export const SectionHeader = ({
  actions,
  className,
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
        "flex flex-wrap items-center justify-between gap-2 border-border border-b pb-2",
        className
      )}
      {...props}
    >
      <Heading className="min-w-0 font-heading font-semibold text-base text-foreground tracking-tight">
        {title}
      </Heading>
      {actions === undefined ? null : (
        <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
      )}
    </div>
  );
};
