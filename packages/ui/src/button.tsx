// What: shadcn/ui new-york-v4 Button. The visible chrome uses shadcn's exact sizes; the element box is at least 44x44 (touch-target gate).
// Used by: packages/ui/src/index.ts; apps/web and apps/operator components.
// See: https://ui.shadcn.com/docs/components/button; packages/ui/src/icon-button.tsx; design-system/darkfactory/MASTER.md ("Touch targets").
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import {
  type ComponentPropsWithRef,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

import { cn } from "./utilities.ts";

/**
 * shadcn buttonVariants, verbatim, plus `min-h-11 min-w-11`. Use it only on a
 * single element (for example a link); the visible height is then 44px.
 * Prefer <Button asChild> which keeps the shadcn visible size.
 */
export const buttonVariants = cva(
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        compact: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        large: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
      fullWidth: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "default", size: "default", fullWidth: false },
  }
);

/** The visible shadcn chrome of <Button>. State variants follow the 44px box (group/button). */
export const buttonChromeVariants = cva(
  "inline-flex shrink-0 grow items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all group-focus-visible/button:border-ring group-focus-visible/button:ring-[3px] group-focus-visible/button:ring-ring/50 group-disabled/button:pointer-events-none group-disabled/button:opacity-50 group-aria-invalid/button:border-destructive group-aria-invalid/button:ring-destructive/20 dark:group-aria-invalid/button:ring-destructive/40 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground group-hover/button:bg-primary/90",
        primary:
          "bg-primary text-primary-foreground group-hover/button:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground group-hover/button:bg-destructive/90 group-focus-visible/button:ring-destructive/20 dark:group-focus-visible/button:ring-destructive/40",
        outline:
          "border bg-background shadow-xs group-hover/button:bg-accent group-hover/button:text-accent-foreground dark:border-input dark:bg-input/30 dark:group-hover/button:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground group-hover/button:bg-secondary/80",
        ghost:
          "group-hover/button:bg-accent group-hover/button:text-accent-foreground dark:group-hover/button:bg-accent/50",
        link: "text-primary underline-offset-4 group-hover/button:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        compact: "h-8 gap-1.5 rounded-md px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        large: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9 grow-0",
        "icon-sm": "size-8 grow-0",
        "icon-lg": "size-10 grow-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

/**
 * The 44px box around the chrome. Negative margins give back the extra
 * height (and width for icon sizes), so layout matches shadcn exactly.
 */
export const buttonBoxVariants = cva(
  "group/button relative inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center bg-transparent p-0 align-middle outline-none focus-visible:outline-none disabled:pointer-events-none",
  {
    variants: {
      size: {
        default: "-my-1",
        sm: "-my-1.5",
        compact: "-my-1.5",
        lg: "-my-0.5",
        large: "-my-0.5",
        icon: "-m-1",
        "icon-sm": "-m-1.5",
        "icon-lg": "-m-0.5",
      },
      fullWidth: { true: "flex w-full", false: "" },
    },
    defaultVariants: { size: "default", fullWidth: false },
  }
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;
export type ButtonSize = NonNullable<
  VariantProps<typeof buttonVariants>["size"]
>;

export interface ButtonProps extends ComponentPropsWithRef<"button"> {
  /** Render the single child element (for example a link) as the button. */
  asChild?: boolean;
  fullWidth?: boolean | null;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize | null;
  variant?: ButtonVariant | null;
}

const chromeContent = (
  children: ReactNode,
  loading: boolean,
  loadingLabel: string
): ReactNode =>
  loading ? (
    <>
      <span className="invisible inline-flex items-center gap-2">
        {children}
      </span>
      <LoaderCircle
        aria-hidden="true"
        className="absolute animate-spin motion-reduce:animate-none"
      />
      <span className="sr-only">{loadingLabel}</span>
    </>
  ) : (
    children
  );

export const Button = ({
  asChild = false,
  children,
  className,
  disabled = false,
  fullWidth = false,
  loading = false,
  loadingLabel = "Loading",
  size = "default",
  type = "button",
  variant = "default",
  ...props
}: ButtonProps) => {
  const boxClass = cn(buttonBoxVariants({ fullWidth, size }), className);
  const chromeClass = cn(
    buttonChromeVariants({ size, variant }),
    loading && "relative"
  );
  if (asChild && isValidElement(children)) {
    const child = children as ReactElement<{
      children?: ReactNode;
      className?: string;
    }>;
    return cloneElement(
      child,
      {
        ...props,
        className: cn(boxClass, child.props.className),
        "data-size": size,
        "data-slot": "button",
        "data-variant": variant,
      } as Record<string, unknown>,
      <span className={chromeClass} data-slot="button-chrome">
        {child.props.children}
      </span>
    );
  }
  return (
    <button
      {...props}
      aria-busy={loading || undefined}
      className={boxClass}
      data-loading={loading || undefined}
      data-size={size}
      data-slot="button"
      data-variant={variant}
      disabled={disabled || loading}
      type={type}
    >
      <span className={chromeClass} data-slot="button-chrome">
        {chromeContent(children, loading, loadingLabel)}
      </span>
    </button>
  );
};
