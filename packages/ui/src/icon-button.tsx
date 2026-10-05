// What: Icon-only shadcn Button (size "icon", 36px chrome in a 44px box) with a required accessible name.
// Used by: packages/ui/src/index.ts; apps/web and apps/operator components.
// See: packages/ui/src/button.tsx.
import type { ComponentPropsWithRef } from "react";

import { Button, type ButtonSize, type ButtonVariant } from "./button.tsx";

const ICON_VARIANT = {
  destructive: "ghost",
  ghost: "ghost",
  outline: "outline",
  primary: "default",
  secondary: "outline",
} as const satisfies Record<string, ButtonVariant>;

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "aria-label"> {
  "aria-label": string;
  loading?: boolean;
  loadingLabel?: string;
  size?: Extract<ButtonSize, "icon" | "icon-sm" | "icon-lg">;
  variant?: keyof typeof ICON_VARIANT;
}

export const IconButton = ({
  "aria-label": ariaLabel,
  className,
  loading = false,
  loadingLabel,
  size = "icon",
  variant = "ghost",
  ...props
}: IconButtonProps) => (
  <Button
    {...props}
    aria-label={loading ? (loadingLabel ?? `Loading: ${ariaLabel}`) : ariaLabel}
    className={
      variant === "destructive"
        ? `text-destructive ${className ?? ""}`.trim()
        : className
    }
    loading={loading}
    loadingLabel={loadingLabel ?? `Loading: ${ariaLabel}`}
    size={size}
    variant={ICON_VARIANT[variant]}
  />
);
