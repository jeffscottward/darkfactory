// What: Portal user menu (avatar + name trigger) with exactly two items: Settings and Sign out.
// Used by: apps/web/src/components/portal-shell.tsx.
// See: apps/web/src/lib/navigation.ts#SETTINGS_ENTRY; apps/web/src/app/(portal)/settings/layout.tsx.
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@darkfactory/ui/client/dropdown-menu";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  EXPOSED_ROUTE_PATHS,
  isNavigationItemActive,
  isRouteExposed,
  SETTINGS_ENTRY,
} from "../lib/navigation.ts";
import {
  SignOutError,
  SignOutMenuItem,
  useSignOutAction,
} from "./account/sign-out-action.tsx";
import type { CurrentSessionGateway } from "./account/sign-out-client.ts";

export const userInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials === "" ? "?" : initials;
};

export interface UserMenuProps {
  readonly availableRoutes?: readonly string[];
  readonly name: string;
  readonly signOutGateway?: CurrentSessionGateway;
}

export const UserMenu = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  name,
  signOutGateway,
}: UserMenuProps) => {
  const pathname = usePathname() ?? "";
  const signOut = useSignOutAction(
    signOutGateway === undefined ? {} : { gateway: signOutGateway }
  );
  const settings = isRouteExposed(SETTINGS_ENTRY.href, availableRoutes)
    ? SETTINGS_ENTRY
    : null;
  const SettingsIcon = SETTINGS_ENTRY.icon;
  const settingsActive =
    settings !== null && isNavigationItemActive(pathname, settings);

  return (
    <div className="relative">
      {/* Non-modal: a modal menu marks the page aria-hidden while it stays focusable.
          aria-controls is optional for menu buttons; axe cannot verify it next to aria-haspopup. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger
          aria-controls={undefined}
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 font-medium text-foreground text-sm transition-colors duration-base ease-out hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          data-hydration-state={signOut.isHydrated ? "ready" : "pending"}
          id="user-menu-trigger"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill border border-border bg-primary-subtle font-semibold text-primary-subtle-foreground text-xs"
          >
            {userInitials(name)}
          </span>
          <span className="max-w-40 truncate">{name}</span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          aria-labelledby="user-menu-trigger"
          className="w-56"
          id="user-menu-content"
        >
          {settings === null ? null : (
            <>
              <DropdownMenuItem asChild>
                <Link
                  aria-current={settingsActive ? "page" : undefined}
                  className={settingsActive ? "font-semibold" : undefined}
                  href={settings.href}
                  prefetch={false}
                >
                  <SettingsIcon aria-hidden="true" />
                  <span>{settings.label}</span>
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
            </>
          )}
          <SignOutMenuItem {...signOut} />
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutError state={signOut.state} />
    </div>
  );
};
