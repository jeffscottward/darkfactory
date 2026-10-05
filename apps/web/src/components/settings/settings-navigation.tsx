// What: Link-based settings navigation: the high-level tabs and the Account sections. Each entry is its own URL.
// Used by: apps/web/src/app/(portal)/settings/layout.tsx, apps/web/src/app/(portal)/settings/account/layout.tsx.
// See: apps/web/src/lib/navigation.ts#SETTINGS_NAVIGATION, #ACCOUNT_SETTINGS_NAVIGATION.
"use client";

import { cn } from "@darkfactory/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ACCOUNT_SETTINGS_NAVIGATION,
  EXPOSED_ROUTE_PATHS,
  isNavigationItemActive,
  isRouteExposed,
  SETTINGS_NAVIGATION,
} from "../../lib/navigation.ts";

/**
 * Server layouts pick a menu by name: navigation items hold icon components,
 * which cannot cross the server-to-client boundary as props.
 */
const SETTINGS_MENUS = Object.freeze({
  account: {
    items: ACCOUNT_SETTINGS_NAVIGATION,
    label: "Account sections",
    variant: "sections",
  },
  settings: { items: SETTINGS_NAVIGATION, label: "Settings", variant: "tabs" },
} as const);

export interface SettingsNavigationProps {
  readonly availableRoutes?: readonly string[];
  readonly currentPath?: string;
  /** `settings`: the high-level tab strip. `account`: the Account section list, vertical on wide screens. */
  readonly menu: keyof typeof SETTINGS_MENUS;
}

export const SettingsNavigation = ({
  availableRoutes = EXPOSED_ROUTE_PATHS,
  currentPath,
  menu,
}: SettingsNavigationProps) => {
  const frameworkPath = usePathname();
  const pathname = currentPath ?? frameworkPath ?? "";
  const { items, label, variant } = SETTINGS_MENUS[menu];
  const visible = items.filter((item) =>
    isRouteExposed(item.href, availableRoutes)
  );
  if (visible.length === 0) return null;

  return (
    <nav aria-label={label} className="min-w-0">
      <ul
        className={cn(
          "flex list-none gap-1 p-0",
          variant === "tabs"
            ? "w-fit max-w-full overflow-x-auto rounded-lg bg-muted p-1 text-muted-foreground"
            : "flex-wrap lg:flex-col lg:flex-nowrap"
        )}
      >
        {visible.map((item) => {
          const active = isNavigationItemActive(pathname, item);
          const Icon = item.icon;
          return (
            <li className="shrink-0" key={item.href}>
              <Link
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 min-w-11 items-center gap-2 whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors duration-base ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  variant === "tabs"
                    ? active
                      ? "bg-background text-foreground shadow-sm"
                      : "hover:text-foreground"
                    : cn(
                        "w-full justify-start",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-foreground"
                      )
                )}
                href={item.href}
                prefetch={false}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};
