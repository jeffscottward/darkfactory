// What: Navigation manifest: public, support, auth, portal sidebar, settings tabs, route-page map and legacy redirects.
// Used by: apps/web/src/components/portal-shell.tsx, apps/web/src/components/user-menu.tsx, apps/web/src/components/settings/settings-navigation.tsx.
// See: design-system/darkfactory/MASTER.md (Navigation); apps/web/src/features/generated-navigation.ts.
import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  FileText,
  Gauge,
  House,
  Info,
  KeyRound,
  LayoutList,
  LockKeyhole,
  Mail,
  MapPin,
  Palette,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  UserPlus,
  UserRound,
} from "lucide-react";
import {
  GENERATED_FEATURE_NAVIGATION,
  GENERATED_FEATURE_ROUTE_PAGE_FILES,
  GENERATED_FEATURE_ROUTE_PATHS,
} from "../features/generated-navigation.ts";

export interface NavigationItem {
  readonly exact?: boolean;
  readonly href: `/${string}` | "/";
  readonly icon: LucideIcon;
  readonly label: string;
}

export interface NavigationGroup {
  readonly items: readonly NavigationItem[];
  /** Visible group label; `null` renders the items without a label. */
  readonly label: string | null;
}

export const PUBLIC_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { exact: true, href: "/", icon: House, label: "Home" },
  { href: "/features", icon: Sparkles, label: "Features" },
  { href: "/solutions", icon: Boxes, label: "Solutions" },
  { href: "/resources", icon: BookOpen, label: "Resources" },
  { href: "/about", icon: Info, label: "About" },
  { href: "/sign-in", icon: LockKeyhole, label: "Sign in" },
]);

export const SUPPORT_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { href: "/contact", icon: Mail, label: "Contact" },
  { href: "/legal/privacy", icon: FileText, label: "Privacy" },
  { href: "/legal/terms", icon: FileText, label: "Terms" },
]);

export const AUTH_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { href: "/sign-up", icon: UserPlus, label: "Sign up" },
  { href: "/forgot-password", icon: KeyRound, label: "Forgot password" },
  { href: "/reset-password", icon: KeyRound, label: "Reset password" },
]);

/** Core product navigation: the unlabelled first sidebar group. */
export const PORTAL_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { href: "/dashboard", icon: Gauge, label: "Overview" },
]);

/** Feature destinations, including generated features: the sidebar "Features" group. */
export const FEATURE_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { href: "/feature-items", icon: LayoutList, label: "Feature items" },
  ...GENERATED_FEATURE_NAVIGATION.map((item) => ({
    ...item,
    icon: LayoutList,
  })),
]);

/** Portal sidebar groups, in display order. Filter items with `isRouteExposed`. */
export const PORTAL_SIDEBAR_GROUPS: readonly NavigationGroup[] = Object.freeze([
  { items: PORTAL_NAVIGATION, label: null },
  { items: FEATURE_NAVIGATION, label: "Features" },
]);

/** The single settings destination in the user menu. */
export const SETTINGS_ENTRY: NavigationItem = Object.freeze({
  href: "/settings",
  icon: Settings,
  label: "Settings",
});

/** First page of the settings area; `/settings` and `/settings/account` redirect here. */
export const SETTINGS_HOME_PATH = "/settings/account/profile" as const;

/** High-level settings tabs. "Administration" is exposed to administrators only. */
export const SETTINGS_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  { href: "/settings/account", icon: UserRound, label: "Account" },
  {
    href: "/settings/administration",
    icon: ShieldCheck,
    label: "Administration",
  },
  { href: "/settings/appearance", icon: Palette, label: "Appearance" },
]);

/** Sections inside the Account settings tab. */
export const ACCOUNT_SETTINGS_NAVIGATION: readonly NavigationItem[] =
  Object.freeze([
    { href: "/settings/account/profile", icon: UserRound, label: "Profile" },
    { href: "/settings/account/address", icon: MapPin, label: "Address" },
    {
      href: "/settings/account/preferences",
      icon: SlidersHorizontal,
      label: "Preferences",
    },
    {
      href: "/settings/account/security",
      icon: LockKeyhole,
      label: "Security",
    },
  ]);

/** Routes every signed-in member can open. */
export const MEMBER_PORTAL_ROUTE_PATHS = Object.freeze([
  "/dashboard",
  "/feature-items",
  ...GENERATED_FEATURE_ROUTE_PATHS,
  "/settings",
  "/settings/account",
  "/settings/account/profile",
  "/settings/account/address",
  "/settings/account/preferences",
  "/settings/account/security",
  "/settings/appearance",
] as const);

/** Routes only administrators can open. */
export const ADMIN_PORTAL_ROUTE_PATHS = Object.freeze([
  ...MEMBER_PORTAL_ROUTE_PATHS,
  "/settings/administration",
] as const);

/**
 * Old portal URLs and their settings destination. Each keeps a page that
 * redirects, so bookmarks and deep links keep working.
 */
export const LEGACY_ROUTE_REDIRECTS = Object.freeze({
  "/account": SETTINGS_HOME_PATH,
  "/account/address": "/settings/account/address",
  "/account/preferences": "/settings/account/preferences",
  "/account/profile": "/settings/account/profile",
  "/account/security": "/settings/account/security",
  "/admin": "/settings/administration",
  "/admin/users": "/settings/administration",
} as const);

export const EXPOSED_ROUTE_PATHS = Object.freeze([
  "/",
  "/features",
  "/solutions",
  "/resources",
  "/about",
  "/sign-in",
  "/contact",
  "/legal/privacy",
  "/legal/terms",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  ...ADMIN_PORTAL_ROUTE_PATHS,
] as const);

export const ROUTE_PAGE_FILES: Readonly<Record<string, string>> = Object.freeze(
  {
    "/": "(public)/page.tsx",
    "/about": "(public)/about/page.tsx",
    "/contact": "(public)/contact/page.tsx",
    "/dashboard": "(portal)/dashboard/page.tsx",
    "/feature-items": "(portal)/feature-items/page.tsx",
    "/features": "(public)/features/page.tsx",
    "/forgot-password": "(auth)/forgot-password/page.tsx",
    "/legal/privacy": "(public)/legal/privacy/page.tsx",
    "/legal/terms": "(public)/legal/terms/page.tsx",
    "/reset-password": "(auth)/reset-password/page.tsx",
    "/resources": "(public)/resources/page.tsx",
    "/settings": "(portal)/settings/page.ts",
    "/settings/account": "(portal)/settings/account/page.ts",
    "/settings/account/address": "(portal)/settings/account/address/page.tsx",
    "/settings/account/preferences":
      "(portal)/settings/account/preferences/page.tsx",
    "/settings/account/profile": "(portal)/settings/account/profile/page.tsx",
    "/settings/account/security": "(portal)/settings/account/security/page.tsx",
    "/settings/administration": "(portal)/settings/administration/page.tsx",
    "/settings/appearance": "(portal)/settings/appearance/page.tsx",
    "/sign-in": "(auth)/sign-in/page.tsx",
    "/sign-up": "(auth)/sign-up/page.tsx",
    "/solutions": "(public)/solutions/page.tsx",
    ...GENERATED_FEATURE_ROUTE_PAGE_FILES,
  }
);

/** Page files of the legacy redirects in `LEGACY_ROUTE_REDIRECTS`. */
export const LEGACY_ROUTE_PAGE_FILES: Readonly<Record<string, string>> =
  Object.freeze({
    "/account": "(portal)/account/page.ts",
    "/account/address": "(portal)/account/address/page.ts",
    "/account/preferences": "(portal)/account/preferences/page.ts",
    "/account/profile": "(portal)/account/profile/page.ts",
    "/account/security": "(portal)/account/security/page.ts",
    "/admin": "(portal)/admin/page.ts",
    "/admin/users": "(portal)/admin/users/page.ts",
  });

export const ALL_NAVIGATION: readonly NavigationItem[] = Object.freeze([
  ...PUBLIC_NAVIGATION,
  ...SUPPORT_NAVIGATION,
  ...AUTH_NAVIGATION,
  ...PORTAL_NAVIGATION,
  ...FEATURE_NAVIGATION,
  SETTINGS_ENTRY,
  ...SETTINGS_NAVIGATION,
  ...ACCOUNT_SETTINGS_NAVIGATION,
]);

export const isRouteExposed = (
  href: string,
  availableRoutes: readonly string[] = EXPOSED_ROUTE_PATHS
): boolean => availableRoutes.includes(href);

export const isNavigationItemActive = (
  pathname: string,
  item: Pick<NavigationItem, "href" | "exact">
): boolean => {
  if (item.exact || item.href === "/") return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
};
