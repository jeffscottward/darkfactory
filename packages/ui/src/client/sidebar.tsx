// What: shadcn/ui new-york-v4 Sidebar (provider, collapsible desktop sidebar with icon mode, mobile sheet, inset, groups, menu, trigger, rail).
// Used by: apps/web/src/components/portal-shell.tsx.
// See: https://ui.shadcn.com/docs/components/sidebar; design-system/darkfactory/MASTER.md ("Portal shell", "Touch targets").
"use client";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { PanelLeft, X } from "lucide-react";
import {
  Dialog as DialogPrimitive,
  Tooltip as TooltipPrimitive,
} from "radix-ui";
import {
  type ComponentPropsWithRef,
  type CSSProperties,
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button, type ButtonProps } from "../button.tsx";
import { Separator, type SeparatorProps } from "../separator.tsx";
import { cn } from "../utilities.ts";

export const SIDEBAR_WIDTH = "16rem";
export const SIDEBAR_WIDTH_MOBILE = "18rem";
export const SIDEBAR_WIDTH_ICON = "3rem";
export const SIDEBAR_KEYBOARD_SHORTCUT = "b";
export const MOBILE_BREAKPOINT = 768;

export interface SidebarContextValue {
  readonly isMobile: boolean;
  readonly open: boolean;
  readonly openMobile: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly setOpenMobile: (open: boolean) => void;
  readonly state: "expanded" | "collapsed";
  readonly toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export const useSidebar = (): SidebarContextValue => {
  const context = useContext(SidebarContext);
  if (context === null)
    throw new Error("useSidebar must be used within a SidebarProvider.");
  return context;
};

/** True below the md breakpoint (shadcn useIsMobile). False during server render. */
export const useIsMobile = (): boolean => {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const update = () => setIsMobile(query.matches);
    query.addEventListener("change", update);
    update();
    return () => query.removeEventListener("change", update);
  }, []);
  return isMobile;
};

export interface SidebarProviderProps extends ComponentPropsWithRef<"div"> {
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  open?: boolean;
}

export const SidebarProvider = ({
  children,
  className,
  defaultOpen = true,
  onOpenChange,
  open: openProp,
  style,
  ...props
}: SidebarProviderProps) => {
  const isMobile = useIsMobile();
  const [openMobile, setOpenMobile] = useState(false);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = openProp ?? localOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (onOpenChange === undefined) setLocalOpen(next);
      else onOpenChange(next);
    },
    [onOpenChange]
  );
  const toggleSidebar = useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current);
    else setOpen(!open);
  }, [isMobile, open, setOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        event.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleSidebar]);

  const state = open ? "expanded" : "collapsed";
  const value = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      open,
      openMobile,
      setOpen,
      setOpenMobile,
      state,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, state, toggleSidebar]
  );

  return (
    <SidebarContext.Provider value={value}>
      <TooltipPrimitive.Provider delayDuration={0}>
        <div
          className={cn(
            "group/sidebar-wrapper flex min-h-svh w-full has-data-[variant=inset]:bg-sidebar",
            className
          )}
          data-slot="sidebar-wrapper"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH,
              "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
              ...style,
            } as CSSProperties
          }
          {...props}
        >
          {children}
        </div>
      </TooltipPrimitive.Provider>
    </SidebarContext.Provider>
  );
};

export interface SidebarProps extends ComponentPropsWithRef<"div"> {
  collapsible?: "offcanvas" | "icon" | "none";
  /** Accessible names for the mobile sheet. */
  mobileCloseLabel?: string;
  /** false: no Radix sheet below md. The app supplies its own mobile drawer (for example a native popover that works before hydration). */
  mobileSheet?: boolean;
  mobileTitle?: string;
  side?: "left" | "right";
  variant?: "sidebar" | "floating" | "inset";
}

export const Sidebar = ({
  children,
  className,
  collapsible = "offcanvas",
  mobileCloseLabel = "Close sidebar",
  mobileSheet = true,
  mobileTitle = "Sidebar",
  side = "left",
  variant = "sidebar",
  ...props
}: SidebarProps) => {
  const { isMobile, openMobile, setOpenMobile, state } = useSidebar();

  if (collapsible === "none") {
    return (
      <div
        className={cn(
          "flex h-full w-(--sidebar-width) flex-col bg-sidebar text-sidebar-foreground",
          className
        )}
        data-slot="sidebar"
        {...props}
      >
        {children}
      </div>
    );
  }

  if (isMobile && mobileSheet) {
    return (
      <DialogPrimitive.Root onOpenChange={setOpenMobile} open={openMobile}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=open]:animate-in" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className={cn(
              "fixed z-50 flex w-(--sidebar-width) flex-col gap-4 bg-sidebar p-0 text-sidebar-foreground shadow-lg transition ease-in-out data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:duration-300 data-[state=open]:duration-500",
              side === "left"
                ? "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full border-r"
                : "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full border-l"
            )}
            data-mobile="true"
            data-sidebar="sidebar"
            data-slot="sidebar"
            style={{ "--sidebar-width": SIDEBAR_WIDTH_MOBILE } as CSSProperties}
          >
            <DialogPrimitive.Title className="sr-only">
              {mobileTitle}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close
              aria-label={mobileCloseLabel}
              className="group/close absolute top-2 right-2 z-10 inline-flex size-11 items-center justify-center outline-hidden"
            >
              <span className="inline-flex rounded-xs opacity-70 ring-offset-background transition-opacity group-hover/close:opacity-100 group-focus-visible/close:ring-2 group-focus-visible/close:ring-ring group-focus-visible/close:ring-offset-2">
                <X aria-hidden="true" className="size-4" />
              </span>
            </DialogPrimitive.Close>
            <div className="flex h-full w-full flex-col">{children}</div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  }

  const floating = variant === "floating" || variant === "inset";
  return (
    <div
      className="group peer hidden text-sidebar-foreground md:block"
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-side={side}
      data-slot="sidebar"
      data-state={state}
      data-variant={variant}
    >
      <div
        className={cn(
          "relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
          "group-data-[collapsible=offcanvas]:w-0",
          "group-data-[side=right]:rotate-180",
          floating
            ? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
        data-slot="sidebar-gap"
      />
      <div
        className={cn(
          "fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",
          side === "left"
            ? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
            : "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
          floating
            ? "p-2 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
          className
        )}
        data-slot="sidebar-container"
        {...props}
      >
        <div
          className="flex h-full w-full flex-col bg-sidebar group-data-[variant=floating]:rounded-lg group-data-[variant=floating]:border group-data-[variant=floating]:border-sidebar-border group-data-[variant=floating]:shadow-sm"
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </div>
      </div>
    </div>
  );
};

export interface SidebarTriggerProps extends ButtonProps {
  label?: string;
}

/** shadcn SidebarTrigger: a ghost icon button with a 28px chrome (size-7) in a 44px box. */
export const SidebarTrigger = ({
  className,
  label = "Toggle Sidebar",
  onClick,
  ...props
}: SidebarTriggerProps) => {
  const { toggleSidebar } = useSidebar();
  return (
    <Button
      aria-label={label}
      className={cn("-m-2 [&>[data-slot=button-chrome]]:size-7", className)}
      data-sidebar="trigger"
      onClick={(event) => {
        onClick?.(event);
        toggleSidebar();
      }}
      size="icon"
      variant="ghost"
      {...props}
    >
      <PanelLeft aria-hidden="true" />
    </Button>
  );
};

export const SidebarRail = ({
  className,
  ...props
}: ComponentPropsWithRef<"button">) => {
  const { toggleSidebar } = useSidebar();
  return (
    <button
      aria-hidden="true"
      className={cn(
        "absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=right]:left-0 sm:flex",
        "in-data-[side=left]:cursor-w-resize in-data-[side=right]:cursor-e-resize",
        "[[data-side=left][data-state=collapsed]_&]:cursor-e-resize [[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "group-data-[collapsible=offcanvas]:translate-x-0 hover:group-data-[collapsible=offcanvas]:bg-sidebar group-data-[collapsible=offcanvas]:after:left-full",
        "[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      onClick={toggleSidebar}
      tabIndex={-1}
      title="Toggle Sidebar"
      type="button"
      {...props}
    />
  );
};

export const SidebarInset = ({
  className,
  ...props
}: ComponentPropsWithRef<"main">) => (
  <main
    className={cn(
      "relative flex w-full flex-1 flex-col bg-background",
      "md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2 md:peer-data-[variant=inset]:m-2 md:peer-data-[variant=inset]:ml-0 md:peer-data-[variant=inset]:rounded-xl md:peer-data-[variant=inset]:shadow-sm",
      className
    )}
    data-slot="sidebar-inset"
    {...props}
  />
);

const sidebarSection =
  (slot: string, base: string) =>
  ({ className, ...props }: ComponentPropsWithRef<"div">) => (
    <div
      className={cn(base, className)}
      data-sidebar={slot}
      data-slot={`sidebar-${slot}`}
      {...props}
    />
  );

export const SidebarHeader = sidebarSection(
  "header",
  "flex flex-col gap-2 p-2"
);
export const SidebarFooter = sidebarSection(
  "footer",
  "flex flex-col gap-2 p-2"
);
export const SidebarContent = sidebarSection(
  "content",
  "flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden"
);
export const SidebarGroup = sidebarSection(
  "group",
  "relative flex w-full min-w-0 flex-col p-2"
);
export const SidebarGroupLabel = sidebarSection(
  "group-label",
  "flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0 group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0"
);
export const SidebarGroupContent = sidebarSection(
  "group-content",
  "w-full text-sm"
);

export const SidebarSeparator = ({ className, ...props }: SeparatorProps) => (
  <Separator
    className={cn("mx-2 w-auto bg-sidebar-border", className)}
    data-sidebar="separator"
    {...props}
  />
);

export const SidebarMenu = ({
  className,
  ...props
}: ComponentPropsWithRef<"ul">) => (
  <ul
    className={cn("flex w-full min-w-0 flex-col gap-1", className)}
    data-sidebar="menu"
    data-slot="sidebar-menu"
    {...props}
  />
);

export const SidebarMenuItem = ({
  className,
  ...props
}: ComponentPropsWithRef<"li">) => (
  <li
    className={cn("group/menu-item relative", className)}
    data-sidebar="menu-item"
    data-slot="sidebar-menu-item"
    {...props}
  />
);

/**
 * shadcn sidebarMenuButtonVariants on the visible row (chrome). The element
 * box is 44px tall (touch-target gate); its negative margins give the extra
 * height back, so rows sit at shadcn's 32px + 4px gap pitch.
 */
export const sidebarMenuButtonVariants = cva(
  "flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm outline-hidden ring-sidebar-ring transition-[width,height,padding] group-hover/menu-button:bg-sidebar-accent group-hover/menu-button:text-sidebar-accent-foreground group-focus-visible/menu-button:ring-2 group-active/menu-button:bg-sidebar-accent group-active/menu-button:text-sidebar-accent-foreground group-disabled/menu-button:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 group-aria-disabled/menu-button:opacity-50 group-data-[collapsible=icon]:size-8! group-data-[active=true]/menu-button:bg-sidebar-accent group-data-[collapsible=icon]:p-2! group-data-[active=true]/menu-button:font-medium group-data-[active=true]/menu-button:text-sidebar-accent-foreground [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "group-hover/menu-button:bg-sidebar-accent group-hover/menu-button:text-sidebar-accent-foreground",
        outline:
          "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] group-hover/menu-button:bg-sidebar-accent group-hover/menu-button:text-sidebar-accent-foreground group-hover/menu-button:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "h-8 text-sm",
        lg: "h-12 text-sm group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

const SIDEBAR_MENU_BOX = {
  default:
    "-my-1.5 group-data-[collapsible=icon]:-mx-1.5 group-data-[collapsible=icon]:w-11",
  lg: "",
} as const;

export interface SidebarMenuButtonProps
  extends ComponentPropsWithRef<"button">,
    VariantProps<typeof sidebarMenuButtonVariants> {
  /** Render the single child element (for example a link) as the button. */
  asChild?: boolean;
  isActive?: boolean;
  /** Label shown in a tooltip while the sidebar is collapsed to icons. */
  tooltip?: string;
}

export const SidebarMenuButton = ({
  asChild = false,
  children,
  className,
  isActive = false,
  size = "default",
  tooltip,
  variant = "default",
  ...props
}: SidebarMenuButtonProps) => {
  const { isMobile, state } = useSidebar();
  const boxClass = cn(
    "group/menu-button peer/menu-button flex min-h-11 w-full min-w-11 items-center outline-hidden disabled:pointer-events-none aria-disabled:pointer-events-none",
    SIDEBAR_MENU_BOX[size === "lg" ? "lg" : "default"],
    className
  );
  const shared = {
    "data-active": isActive,
    "data-sidebar": "menu-button",
    "data-size": size,
    "data-slot": "sidebar-menu-button",
  };
  const chrome = (content: ReactNode) => (
    <span
      className={sidebarMenuButtonVariants({ size, variant })}
      data-slot="sidebar-menu-button-chrome"
    >
      {content}
    </span>
  );
  const element =
    asChild && isValidElement(children) ? (
      cloneElement(
        children as ReactElement<{ children?: ReactNode; className?: string }>,
        {
          ...props,
          ...shared,
          className: cn(
            boxClass,
            (children as ReactElement<{ className?: string }>).props.className
          ),
        } as Record<string, unknown>,
        chrome(
          (children as ReactElement<{ children?: ReactNode }>).props.children
        )
      )
    ) : (
      <button className={boxClass} type="button" {...shared} {...props}>
        {chrome(children)}
      </button>
    );
  if (tooltip === undefined) return element;
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{element}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          align="center"
          className="fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 z-50 w-fit origin-(--radix-tooltip-content-transform-origin) animate-in text-balance rounded-md bg-foreground px-3 py-1.5 text-background text-xs data-[state=closed]:animate-out"
          hidden={state !== "collapsed" || isMobile}
          side="right"
          sideOffset={0}
        >
          {tooltip}
          <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
};
