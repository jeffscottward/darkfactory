import { cn } from "@darkfactory/ui";
import type { ComponentPropsWithRef } from "react";

export const BrandMark = ({
  className,
  ...props
}: ComponentPropsWithRef<"svg">) => (
  <svg
    aria-hidden="true"
    className={cn("size-5 shrink-0", className)}
    fill="none"
    viewBox="0 0 32 32"
    xmlns="http://www.w3.org/2000/svg"
    {...props}
  >
    <path
      d="M5 5h10v10H5V5Zm12 0h10v22H17V5ZM5 17h10v10H5V17Z"
      fill="currentColor"
    />
  </svg>
);

export const BrandLink = ({ className }: { readonly className?: string }) => (
  <a
    className={cn(
      "inline-flex min-h-11 items-center gap-2 rounded-md font-semibold text-base text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
      className
    )}
    href="/"
  >
    <BrandMark />
    <span>DarkFactory</span>
  </a>
);
