"use client";

import { X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ReactElement, ReactNode } from "react";
import { createElement } from "react";

import { cn } from "../utilities.ts";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export interface DialogContentProps
  extends Omit<
    ComponentPropsWithRef<typeof DialogPrimitive.Content>,
    "children" | "title"
  > {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  closeLabel?: string;
}

export const DialogContent = ({
  children,
  className,
  closeLabel = "Close dialog",
  description,
  title,
  ...props
}: DialogContentProps) => {
  return createElement(
    DialogPrimitive.Portal,
    null,
    createElement(DialogPrimitive.Overlay, {
      className:
        "fixed inset-0 z-overlay bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
    }),
    createElement(
      DialogPrimitive.Content,
      {
        className: cn(
          "data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-modal grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto rounded-lg border bg-background p-6 shadow-lg outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in sm:max-w-lg",
          className
        ),
        ...props,
      },
      createElement(
        "div",
        {
          className: "flex flex-col gap-2 text-center sm:text-left",
          ...{ "data-slot": "dialog-header" },
        },
        createElement(
          DialogPrimitive.Title,
          {
            className: "text-lg leading-none font-semibold",
            ...{ "data-slot": "dialog-title" },
          },
          title
        ),
        description === undefined
          ? null
          : createElement(
              DialogPrimitive.Description,
              {
                className: "text-sm text-muted-foreground",
                ...{ "data-slot": "dialog-description" },
              },
              description
            )
      ),
      children,
      createElement(
        DialogClose,
        {
          "aria-label": closeLabel,
          // shadcn's 16px close icon at top-4 right-4, centered in a 44px box.
          className:
            "group/close absolute top-1 right-1 inline-flex size-11 items-center justify-center outline-hidden disabled:pointer-events-none",
          ...{ "data-slot": "dialog-close" },
        },
        createElement(
          "span",
          {
            className:
              "inline-flex rounded-xs opacity-70 ring-offset-background transition-opacity group-hover/close:opacity-100 group-focus-visible/close:ring-2 group-focus-visible/close:ring-ring group-focus-visible/close:ring-offset-2 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
          },
          createElement(X, { "aria-hidden": "true" })
        )
      )
    )
  );
};

export const DialogBody = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">): ReactElement<
  ComponentPropsWithRef<"div">
> => {
  return createElement("div", {
    className: cn("text-sm", className),
    ...props,
  });
};

export const DialogFooter = ({
  className,
  ...props
}: ComponentPropsWithRef<"div">): ReactElement<
  ComponentPropsWithRef<"div">
> => {
  return createElement("div", {
    className: cn(
      "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className
    ),
    ...props,
  });
};
