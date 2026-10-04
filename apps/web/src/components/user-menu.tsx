// What: Portal user menu (avatar + name trigger): features, account, administration, appearance and sign out.
// Used by: apps/web/src/components/portal-shell.tsx.
// See: apps/web/src/lib/navigation.ts; packages/ui/src/client/theme.ts#AppearanceMenuItems.
"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@darkfactory/ui/client/dropdown-menu";
import { AppearanceMenuItems } from "@darkfactory/ui/client/theme";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  ACCOUNT_NAVIGATION,
  ADMIN_NAVIGATION,
  EXPOSED_ROUTE_PATHS,
  FEATURE_NAVIGATION,
  isNavigationItemActive,
  isRouteExposed,
  type NavigationItem,
} from "../lib/navigation.ts";
import {
  SignOutError,
  SignOutMenuItem,
  useSignOutAction,
} from "./account/sign-out-action.tsx";
import type { CurrentSessionGateway } from "./account/sign-out-client.ts";
import { useAppearanceSelection } from "./theme-menu.tsx";

export const userInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/u).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return initials === "" ? "?" : initials;
};

export interface UserMenuSection {
  readonly items: readonly NavigationItem[];
  readonly label: string;
}

export const userMenuSections = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  isAdmin = false,
}: Readonly<{
  availableRoutes?: readonly string[];
  isAdmin?: boolean;
}>): readonly UserMenuSection[] => {
  const exposed = (items: readonly NavigationItem[]) =>
    items.filter((item) => isRouteExposed(item.href, availableRoutes));
  const sections: UserMenuSection[] = [
    { items: exposed(FEATURE_NAVIGATION), label: "Features" },
    { items: exposed(ACCOUNT_NAVIGATION), label: "Account" },
  ];
  if (isAdmin)
    sections.push({
      items: exposed(ADMIN_NAVIGATION),
      label: "Administration",
    });
  return sections.filter((section) => section.items.length > 0);
};

export interface UserMenuProps {
  readonly availableRoutes?: readonly string[];
  readonly isAdmin?: boolean;
  readonly name: string;
  readonly signOutGateway?: CurrentSessionGateway;
}

export const UserMenu = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  isAdmin = false,
  name,
  signOutGateway,
}: UserMenuProps) => {
  const pathname = usePathname() ?? "";
  const appearance = useAppearanceSelection();
  const signOut = useSignOutAction(
    signOutGateway === undefined ? {} : { gateway: signOutGateway }
  );
  const sections = userMenuSections({ availableRoutes, isAdmin });

  return (
    <div className="relative">
      <span aria-atomic="true" aria-live="polite" className="sr-only">
        {appearance.statusMessage}
      </span>
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
          className="max-h-[calc(100dvh-var(--header-height))] w-60 overflow-y-auto overscroll-contain"
          id="user-menu-content"
        >
          {sections.map((section) => (
            <Fragment key={section.label}>
              <DropdownMenuGroup aria-label={section.label}>
                <DropdownMenuLabel>{section.label}</DropdownMenuLabel>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = isNavigationItemActive(pathname, item);
                  return (
                    <DropdownMenuItem asChild key={item.href}>
                      <Link
                        aria-current={active ? "page" : undefined}
                        className={active ? "font-semibold" : undefined}
                        href={item.href}
                        prefetch={false}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </Fragment>
          ))}
          {appearance.error === null ? null : (
            <p className="px-3 py-1 text-destructive text-xs" role="alert">
              {appearance.error}
            </p>
          )}
          <AppearanceMenuItems
            disabled={appearance.disabled}
            idPrefix="user-menu"
            onPreferenceChange={appearance.select}
          />
          <DropdownMenuSeparator />
          <SignOutMenuItem {...signOut} />
        </DropdownMenuContent>
      </DropdownMenu>
      <SignOutError state={signOut.state} />
    </div>
  );
};
