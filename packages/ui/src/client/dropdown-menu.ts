"use client";

import { Check, ChevronRight, Circle } from "lucide-react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import type { ComponentPropsWithRef, ReactNode } from "react";
import { cloneElement, createElement, isValidElement } from "react";

import { cn } from "../utilities.ts";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;
export const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;
export const DropdownMenuSub = DropdownMenuPrimitive.Sub;

export const DropdownMenuContent = ({
  className,
  sideOffset = 4,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Content>) => {
  return createElement(
    DropdownMenuPrimitive.Portal,
    null,
    createElement(DropdownMenuPrimitive.Content, {
      className: cn(
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-popover max-h-(--radix-dropdown-menu-content-available-height) min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      ),
      sideOffset,
      ...props,
    })
  );
};

/**
 * Menu rows keep shadcn's 32px visible row (the chrome span) inside a 44px
 * box (touch-target gate). The -my-1.5 margin gives the extra height back,
 * so the menu is as tall as shadcn's. State styles follow the box (group/item).
 */
const ITEM_BOX =
  "group/item relative -my-1.5 flex min-h-11 min-w-11 cursor-default items-center outline-hidden select-none data-[disabled]:pointer-events-none";

const ITEM_CHROME =
  "relative flex min-w-0 flex-1 items-center gap-2 rounded-sm px-2 py-1.5 text-sm group-focus/item:bg-accent group-focus/item:text-accent-foreground group-data-[disabled]/item:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

export const DropdownMenuItem = ({
  asChild = false,
  children,
  className,
  inset = false,
  variant = "default",
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Item> & {
  inset?: boolean;
  variant?: "default" | "destructive";
}) => {
  const chrome = (inner: ReactNode) =>
    createElement(
      "span",
      {
        className: cn(
          ITEM_CHROME,
          "group-data-[inset]/item:pl-8 group-data-[variant=destructive]/item:text-destructive group-data-[variant=destructive]/item:group-focus/item:bg-destructive/10 group-data-[variant=destructive]/item:group-focus/item:text-destructive dark:group-data-[variant=destructive]/item:group-focus/item:bg-destructive/20 [&_svg:not([class*='text-'])]:text-muted-foreground group-data-[variant=destructive]/item:*:[svg]:text-destructive!"
        ),
        ...{ "data-slot": "dropdown-menu-item-chrome" },
      },
      inner
    );
  // asChild: the child (for example a link) becomes the 44px box, and its own
  // content goes inside the chrome span, so the menuitem keeps the child's semantics.
  const content =
    asChild && isValidElement<{ children?: ReactNode }>(children)
      ? cloneElement(children, undefined, chrome(children.props.children))
      : chrome(children);
  return createElement(
    DropdownMenuPrimitive.Item,
    {
      asChild,
      className: cn(ITEM_BOX, className),
      ...{ "data-inset": inset || undefined },
      ...{ "data-slot": "dropdown-menu-item" },
      ...{ "data-variant": variant },
      ...props,
    },
    content
  );
};

export const DropdownMenuCheckboxItem = ({
  children,
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.CheckboxItem>) => {
  return createElement(
    DropdownMenuPrimitive.CheckboxItem,
    {
      className: cn(ITEM_BOX, className),
      ...{ "data-slot": "dropdown-menu-checkbox-item" },
      ...props,
    },
    createElement(
      "span",
      { className: cn(ITEM_CHROME, "pr-2 pl-8") },
      createElement(
        "span",
        {
          className:
            "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center",
        },
        createElement(
          DropdownMenuPrimitive.ItemIndicator,
          null,
          createElement(Check, { "aria-hidden": "true", className: "size-4" })
        )
      ),
      children
    )
  );
};

export const DropdownMenuRadioItem = ({
  children,
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.RadioItem>) => {
  return createElement(
    DropdownMenuPrimitive.RadioItem,
    {
      className: cn(ITEM_BOX, className),
      ...{ "data-slot": "dropdown-menu-radio-item" },
      ...props,
    },
    createElement(
      "span",
      { className: cn(ITEM_CHROME, "pr-2 pl-8") },
      createElement(
        "span",
        {
          className:
            "pointer-events-none absolute left-2 flex size-3.5 items-center justify-center",
        },
        createElement(
          DropdownMenuPrimitive.ItemIndicator,
          null,
          createElement(Circle, {
            "aria-hidden": "true",
            className: "size-2 fill-current",
          })
        )
      ),
      children
    )
  );
};

export const DropdownMenuLabel = ({
  className,
  inset = false,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Label> & {
  inset?: boolean;
}) => {
  return createElement(DropdownMenuPrimitive.Label, {
    className: cn(
      "px-2 py-1.5 font-medium text-sm",
      inset && "pl-8",
      className
    ),
    ...props,
  });
};

export const DropdownMenuShortcut = ({
  className,
  ...props
}: ComponentPropsWithRef<"span">) => {
  return createElement("span", {
    className: cn(
      "ml-auto text-muted-foreground text-xs tracking-widest",
      className
    ),
    ...{ "data-slot": "dropdown-menu-shortcut" },
    ...props,
  });
};

export const DropdownMenuSeparator = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.Separator>) => {
  return createElement(DropdownMenuPrimitive.Separator, {
    className: cn("-mx-1 my-1 h-px bg-border", className),
    ...{ "data-slot": "dropdown-menu-separator" },
    ...props,
  });
};

export const DropdownMenuSubTrigger = ({
  children,
  className,
  inset = false,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubTrigger> & {
  inset?: boolean;
}) => {
  return createElement(
    DropdownMenuPrimitive.SubTrigger,
    {
      className: cn(ITEM_BOX, className),
      ...{ "data-inset": inset || undefined },
      ...{ "data-slot": "dropdown-menu-sub-trigger" },
      ...props,
      // aria-controls is optional on submenu triggers; axe cannot verify it next to aria-haspopup.
      "aria-controls": undefined,
    },
    createElement(
      "span",
      {
        className: cn(
          ITEM_CHROME,
          "group-data-[state=open]/item:bg-accent group-data-[inset]/item:pl-8 group-data-[state=open]/item:text-accent-foreground [&_svg:not([class*='text-'])]:text-muted-foreground"
        ),
      },
      children,
      createElement(ChevronRight, {
        "aria-hidden": "true",
        className: "ml-auto size-4",
      })
    )
  );
};

export const DropdownMenuSubContent = ({
  className,
  ...props
}: ComponentPropsWithRef<typeof DropdownMenuPrimitive.SubContent>) => {
  return createElement(
    DropdownMenuPrimitive.Portal,
    null,
    createElement(DropdownMenuPrimitive.SubContent, {
      className: cn(
        "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 z-popover min-w-[8rem] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in",
        className
      ),
      ...props,
    })
  );
};
