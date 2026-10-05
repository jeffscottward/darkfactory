// What: shadcn/ui new-york-v4 Card primitives: Card, CardHeader, CardTitle (a heading element), CardDescription, CardAction, CardContent, CardFooter.
// Used by: packages/ui/src/index.ts; apps/operator/src/components/operator/*, apps/web components.
// See: packages/ui/src/stat-card.tsx.
import type { ComponentPropsWithRef, JSX } from "react";

import { cn } from "./utilities.ts";

export const Card = ({ className, ...props }: ComponentPropsWithRef<"div">) => (
  <div
    className={cn(
      "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm",
      className
    )}
    data-slot="card"
    {...props}
  />
);

export const CardHeader = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    className={cn(
      "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
      className
    )}
    data-slot="card-header"
    {...props}
  />
);

export type CardHeadingLevel = 2 | 3 | 4 | 5 | 6;

export interface CardTitleProps extends ComponentPropsWithRef<"h3"> {
  headingLevel?: CardHeadingLevel;
}

export const CardTitle = ({
  className,
  headingLevel = 3,
  ...props
}: CardTitleProps) => {
  const Heading = `h${headingLevel}` as keyof Pick<
    JSX.IntrinsicElements,
    "h2" | "h3" | "h4" | "h5" | "h6"
  >;

  return (
    <Heading
      className={cn("font-semibold leading-none", className)}
      data-slot="card-title"
      {...props}
    />
  );
};

export const CardDescription = ({
  className,
  ...props
}: ComponentPropsWithRef<"p">) => (
  <p
    className={cn("text-muted-foreground text-sm", className)}
    data-slot="card-description"
    {...props}
  />
);

export const CardContent = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div className={cn("px-6", className)} data-slot="card-content" {...props} />
);

export const CardFooter = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
    data-slot="card-footer"
    {...props}
  />
);

export const CardAction = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">) => (
  <div
    className={cn(
      "col-start-2 row-span-2 row-start-1 self-start justify-self-end",
      className
    )}
    data-slot="card-action"
    {...props}
  />
);
