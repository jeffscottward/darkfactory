// What: Signed-in portal shell: core-navigation sidebar, compact top bar with the user menu, and main region.
// Used by: apps/web/src/app/(portal)/layout.tsx.
// See: apps/web/src/components/user-menu.tsx; apps/web/src/lib/navigation.ts#PORTAL_NAVIGATION.
"use client";

import { IconButton } from "@darkfactory/ui";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";

import {
  EXPOSED_ROUTE_PATHS,
  isRouteExposed,
  PORTAL_NAVIGATION,
} from "../lib/navigation.ts";
import { BrandLink } from "./brand-mark.tsx";
import { NavigationLinks } from "./navigation-links.tsx";
import { UserMenu } from "./user-menu.tsx";

interface PortalNavigationProps {
  readonly availableRoutes?: readonly string[];
  readonly mobile?: boolean;
}

const closePortalNavigation = () => {
  const navigation = document.getElementById("portal-navigation");
  const hidePopover = navigation?.hidePopover;
  if (typeof hidePopover === "function") return hidePopover.call(navigation);
  return;
};

const PortalNavigation = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  mobile = false,
}: PortalNavigationProps) => {
  const items = PORTAL_NAVIGATION.filter((item) =>
    isRouteExposed(item.href, availableRoutes)
  );
  if (items.length === 0) return null;
  return (
    <nav aria-label={mobile ? "Mobile portal navigation" : "Portal navigation"}>
      <NavigationLinks
        items={items}
        onNavigate={mobile ? closePortalNavigation : undefined}
        orientation="vertical"
        prefetch={false}
        showIcons
      />
    </nav>
  );
};

export const PortalSidebar = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
}: PortalNavigationProps) => (
  <aside className="fixed inset-y-0 left-0 hidden w-(--sidebar-width) border-border border-r bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
    <div className="flex h-(--header-height) items-center border-border border-b px-3">
      <BrandLink />
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto p-2">
      <PortalNavigation availableRoutes={availableRoutes} />
    </div>
  </aside>
);

export interface PortalTopbarProps {
  readonly availableRoutes?: readonly string[];
  readonly isAdmin?: boolean;
  readonly userName: string;
}

export const PortalTopbar = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  isAdmin = false,
  userName,
}: PortalTopbarProps) => (
  <header className="sticky top-0 z-overlay border-border border-b bg-background">
    <div className="flex h-(--header-height) items-center justify-between gap-2 px-3 lg:px-4">
      <div className="flex items-center gap-2">
        <IconButton
          aria-label="Open portal navigation"
          className="lg:hidden"
          popoverTarget="portal-navigation"
          popoverTargetAction="toggle"
          variant="ghost"
        >
          <Menu aria-hidden="true" />
        </IconButton>
        <div
          aria-labelledby="portal-navigation-title"
          className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-dvh w-full max-w-xs overflow-y-auto rounded-none border-border border-y-0 border-r border-l-0 bg-sidebar p-3 text-sidebar-foreground shadow-xl backdrop:bg-black/50 lg:hidden"
          id="portal-navigation"
          popover="auto"
          role="dialog"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <h2
              className="font-semibold text-base"
              id="portal-navigation-title"
            >
              Navigation
            </h2>
            <IconButton
              aria-label="Close portal navigation"
              autoFocus
              popoverTarget="portal-navigation"
              popoverTargetAction="hide"
              variant="ghost"
            >
              <X aria-hidden="true" />
            </IconButton>
          </div>
          <PortalNavigation availableRoutes={availableRoutes} mobile />
        </div>
        <BrandLink className="lg:hidden" />
      </div>
      <UserMenu
        availableRoutes={availableRoutes}
        isAdmin={isAdmin}
        name={userName}
      />
    </div>
  </header>
);

export interface PortalShellProps {
  readonly availableRoutes?: readonly string[];
  readonly children: ReactNode;
  readonly isAdmin?: boolean;
  readonly userName: string;
}

export const PortalShell = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  children,
  isAdmin = false,
  userName,
}: PortalShellProps) => (
  <div className="min-h-dvh bg-background lg:pl-(--sidebar-width)">
    <PortalSidebar availableRoutes={availableRoutes} />
    <div className="min-w-0">
      <PortalTopbar
        availableRoutes={availableRoutes}
        isAdmin={isAdmin}
        userName={userName}
      />
      <main
        className="df-container-portal py-4 lg:py-5"
        id="main-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  </div>
);
