// What: shadcn/ui new-york-v4 Tabs (default and line variants). Each trigger keeps shadcn's visible chrome inside a 44px box (touch-target gate).
// Used by: apps/web settings and account pages.
// See: https://ui.shadcn.com/docs/components/tabs; design-system/darkfactory/MASTER.md ("Touch targets").
"use client";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentPropsWithRef } from "react";
import { createElement } from "react";

import { cn } from "../utilities.ts";

export const Tabs = ({
  className,
  orientation = "horizontal",
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Root>) =>
  createElement(TabsPrimitive.Root, {
    className: cn(
      "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
      className
    ),
    ...{ "data-orientation": orientation },
    ...{ "data-slot": "tabs" },
    orientation,
    ...props,
  });

export const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit items-center justify-center rounded-lg p-[3px] text-muted-foreground data-[variant=line]:rounded-none group-data-[orientation=horizontal]/tabs:h-9 group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col",
  {
    variants: {
      variant: {
        default: "bg-muted",
        line: "gap-1 bg-transparent",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export const TabsList = ({
  className,
  variant = "default",
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) =>
  createElement(TabsPrimitive.List, {
    className: cn(tabsListVariants({ variant }), className),
    ...{ "data-slot": "tabs-list" },
    ...{ "data-variant": variant },
    ...props,
  });

/** 44px box. Horizontal: the chrome is the list height minus 7px (shadcn's calc(100%-1px)); margins give the rest back. */
const TRIGGER_BOX =
  "group/trigger relative inline-flex min-h-11 min-w-11 flex-1 items-center justify-center outline-none group-data-[orientation=horizontal]/tabs:-my-[calc((2.75rem-(--spacing(9)-7px))/2)] group-data-[orientation=vertical]/tabs:-my-1 group-data-[orientation=vertical]/tabs:w-full disabled:pointer-events-none";

const TRIGGER_CHROME = [
  "relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-md border border-transparent px-2 py-1 text-sm font-medium whitespace-nowrap text-foreground/60 transition-all group-data-[orientation=horizontal]/tabs:h-[calc(--spacing(9)-7px)] group-data-[orientation=vertical]/tabs:h-9 group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start group-hover/trigger:text-foreground group-focus-visible/trigger:border-ring group-focus-visible/trigger:ring-[3px] group-focus-visible/trigger:ring-ring/50 group-focus-visible/trigger:outline-1 group-focus-visible/trigger:outline-ring group-disabled/trigger:opacity-50 group-data-[variant=default]/tabs-list:group-data-[state=active]/trigger:shadow-sm group-data-[variant=line]/tabs-list:group-data-[state=active]/trigger:shadow-none dark:text-muted-foreground dark:group-hover/trigger:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  "group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:group-data-[state=active]/trigger:bg-transparent dark:group-data-[variant=line]/tabs-list:group-data-[state=active]/trigger:border-transparent dark:group-data-[variant=line]/tabs-list:group-data-[state=active]/trigger:bg-transparent",
  "group-data-[state=active]/trigger:bg-background group-data-[state=active]/trigger:text-foreground dark:group-data-[state=active]/trigger:border-input dark:group-data-[state=active]/trigger:bg-input/30 dark:group-data-[state=active]/trigger:text-foreground",
  "after:absolute after:bg-foreground after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:bottom-[-5px] group-data-[orientation=horizontal]/tabs:after:h-0.5 group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-right-1 group-data-[orientation=vertical]/tabs:after:w-0.5 group-data-[variant=line]/tabs-list:group-data-[state=active]/trigger:after:opacity-100",
].join(" ");

export const TabsTrigger = ({
  children,
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Trigger>) =>
  createElement(
    TabsPrimitive.Trigger,
    {
      className: cn(TRIGGER_BOX, className),
      ...{ "data-slot": "tabs-trigger" },
      ...props,
    },
    createElement(
      "span",
      { className: TRIGGER_CHROME, "data-slot": "tabs-trigger-chrome" },
      children
    )
  );

export const TabsContent = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof TabsPrimitive.Content>) =>
  createElement(TabsPrimitive.Content, {
    className: cn("flex-1 outline-none", className),
    ...{ "data-slot": "tabs-content" },
    ...props,
  });
