"use client";

import { createElement } from "react";
import type { ToastClassnames, ToasterProps } from "sonner";
import { Toaster as SonnerToaster } from "sonner";

import { cn } from "../utilities.ts";

export { toast } from "sonner";

const defaultToastClassNames: ToastClassnames = {
  toast:
    "relative flex w-full items-start gap-3 rounded-md border bg-popover p-4 text-popover-foreground shadow-lg",
  content: "min-w-0 flex-1 space-y-1",
  title: "text-sm font-semibold",
  description: "text-sm text-muted-foreground",
  icon: "mt-0.5 shrink-0 text-foreground",
  loader: "text-primary",
  default: "bg-popover text-popover-foreground",
  success: "border-success-border bg-success-subtle text-success-foreground",
  error: "border-destructive-border bg-destructive-subtle text-destructive",
  info: "border-info-border bg-info-subtle text-info-foreground",
  warning: "border-warning-border bg-warning-subtle text-warning-foreground",
  loading:
    "border-primary-border bg-primary-subtle text-primary-subtle-foreground",
  actionButton:
    "min-h-11 min-w-11 rounded-md border border-transparent bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  cancelButton:
    "min-h-11 min-w-11 rounded-md border bg-background px-3 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
  closeButton:
    "size-11 rounded-md border bg-popover text-popover-foreground hover:bg-accent outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
};

const mergeToastClassNames = (
  classNames: ToastClassnames | undefined
): ToastClassnames => ({
  toast: cn(defaultToastClassNames.toast, classNames?.toast),
  content: cn(defaultToastClassNames.content, classNames?.content),
  title: cn(defaultToastClassNames.title, classNames?.title),
  description: cn(defaultToastClassNames.description, classNames?.description),
  icon: cn(defaultToastClassNames.icon, classNames?.icon),
  default: cn(defaultToastClassNames.default, classNames?.default),
  success: cn(defaultToastClassNames.success, classNames?.success),
  error: cn(defaultToastClassNames.error, classNames?.error),
  info: cn(defaultToastClassNames.info, classNames?.info),
  warning: cn(defaultToastClassNames.warning, classNames?.warning),
  loading: cn(defaultToastClassNames.loading, classNames?.loading),
  actionButton: cn(
    defaultToastClassNames.actionButton,
    classNames?.actionButton
  ),
  cancelButton: cn(
    defaultToastClassNames.cancelButton,
    classNames?.cancelButton
  ),
  closeButton: cn(defaultToastClassNames.closeButton, classNames?.closeButton),
  loader: cn(defaultToastClassNames.loader, classNames?.loader),
});

export interface DarkFactoryToasterProps
  extends Omit<ToasterProps, "richColors"> {}

export const Toaster = ({
  closeButton = true,
  containerAriaLabel = "Notifications",
  position = "bottom-right",
  theme = "system",
  toastOptions,
  ...props
}: DarkFactoryToasterProps) => {
  const { classNames: callerClassNames, ...callerToastOptions } =
    toastOptions ?? {};

  return createElement(SonnerToaster, {
    ...props,
    closeButton,
    containerAriaLabel,
    position,
    richColors: false,
    theme,
    toastOptions: {
      ...callerToastOptions,
      unstyled: true,
      classNames: mergeToastClassNames(callerClassNames),
    },
  });
};
