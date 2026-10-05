// What: Signed-in portal shell with shadcn sidebar-07 / dashboard-01 anatomy: collapsible inset sidebar (16rem, 3rem icon mode), SidebarInset, and a site header with SidebarTrigger, separator, page title and the user menu.
// Used by: apps/web/src/app/(portal)/layout.tsx.
// See: packages/ui/src/client/sidebar.tsx; apps/web/src/lib/navigation.ts#PORTAL_SIDEBAR_GROUPS; apps/web/src/components/user-menu.tsx.
"use client";

import { Button, Separator } from "@darkfactory/ui";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@darkfactory/ui/client/sidebar";
import { PanelLeft, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import {
  EXPOSED_ROUTE_PATHS,
  isNavigationItemActive,
  isRouteExposed,
  type NavigationItem,
  PORTAL_SIDEBAR_GROUPS,
  SETTINGS_ENTRY,
  SETTINGS_NAVIGATION,
} from "../lib/navigation.ts";
import { useUiState } from "../lib/ui-store.tsx";
import { BrandMark } from "./brand-mark.tsx";
import { UserMenu } from "./user-menu.tsx";

interface PortalNavigationProps {
  readonly availableRoutes?: readonly string[];
}

const TITLE_SOURCES: readonly NavigationItem[] = [
  ...PORTAL_SIDEBAR_GROUPS.flatMap((group) => group.items),
  ...SETTINGS_NAVIGATION,
  SETTINGS_ENTRY,
];

/** Page title for the site header: the most specific matching navigation label. */
export const portalPageTitle = (pathname: string): string =>
  TITLE_SOURCES.filter((item) => isNavigationItemActive(pathname, item)).sort(
    (left, right) => right.href.length - left.href.length
  )[0]?.label ?? "DarkFactory";

const PORTAL_NAVIGATION_ID = "portal-navigation";

/** Closes the native popover drawer after a mobile link click. */
const closePortalNavigation = () => {
  const drawer = document.getElementById(PORTAL_NAVIGATION_ID);
  const hidePopover = drawer?.hidePopover;
  if (typeof hidePopover === "function") hidePopover.call(drawer);
};

interface PortalNavigationListProps extends PortalNavigationProps {
  readonly mobile?: boolean;
}

const PortalNavigation = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  mobile = false,
}: PortalNavigationListProps) => {
  const pathname = usePathname() ?? "";
  const groups = PORTAL_SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) =>
      isRouteExposed(item.href, availableRoutes)
    ),
  })).filter((group) => group.items.length > 0);
  if (groups.length === 0) return null;
  return (
    <nav aria-label={mobile ? "Mobile portal navigation" : "Portal navigation"}>
      {groups.map((group) => (
        <SidebarGroup key={group.label ?? "core"}>
          {group.label === null ? null : (
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isNavigationItemActive(pathname, item);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      {...(mobile ? {} : { tooltip: item.label })}
                    >
                      <Link
                        aria-current={active ? "page" : undefined}
                        href={item.href}
                        {...(mobile ? { onClick: closePortalNavigation } : {})}
                        prefetch={false}
                      >
                        <Icon aria-hidden="true" />
                        <span>
                          {item.label}
                          {active ? (
                            <span className="sr-only">, current page</span>
                          ) : null}
                        </span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
};

const PortalBrand = () => (
  <SidebarMenu>
    <SidebarMenuItem>
      <SidebarMenuButton asChild className="[&>span]:p-1.5!">
        <a href="/">
          <BrandMark className="size-5!" />
          <span className="font-semibold text-base">DarkFactory</span>
        </a>
      </SidebarMenuButton>
    </SidebarMenuItem>
  </SidebarMenu>
);

const PortalSidebar = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
}: PortalNavigationProps) => (
  <Sidebar collapsible="icon" mobileSheet={false} variant="inset">
    <SidebarHeader>
      <PortalBrand />
    </SidebarHeader>
    <SidebarContent>
      <PortalNavigation availableRoutes={availableRoutes} />
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
);

/**
 * Mobile drawer: shadcn's left sheet look (18rem, bg-sidebar, border-r,
 * shadow-lg, black/50 backdrop) on the native popover API, so it opens and
 * closes before hydration and without JavaScript.
 */
const PortalMobileNavigation = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
}: PortalNavigationProps) => (
  <div
    aria-labelledby="portal-navigation-title"
    className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-dvh w-72 max-w-[calc(100%-3rem)] overflow-y-auto border-0 border-r bg-sidebar p-0 text-sidebar-foreground shadow-lg backdrop:bg-black/50 md:hidden"
    id={PORTAL_NAVIGATION_ID}
    popover="auto"
    role="dialog"
  >
    <div className="flex items-center justify-between gap-2 p-2">
      <h2 className="px-2 font-semibold text-base" id="portal-navigation-title">
        Navigation
      </h2>
      <button
        aria-label="Close portal navigation"
        autoFocus
        className="group/close inline-flex size-11 shrink-0 items-center justify-center outline-hidden"
        popoverTarget={PORTAL_NAVIGATION_ID}
        popoverTargetAction="hide"
        type="button"
      >
        <span className="inline-flex rounded-xs opacity-70 ring-offset-background transition-opacity group-hover/close:opacity-100 group-focus-visible/close:ring-2 group-focus-visible/close:ring-ring group-focus-visible/close:ring-offset-2">
          <X aria-hidden="true" className="size-4" />
        </span>
      </button>
    </div>
    <PortalNavigation availableRoutes={availableRoutes} mobile />
  </div>
);

interface PortalTopbarProps {
  readonly availableRoutes?: readonly string[];
  readonly userName: string;
}

/** dashboard-01 SiteHeader. Below md the trigger opens the native popover drawer; from md it collapses the sidebar. */
const PortalTopbar = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  userName,
}: PortalTopbarProps) => {
  const pathname = usePathname() ?? "";
  return (
    <header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
      <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
        <Button
          aria-label="Open portal navigation"
          className="-m-2 md:hidden [&>[data-slot=button-chrome]]:size-7"
          popoverTarget={PORTAL_NAVIGATION_ID}
          popoverTargetAction="toggle"
          size="icon"
          variant="ghost"
        >
          <PanelLeft aria-hidden="true" />
        </Button>
        <PortalMobileNavigation availableRoutes={availableRoutes} />
        <SidebarTrigger
          className="hidden md:inline-flex"
          label="Toggle sidebar"
        />
        <Separator
          className="mx-2 data-[orientation=vertical]:h-4"
          orientation="vertical"
        />
        <p className="font-medium text-base">{portalPageTitle(pathname)}</p>
        <div className="ml-auto flex items-center gap-2">
          <UserMenu availableRoutes={availableRoutes} name={userName} />
        </div>
      </div>
    </header>
  );
};

export interface PortalShellProps {
  readonly availableRoutes?: readonly string[];
  readonly children: ReactNode;
  readonly isAdmin?: boolean;
  readonly userName: string;
}

export const PortalShell = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  children,
  userName,
}: PortalShellProps) => {
  const sidebar = useUiState((state) => state.sidebar);
  const setSidebar = useUiState((state) => state.setSidebar);
  return (
    <SidebarProvider
      onOpenChange={(open) => setSidebar(open ? "expanded" : "collapsed")}
      open={sidebar === "expanded"}
    >
      <PortalSidebar availableRoutes={availableRoutes} />
      <SidebarInset id="main-content" tabIndex={-1}>
        <PortalTopbar availableRoutes={availableRoutes} userName={userName} />
        <div className="flex flex-1 flex-col">
          <div className="@container/main flex flex-1 flex-col gap-2">
            <div className="flex flex-col gap-4 px-4 py-4 md:gap-6 md:py-6 lg:px-6">
              {children}
            </div>
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
};
