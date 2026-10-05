import type { ComponentPropsWithRef } from "react";

import { cn } from "./utilities.ts";

export interface AvatarProps
  extends Omit<ComponentPropsWithRef<"span">, "children"> {
  name: string;
  fallback: string;
  src?: string;
  imageProps?: Omit<ComponentPropsWithRef<"img">, "src" | "alt">;
}

export const Avatar = ({
  className,
  fallback,
  imageProps,
  name,
  src,
  ...props
}: AvatarProps) => (
  <span
    {...props}
    data-slot="avatar"
    className={cn(
      "relative flex size-8 shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-muted text-muted-foreground text-sm",
      className
    )}
    {...(src === undefined ? { role: "img", "aria-label": name } : {})}
  >
    {src === undefined ? (
      <span aria-hidden="true">{fallback}</span>
    ) : (
      <img
        alt={name}
        className="aspect-square size-full object-cover"
        height={32}
        src={src}
        width={32}
        {...imageProps}
      />
    )}
  </span>
);
