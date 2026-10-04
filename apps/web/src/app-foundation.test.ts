import { access } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import {
  type AnchorHTMLAttributes,
  Children,
  createElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  readonly prefetch?: boolean;
};

import { THEMES } from "@darkfactory/state";

const layoutMocks = vi.hoisted(() => ({
  dispatchInternalOrpcRequest: vi.fn(),
  headers: vi.fn(async () => new Headers()),
  loadApiThemePreference: vi.fn(async () => undefined as unknown),
}));
const navigationMocks = vi.hoisted(() => ({
  pathname: "" as string | null,
}));
vi.mock("next/headers", () => ({ headers: layoutMocks.headers }));
vi.mock("./lib/server-theme-api.ts", () => ({
  loadApiThemePreference: layoutMocks.loadApiThemePreference,
}));
vi.mock("./lib/server-internal-dispatch.ts", () => ({
  dispatchInternalOrpcRequest: layoutMocks.dispatchInternalOrpcRequest,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => navigationMocks.pathname,
}));
vi.mock("next/link", () => ({
  default: ({ prefetch: _prefetch, ...props }: MockLinkProps) =>
    createElement("a", props),
}));
vi.mock("@darkfactory/ui/client/toaster", () => ({ Toaster: () => null }));
vi.mock("./components/theme-menu.tsx", () => ({
  ThemeMenu: () =>
    createElement("button", {
      "aria-label": "Appearance settings",
      type: "button",
    }),
  useAppearanceSelection: () => ({
    disabled: false,
    error: null,
    select: () => undefined,
    statusMessage: null,
    triggerLabel: "Appearance settings",
  }),
}));
vi.mock("@darkfactory/ui/client/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) =>
    createElement("div", {}, children),
  DialogContent: ({
    children,
    description,
    title,
  }: {
    children: ReactNode;
    description?: ReactNode;
    title: ReactNode;
  }) =>
    createElement(
      "section",
      {},
      createElement("h2", {}, title),
      description,
      children
    ),
  DialogTrigger: ({ children }: { children: ReactNode }) => children,
}));

import HomePage from "./app/(public)/page.tsx";
import RootLayout, {
  metadata,
  RootDocument,
  themeRootAttributes,
  viewport,
} from "./app/layout.tsx";
import robots from "./app/robots.ts";
import { GET as getThemeBootstrap } from "./app/theme-bootstrap.js/route.ts";
import { AuthShell } from "./components/auth-shell.tsx";
import { NavigationLinks } from "./components/navigation-links.tsx";
import {
  PortalShell,
  PortalSidebar,
  PortalTopbar,
} from "./components/portal-shell.tsx";
import {
  getPublicNavigationModel,
  PublicFooter,
  PublicShell,
} from "./components/public-shell.tsx";
import {
  ACCOUNT_NAVIGATION,
  ADMIN_NAVIGATION,
  ALL_NAVIGATION,
  AUTH_NAVIGATION,
  EXPOSED_ROUTE_PATHS,
  FEATURE_NAVIGATION,
  isNavigationItemActive,
  isRouteExposed,
  PORTAL_NAVIGATION,
  PUBLIC_NAVIGATION,
  ROUTE_PAGE_FILES,
  SUPPORT_NAVIGATION,
} from "./lib/navigation.ts";
import {
  INDETERMINATE_THEME,
  resolveRequestTheme,
} from "./lib/server-theme.ts";
import {
  DEFAULT_ANONYMOUS_THEME,
  MAX_COOKIE_HEADER_LENGTH,
  MAX_THEME_COOKIE_VALUE_LENGTH,
  parseThemeCookieHeader,
  serializeThemeCookie,
  shouldPersistAnonymousLocalState,
  THEME_BOOTSTRAP_PATH,
  THEME_BOOTSTRAP_SCRIPT,
  themeDomAttributes,
} from "./lib/theme.ts";
import {
  createAnonymousUiStateSnapshot,
  parseAnonymousThemePreference,
  parseAnonymousThemeSnapshot,
  serializeAnonymousThemePreference,
  UiStateProvider,
  useUiState,
  useUiStoreApi,
} from "./lib/ui-store.tsx";

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  layoutMocks.headers.mockResolvedValue(new Headers());
  layoutMocks.loadApiThemePreference.mockResolvedValue(undefined);
  return (navigationMocks.pathname = "");
});

const markup = (
  component: Parameters<typeof renderToStaticMarkup>[0]
): string => {
  return renderToStaticMarkup(component);
};

const withUiState = (children: ReactNode) =>
  createElement(UiStateProvider, {
    children,
    initialPreference: DEFAULT_ANONYMOUS_THEME,
  });

const UiStateProbe = () =>
  createElement(
    "span",
    {},
    useUiState((state) => `${state.theme}:${state.radius}`)
  );

const MissingUiStateProviderProbe = () => {
  useUiStoreApi();
  return null;
};

type PortalElement = ReactElement<{
  readonly availableRoutes?: readonly string[];
  readonly children?: ReactNode;
  readonly href?: string;
  readonly isAdmin?: boolean;
  readonly items?: readonly unknown[];
  readonly mobile?: boolean;
  readonly onNavigate?: (() => void) | undefined;
  readonly prefetch?: boolean;
}>;

const collectPortalElements = (
  node: ReactNode,
  predicate: (element: PortalElement) => boolean
): PortalElement[] => {
  if (!isValidElement<PortalElement["props"]>(node)) return [];
  const matches = predicate(node) ? [node] : [];
  for (const child of Children.toArray(node.props.children)) {
    matches.push(...collectPortalElements(child, predicate));
  }
  return matches;
};

const findPortalElement = (
  node: ReactNode,
  predicate: (element: PortalElement) => boolean
): PortalElement | undefined => collectPortalElements(node, predicate)[0];

const runThemeBootstrap = ({
  cookieStatus,
  dataset = {},
  serializedTheme,
}: {
  cookieStatus: "invalid" | "missing" | "valid";
  dataset?: Readonly<Record<string, string>>;
  serializedTheme?: string;
}) => {
  const documentElement = {
    dataset: {
      ...dataset,
      themeAuthority: "anonymous",
      themeCookieStatus: cookieStatus,
    } as Record<string, string>,
  };
  const windowObject: Record<string, unknown> = {};
  runInNewContext(THEME_BOOTSTRAP_SCRIPT, {
    document: { documentElement },
    localStorage: { getItem: () => serializedTheme ?? null },
    Object,
    window: windowObject,
  });
  return {
    dataset: documentElement.dataset,
    snapshot: windowObject["__DARKFACTORY_THEME__"],
  };
};

const ROSE_PINE = {
  density: "compact",
  fontSize: "large",
  radius: "none",
  theme: "rose-pine",
} as const;
const ROSE_PINE_COOKIE = "darkfactory-theme=rose-pine%3Alarge%3Acompact%3Anone";
const LEGACY_THEME_COOKIE = "darkfactory-theme=dark%3Arose";

describe("application navigation manifest", () => {
  it("contains every public, portal, account, and admin destination exactly once per group", () => {
    expect(PUBLIC_NAVIGATION.map((item) => item.href)).toEqual([
      "/",
      "/features",
      "/solutions",
      "/resources",
      "/about",
      "/sign-in",
    ]);
    expect(PORTAL_NAVIGATION.map((item) => item.href)).toEqual(["/dashboard"]);
    expect(FEATURE_NAVIGATION.map((item) => item.href)).toEqual([
      "/feature-items",
    ]);
    expect(ACCOUNT_NAVIGATION.map((item) => item.href)).toEqual([
      "/account/profile",
      "/account/address",
      "/account/preferences",
      "/account/security",
    ]);
    expect(ADMIN_NAVIGATION.map((item) => item.href)).toEqual(["/admin/users"]);
    expect(SUPPORT_NAVIGATION.map((item) => item.href)).toEqual([
      "/contact",
      "/legal/privacy",
      "/legal/terms",
    ]);
    expect(AUTH_NAVIGATION.map((item) => item.href)).toEqual([
      "/sign-up",
      "/forgot-password",
      "/reset-password",
    ]);
    expect(new Set(ALL_NAVIGATION.map((item) => item.href)).size).toBe(
      ALL_NAVIGATION.length
    );

    for (const group of [
      PUBLIC_NAVIGATION,
      PORTAL_NAVIGATION,
      FEATURE_NAVIGATION,
      ACCOUNT_NAVIGATION,
      ADMIN_NAVIGATION,
    ]) {
      expect(new Set(group.map((item) => item.href)).size).toBe(group.length);
    }
  });

  it("maps every exposed destination to a real page while future definitions remain non-navigable", async () => {
    const exposedRoutes = ALL_NAVIGATION.filter((item) =>
      isRouteExposed(item.href)
    ).map((item) => item.href);
    // "/account" stays routable as a redirect to the profile page but is no longer a menu destination.
    expect([...exposedRoutes].sort()).toEqual(
      EXPOSED_ROUTE_PATHS.filter((route) => route !== "/account").sort()
    );
    expect(Object.keys(ROUTE_PAGE_FILES).sort()).toEqual(
      [...EXPOSED_ROUTE_PATHS].sort()
    );
    for (const pageFile of Object.values(ROUTE_PAGE_FILES)) {
      await expect(
        access(new URL(`./app/${pageFile}`, import.meta.url))
      ).resolves.toBeUndefined();
    }
  });

  return it("marks exact and nested destinations without falsely selecting sibling routes", () => {
    const dashboard = PORTAL_NAVIGATION[0];
    const featureItems = FEATURE_NAVIGATION[0];
    expect(dashboard).toBeDefined();
    expect(featureItems).toBeDefined();
    expect(isNavigationItemActive("/dashboard", dashboard!)).toBe(true);
    expect(
      isNavigationItemActive("/feature-items/example", featureItems!)
    ).toBe(true);
    expect(
      isNavigationItemActive("/feature-items-archive", featureItems!)
    ).toBe(false);
    return expect(isNavigationItemActive("/about", PUBLIC_NAVIGATION[0]!)).toBe(
      false
    );
  });
});

describe("root metadata and theme contract", () => {
  it("publishes metadata and resolves trusted server preference ahead of cookies", async () => {
    expect(metadata.title).toEqual({
      default: "DarkFactory",
      template: "%s | DarkFactory",
    });
    expect(metadata.description).toBe(
      "A modular, Postgres-first, AI-native application foundation."
    );
    expect(metadata.icons).toEqual({ icon: "/favicon.svg" });
    expect(viewport.colorScheme).toBe("light dark");
    expect(themeRootAttributes(DEFAULT_ANONYMOUS_THEME)).toEqual({
      "data-density": "default",
      "data-font-size": "default",
      "data-radius": "small",
      "data-theme": "system",
      "data-theme-authority": "anonymous",
      "data-theme-cookie-status": "missing",
    });
    expect(
      (await resolveRequestTheme({ cookieHeader: ROSE_PINE_COOKIE })).preference
    ).toEqual(ROSE_PINE);
    expect(
      await resolveRequestTheme({ cookieHeader: LEGACY_THEME_COOKIE })
    ).toEqual({
      authority: "anonymous",
      cookie: { status: "invalid" },
      preference: DEFAULT_ANONYMOUS_THEME,
    });
    expect(
      await resolveRequestTheme({
        cookieHeader: ROSE_PINE_COOKIE,
        loadTrustedPreference: async () => ({
          density: "comfortable",
          fontSize: "large",
          radius: "medium",
          theme: "catppuccin-latte",
          updatedAt: new Date("2026-01-01T00:00:00.000Z"),
        }),
      })
    ).toMatchObject({
      authority: "trusted",
      preference: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "catppuccin-latte",
      },
    });
    expect(
      (
        await resolveRequestTheme({
          cookieHeader: ROSE_PINE_COOKIE,
          loadTrustedPreference: async () => ({
            palette: "rose",
            themeMode: "dark",
          }),
        })
      ).preference
    ).toEqual(DEFAULT_ANONYMOUS_THEME);
    expect(
      (
        await resolveRequestTheme({
          cookieHeader: null,
          loadTrustedPreference: async () => ({
            density: "comfortable",
            fontSize: "large",
            radius: "medium",
            theme: "catppuccin-latte",
            unexpected: true,
            updatedAt: null,
          }),
        })
      ).preference
    ).toEqual(DEFAULT_ANONYMOUS_THEME);
    for (const malformedTrustedPreference of [
      null,
      "rose-pine:large:compact:none",
      [ROSE_PINE],
      {
        ...ROSE_PINE,
        theme: {
          toString() {
            throw new Error("must not coerce");
          },
        },
        updatedAt: null,
      },
      { ...ROSE_PINE, theme: Symbol("dark"), updatedAt: null },
      { ...ROSE_PINE, fontSize: { valueOf: null }, updatedAt: null },
      { ...ROSE_PINE, density: "dense", updatedAt: null },
      { ...ROSE_PINE, radius: "round", updatedAt: null },
      {
        density: "compact",
        fontSize: "large",
        radius: "none",
        themeMode: "dark",
        updatedAt: null,
      },
      { ...ROSE_PINE, updatedAt: "2026-01-01T00:00:00.000Z" },
      { ...ROSE_PINE, updatedAt: new Date(Number.NaN) },
    ]) {
      await expect(
        resolveRequestTheme({
          cookieHeader: ROSE_PINE_COOKIE,
          loadTrustedPreference: async () => malformedTrustedPreference,
        })
      ).resolves.toMatchObject({
        authority: "trusted",
        preference: DEFAULT_ANONYMOUS_THEME,
      });
    }
    expect(
      await resolveRequestTheme({
        cookieHeader: ROSE_PINE_COOKIE,
        loadTrustedPreference: async () => INDETERMINATE_THEME,
      })
    ).toMatchObject({
      authority: "indeterminate",
      preference: DEFAULT_ANONYMOUS_THEME,
    });
    expect(shouldPersistAnonymousLocalState("anonymous")).toBe(true);
    expect(shouldPersistAnonymousLocalState("trusted")).toBe(false);
    return expect(shouldPersistAnonymousLocalState("indeterminate")).toBe(
      false
    );
  });

  it("rejects malformed anonymous persistence and fails closed to canonical defaults", () => {
    for (const malformed of [
      null,
      "",
      "not-json",
      '{"version":1,"themeMode":"dark","palette":"rose"}',
      '{"version":1,"theme":"rose-pine","fontSize":"large","density":"compact","radius":"none"}',
      '{"version":2,"theme":"rose-pine","fontSize":"large","density":"compact"}',
      '{"version":2,"theme":"night","fontSize":"large","density":"compact","radius":"none"}',
      '{"version":2,"theme":"rose-pine","fontSize":"huge","density":"compact","radius":"none"}',
      '{"version":2,"theme":"rose-pine","fontSize":"large","density":"compact","sidebar":"expanded"}',
      '{"version":2,"theme":"rose-pine","fontSize":"large","density":"compact","radius":"none","mobileNavigationOpen":true}',
      '{"version":2,"state":{"sidebar":"expanded","mobileNavigationOpen":true,"theme":"rose-pine","fontSize":"large","density":"compact","radius":"none","consent":"unknown"}}',
    ]) {
      expect(parseAnonymousThemePreference(malformed)).toEqual(
        DEFAULT_ANONYMOUS_THEME
      );
    }
    const serialized = serializeAnonymousThemePreference(ROSE_PINE);
    expect(JSON.parse(serialized)).toEqual({ version: 2, ...ROSE_PINE });
    expect(serialized).not.toContain("mobileNavigationOpen");
    expect(serialized).not.toContain("sidebar");
    return expect(parseAnonymousThemePreference(serialized)).toEqual({
      density: "compact",
      fontSize: "large",
      radius: "none",
      theme: "rose-pine",
    });
  });

  it("accepts one bounded canonical preference cookie and rejects malformed, oversized, or duplicate values", () => {
    expect(parseThemeCookieHeader(`other=1; ${ROSE_PINE_COOKIE}`)).toEqual({
      preference: ROSE_PINE,
      status: "valid",
    });
    expect(
      parseThemeCookieHeader(`other=${"x".repeat(5000)}; ${ROSE_PINE_COOKIE}`)
    ).toEqual({
      preference: ROSE_PINE,
      status: "valid",
    });
    expect(parseThemeCookieHeader("other=1")).toEqual({ status: "missing" });
    for (const malformed of [
      LEGACY_THEME_COOKIE,
      "darkfactory-theme=dark",
      "darkfactory-theme=night%3Alarge%3Acompact%3Anone",
      "darkfactory-theme=rose-pine%3Ahuge%3Acompact%3Anone",
      "darkfactory-theme=rose-pine%3Alarge%3Adense%3Anone",
      "darkfactory-theme=rose-pine%3Alarge%3Acompact%3Around",
      "darkfactory-theme=rose-pine%3Alarge%3Acompact%3Anone%3Aextra",
      "darkfactory-theme=%E0%A4%A",
      `${ROSE_PINE_COOKIE}; darkfactory-theme=system%3Adefault%3Adefault%3Asmall`,
      `darkfactory-theme=${"x".repeat(MAX_THEME_COOKIE_VALUE_LENGTH + 1)}`,
      "x".repeat(MAX_COOKIE_HEADER_LENGTH + 1),
    ]) {
      expect(parseThemeCookieHeader(malformed)).toEqual({ status: "invalid" });
    }
    expect(serializeThemeCookie(ROSE_PINE)).toBe(
      `${ROSE_PINE_COOKIE}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`
    );
    return expect(createAnonymousUiStateSnapshot(ROSE_PINE)).toEqual({
      state: {
        consent: "unknown",
        density: "compact",
        fontSize: "large",
        mobileNavigationOpen: false,
        radius: "none",
        sidebar: "expanded",
        theme: "rose-pine",
      },
      version: 2,
    });
  });

  it("uses a CSP-safe parser-blocking DF-088 bootstrap with no inline style escape hatch", async () => {
    const response = getThemeBootstrap();
    expect(response.headers.get("Content-Type")).toBe(
      "text/javascript; charset=utf-8"
    );
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(await response.text()).toBe(THEME_BOOTSTRAP_SCRIPT);
    expect(THEME_BOOTSTRAP_SCRIPT).not.toContain("document.cookie");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("themeCookieStatus");
    const storedTheme = JSON.stringify({
      density: "compact",
      fontSize: "small",
      radius: "medium",
      theme: "nord",
      version: 2,
    });
    const nord = {
      density: "compact",
      fontSize: "small",
      radius: "medium",
      theme: "nord",
    };
    expect(
      runThemeBootstrap({
        cookieStatus: "missing",
        serializedTheme: storedTheme,
      })
    ).toEqual({
      dataset: {
        ...nord,
        themeAuthority: "anonymous",
        themeCookieStatus: "missing",
      },
      snapshot: { ...nord, source: "localStorage" },
    });
    expect(
      runThemeBootstrap({
        cookieStatus: "invalid",
        serializedTheme: storedTheme,
      })
    ).toMatchObject({
      dataset: DEFAULT_ANONYMOUS_THEME,
      snapshot: { ...DEFAULT_ANONYMOUS_THEME, source: "server" },
    });
    expect(
      runThemeBootstrap({
        cookieStatus: "valid",
        dataset: ROSE_PINE,
        serializedTheme: storedTheme,
      })
    ).toMatchObject({
      dataset: ROSE_PINE,
      snapshot: { ...ROSE_PINE, source: "cookie" },
    });
    expect(
      runThemeBootstrap({
        cookieStatus: "missing",
        dataset: { ...ROSE_PINE, fontSize: "huge", radius: "round" },
      })
    ).toMatchObject({
      dataset: { ...ROSE_PINE, fontSize: "default", radius: "small" },
      snapshot: {
        ...ROSE_PINE,
        fontSize: "default",
        radius: "small",
        source: "server",
      },
    });
    for (const legacyOrInvalidSnapshot of [
      '{"version":1,"themeMode":"dark","palette":"blue"}',
      JSON.stringify({ ...nord, version: 1 }),
      JSON.stringify({ ...nord, theme: "night", version: 2 }),
      JSON.stringify({ ...nord, extra: true, version: 2 }),
      JSON.stringify({ fontSize: "small", theme: "nord", version: 2 }),
      JSON.stringify({ ...nord, radius: "x".repeat(128), version: 2 }),
      "null",
      "not-json",
      "",
    ]) {
      expect(
        runThemeBootstrap({
          cookieStatus: "missing",
          dataset: ROSE_PINE,
          serializedTheme: legacyOrInvalidSnapshot,
        })
      ).toMatchObject({
        dataset: ROSE_PINE,
        snapshot: { ...ROSE_PINE, source: "server" },
      });
    }

    const html = markup(
      createElement(RootDocument, {
        children: createElement("main", { id: "main-content" }),
        initialTheme: ROSE_PINE,
      })
    );
    expect(html).toContain('data-theme="rose-pine"');
    expect(html).toContain('data-font-size="large"');
    expect(html).toContain('data-density="compact"');
    expect(html).toContain('data-radius="none"');
    expect(html).toContain(`src="${THEME_BOOTSTRAP_PATH}"`);
    expect(html).not.toContain("document.documentElement");
    expect(html).not.toContain("style=");
    return expect(html).not.toContain("unsafe-inline");
  });

  it("applies every canonical theme through independent root data attributes", () => {
    for (const theme of THEMES) {
      expect(themeDomAttributes({ ...ROSE_PINE, theme })).toEqual({
        "data-density": "compact",
        "data-font-size": "large",
        "data-radius": "none",
        "data-theme": theme,
      });
    }

    return expect(
      themeRootAttributes(ROSE_PINE, "trusted", "valid")
    ).toMatchObject({
      "data-theme": "rose-pine",
      "data-theme-authority": "trusted",
      "data-theme-cookie-status": "valid",
    });
  });

  return it("keeps private, portal, authentication, admin, and API routes out of robots", () =>
    expect(robots().rules.disallow).toEqual([
      "/account",
      "/account/",
      "/admin/",
      "/api/",
      "/dashboard",
      "/feature-items",
      "/forgot-password",
      "/reset-password",
      "/sign-in",
      "/sign-up",
    ]));
});
describe("shared shell semantics", () => {
  it("renders exposed public navigation without guessing the active SSR link", () => {
    const html = markup(
      createElement(RootDocument, {
        children: createElement(PublicShell, {
          children: createElement("h1", {}, "Public page"),
        }),
        initialTheme: DEFAULT_ANONYMOUS_THEME,
      })
    );
    expect(html).not.toContain("aria-current");
    expect(html.match(/href="#main-content"/g)).toHaveLength(1);
    expect(html.match(/id="main-content"/g)).toHaveLength(1);
    expect(html.match(/<main/g)).toHaveLength(1);
    expect(html).toContain('href="/sign-in"');
    expect(html).toContain('aria-label="Primary navigation"');
    expect(html).toContain('aria-label="Footer navigation"');
    expect(html).toContain('aria-label="Open navigation"');
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/legal/privacy"');
    expect(html).toContain('href="/legal/terms"');
    expect(getPublicNavigationModel(["/"]).showNavigation).toBe(false);
    const fanout = getPublicNavigationModel(["/", "/sign-in"]);
    expect(fanout.showNavigation).toBe(true);
    expect(fanout.primary.map((item) => item.href)).toEqual(["/"]);
    expect(fanout.support).toEqual([]);
    expect(fanout.all.map((item) => item.href)).toEqual(["/", "/sign-in"]);
    expect(fanout.signIn?.href).toBe("/sign-in");
    const fanoutHtml = markup(
      withUiState(
        createElement(PublicShell, {
          availableRoutes: ["/", "/sign-in"],
          children: createElement("h1", {}, "Public page"),
        })
      )
    );
    expect(fanoutHtml).toContain('aria-label="Primary navigation"');
    expect(fanoutHtml).toContain('aria-label="Open navigation"');
    expect(fanoutHtml.match(/href="\/sign-in"/g)).toHaveLength(2);
    expect(fanoutHtml).not.toContain('href="/contact"');
    expect(fanoutHtml).not.toContain('href="/legal/privacy"');
    return expect(fanoutHtml).not.toContain('href="/legal/terms"');
  });
  it("renders an explicitly active link with accessible current-page state", () => {
    const dashboard = PORTAL_NAVIGATION[0];
    expect(dashboard).toBeDefined();
    const html = markup(
      createElement(NavigationLinks, {
        currentPath: "/dashboard",
        items: [dashboard!],
        orientation: "vertical",
        showIcons: true,
      })
    );
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("bg-primary-subtle");
    return expect(html).toContain(", current page");
  });

  it("disables prefetch for every desktop and mobile authenticated navigation group", () => {
    const availableRoutes = [
      PORTAL_NAVIGATION[0]!.href,
      FEATURE_NAVIGATION[0]!.href,
      ACCOUNT_NAVIGATION[0]!.href,
      ADMIN_NAVIGATION[0]!.href,
    ];
    const portalTrees = [
      PortalSidebar({ availableRoutes }),
      PortalTopbar({
        availableRoutes,
        isAdmin: true,
        userName: "Ada Lovelace",
      }),
    ];
    const navigationGroups = portalTrees.flatMap((tree, index) => {
      const navigation = findPortalElement(
        tree,
        (element) =>
          typeof element.type === "function" &&
          element.props.availableRoutes === availableRoutes &&
          element.props.mobile === (index === 1 ? true : undefined)
      );
      expect(navigation).toBeDefined();
      if (navigation === undefined || typeof navigation.type !== "function") {
        throw new Error("Expected portal navigation");
      }
      const renderNavigation = navigation.type as (
        props: PortalElement["props"]
      ) => ReactNode;
      return collectPortalElements(
        renderNavigation(navigation.props),
        (element) => element.type === NavigationLinks
      );
    });

    expect(navigationGroups).toHaveLength(2);
    expect(navigationGroups.map((group) => group.props.items)).toEqual([
      [PORTAL_NAVIGATION[0]],
      [PORTAL_NAVIGATION[0]],
    ]);
    return expect(
      navigationGroups.every((group) => group.props.prefetch === false)
    ).toBe(true);
  });

  it("forwards an explicit prefetch value to every link without changing public defaults", () => {
    const items = [PORTAL_NAVIGATION[0]!, ACCOUNT_NAVIGATION[0]!];
    const privateLinks = collectPortalElements(
      NavigationLinks({ items, prefetch: false }),
      (element) => typeof element.props.href === "string"
    );
    expect(privateLinks).toHaveLength(items.length);
    expect(privateLinks.every((link) => link.props.prefetch === false)).toBe(
      true
    );

    const publicGroups = collectPortalElements(
      PublicFooter({ availableRoutes: EXPOSED_ROUTE_PATHS }),
      (element) => element.type === NavigationLinks
    );
    expect(publicGroups.length).toBeGreaterThan(0);
    expect(
      publicGroups.every((group) => group.props.prefetch === undefined)
    ).toBe(true);
    const publicLinks = publicGroups.flatMap((group) =>
      collectPortalElements(
        NavigationLinks(group.props as Parameters<typeof NavigationLinks>[0]),
        (element) => typeof element.props.href === "string"
      )
    );
    expect(publicLinks.length).toBeGreaterThan(0);
    return expect(
      publicLinks.every((link) => link.props.prefetch === undefined)
    ).toBe(true);
  });

  it("leaves links inactive when neither the caller nor framework supplies a path", () => {
    navigationMocks.pathname = null;
    const dashboard = PORTAL_NAVIGATION[0];
    expect(dashboard).toBeDefined();

    const html = markup(
      createElement(NavigationLinks, {
        items: [dashboard!],
      })
    );

    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain("aria-current");
    return expect(html).not.toContain(", current page");
  });

  it("links the hero CTA to a substantive, focusable capability section", () => {
    const home = markup(createElement(HomePage));
    expect(home).toContain('href="#foundation-capabilities"');
    expect(home).toContain('id="foundation-capabilities"');
    expect(home).toContain('tabindex="-1"');
    expect(home).toContain("<h2");
    expect(home).toContain("<dl");
    expect(home).toContain("Contract-first core");
    expect(home).toContain("Replaceable boundaries");
    return expect(home).toContain("Observable operations");
  });

  it("renders portal and auth shells with semantic role-gated landmarks", () => {
    const portal = markup(
      withUiState(
        createElement(PortalShell, {
          children: createElement("h1", {}, "Portal page"),
          userName: "Ada Lovelace",
        })
      )
    );
    const portalNavigationTrigger = portal.match(
      /<button[^>]*aria-label="Open portal navigation"[^>]*>/
    )?.[0];
    const userMenuTrigger = portal.match(
      /<button[^>]*id="user-menu-trigger"[^>]*>/
    )?.[0];
    const auth = markup(
      withUiState(
        createElement(AuthShell, {
          children: createElement("h1", {}, "Sign in"),
        })
      )
    );
    expect(portal.match(/id="main-content"/g)).toHaveLength(1);
    expect(portal).toContain("<aside");
    expect(portal).toContain('popoverTarget="portal-navigation"');
    expect(portal).toContain('popover="auto"');
    expect(portal).toContain('popoverTargetAction="hide"');
    expect(portal).toMatch(/aria-label="Open portal navigation"/);
    expect(portal).not.toMatch(
      /aria-label="Open portal navigation"[^>]*\sdisabled(?:=|>|\s)/
    );
    expect(portalNavigationTrigger).not.toContain("data-hydration-state");
    expect(portal).toContain('aria-label="Portal navigation"');
    expect(portal).toContain('aria-label="Mobile portal navigation"');
    expect(portal.match(/href="\/dashboard"/g)).toHaveLength(2);
    expect(portal).toContain("Overview");
    expect(userMenuTrigger).toContain('data-hydration-state="pending"');
    expect(portal).toContain(">AL</span>");
    expect(portal).toContain(">Ada Lovelace</span>");
    // Feature, account, admin and sign-out entries live in the closed user menu.
    expect(portal).not.toContain('href="/feature-items"');
    expect(portal).not.toContain('href="/account/security"');
    expect(portal).not.toContain("<span>Sign out</span>");
    expect(portal).not.toContain("authenticated");
    expect(auth.match(/id="main-content"/g)).toHaveLength(1);
    expect(portal).not.toContain('href="/admin/users"');
    const adminPortal = markup(
      withUiState(
        createElement(PortalShell, {
          availableRoutes: ["/admin/users"],
          children: createElement("h1", {}, "Admin portal"),
          isAdmin: true,
          userName: "Grace Hopper",
        })
      )
    );
    expect(adminPortal).toContain(">GH</span>");
    expect(adminPortal).not.toContain('aria-label="Portal navigation"');
    expect(adminPortal).not.toContain('href="/admin/users"');
    expect(adminPortal).not.toContain('href="/dashboard"');
    expect(adminPortal).not.toContain('href="/account"');
    expect(adminPortal).not.toContain('href="/feature-items"');
    return expect(auth).toContain("<main");
  });

  it("keeps the portal shell useful while no destinations are exposed", () => {
    const portal = markup(
      withUiState(
        createElement(PortalShell, {
          availableRoutes: [],
          children: createElement("h1", {}, "Unavailable portal"),
          userName: "Ada Lovelace",
        })
      )
    );

    expect(portal).toContain("Unavailable portal");
    expect(portal).toContain('id="user-menu-trigger"');
    expect(portal).not.toContain('aria-label="Portal navigation"');
    expect(portal).not.toContain('aria-label="Mobile portal navigation"');
    return expect(portal).not.toContain('href="/dashboard"');
  });

  return it("closes mobile navigation only when the popover exposes a hide method", () => {
    const mobileNavigation = findPortalElement(
      PortalTopbar({ availableRoutes: ["/dashboard"], userName: "Ada" }),
      (element) => element.props.mobile === true
    );
    expect(mobileNavigation).toBeDefined();
    if (
      mobileNavigation === undefined ||
      typeof mobileNavigation.type !== "function"
    ) {
      throw new Error("Expected the mobile portal navigation component");
    }
    const renderNavigation = mobileNavigation.type as (
      props: PortalElement["props"]
    ) => ReactNode;
    const navigationTree = renderNavigation(mobileNavigation.props);
    const links = findPortalElement(
      navigationTree,
      (element) => element.type === NavigationLinks
    );
    expect(links).toBeDefined();
    const onNavigate = links?.props.onNavigate;
    if (onNavigate === undefined) {
      throw new Error("Expected mobile navigation links to close the popover");
    }

    const hidePopover = vi.fn();
    const popover = { hidePopover };
    const getElementById = vi.fn(
      (): { readonly hidePopover: unknown } | null => popover
    );
    getElementById.mockReturnValueOnce(popover);
    getElementById.mockReturnValueOnce(null);
    getElementById.mockReturnValueOnce({ hidePopover: "not callable" });
    vi.stubGlobal("document", { getElementById });

    try {
      onNavigate();
      expect(() => onNavigate()).not.toThrow();
      expect(() => onNavigate()).not.toThrow();
      expect(getElementById).toHaveBeenCalledTimes(3);
      expect(getElementById).toHaveBeenNthCalledWith(1, "portal-navigation");
      expect(getElementById).toHaveBeenNthCalledWith(2, "portal-navigation");
      expect(getElementById).toHaveBeenNthCalledWith(3, "portal-navigation");
      expect(hidePopover).toHaveBeenCalledOnce();
      expect(hidePopover.mock.contexts[0]).toBe(popover);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("root layout request composition", () => {
  it("loads the trusted request theme with bounded request identity", async () => {
    vi.stubEnv("APP_URL", "https://darkfactory.example");
    layoutMocks.headers.mockResolvedValueOnce(
      new Headers({
        cookie: ROSE_PINE_COOKIE,
        "x-request-id": "request-layout",
      })
    );
    layoutMocks.loadApiThemePreference.mockResolvedValueOnce({
      density: "comfortable",
      fontSize: "large",
      radius: "medium",
      theme: "catppuccin-latte",
      updatedAt: null,
    });

    const result = await RootLayout({ children: "protected content" });

    expect(layoutMocks.loadApiThemePreference).toHaveBeenCalledWith({
      appUrl: new URL("https://darkfactory.example"),
      cookieHeader: ROSE_PINE_COOKIE,
      fetch: layoutMocks.dispatchInternalOrpcRequest,
      requestId: "request-layout",
    });
    expect(result.type).toBe(RootDocument);
    return expect(result.props).toMatchObject({
      children: "protected content",
      cookieStatus: "valid",
      initialTheme: {
        density: "comfortable",
        fontSize: "large",
        radius: "medium",
        theme: "catppuccin-latte",
      },
      themeAuthority: "trusted",
    });
  });

  return it("uses the canonical origin for blank configuration and rejects HTTP", async () => {
    vi.stubEnv("APP_URL", "   ");
    const canonical = await RootLayout({ children: "canonical" });

    expect(canonical.type).toBe(RootDocument);
    expect(layoutMocks.loadApiThemePreference).toHaveBeenCalledWith(
      expect.objectContaining({
        appUrl: new URL("https://darkfactory.localhost"),
      })
    );

    vi.stubEnv("APP_URL", "http://darkfactory.localhost");
    return await expect(RootLayout({ children: "insecure" })).rejects.toThrow(
      "APP_URL must use HTTPS"
    );
  });
});

describe("theme and UI runtime boundaries", () => {
  it("rejects anonymous snapshot type, size, shape, and version mismatches", () => {
    for (const malformed of [
      1,
      "x".repeat(129),
      "[]",
      '{"version":1,"themeMode":"dark","palette":"rose"}',
      JSON.stringify({ version: 1, ...ROSE_PINE }),
      JSON.stringify({ version: 2, ...ROSE_PINE, extra: true }),
      JSON.stringify({ version: 2, ...ROSE_PINE, radius: "round" }),
    ]) {
      expect(parseAnonymousThemeSnapshot(malformed)).toBeNull();
    }
    return expect(
      parseAnonymousThemeSnapshot(JSON.stringify({ version: 2, ...ROSE_PINE }))
    ).toEqual({ version: 2, ...ROSE_PINE });
  });

  it("requires provider context and projects selected state through the store hook", () => {
    expect(() => markup(createElement(MissingUiStateProviderProbe))).toThrow(
      "UiStateProvider is required."
    );
    return expect(markup(withUiState(createElement(UiStateProbe)))).toContain(
      "system:small"
    );
  });

  it("covers missing, malformed, empty, and extra-field theme cookies", () => {
    for (const missing of [undefined, null, ""]) {
      expect(parseThemeCookieHeader(missing)).toEqual({ status: "missing" });
    }
    for (const malformed of [
      {},
      "darkfactory-theme",
      "darkfactory-theme=",
      "darkfactory-theme=dark%3Arose%3Aextra",
      "darkfactory-theme=rose-pine%3Alarge%3Acompact",
    ]) {
      expect(parseThemeCookieHeader(malformed)).toEqual({ status: "invalid" });
    }
    return expect(
      parseThemeCookieHeader(
        `other=value; ${ROSE_PINE_COOKIE}; preference=ignored`
      )
    ).toEqual({
      preference: ROSE_PINE,
      status: "valid",
    });
  });

  it("fails closed for non-record and invalid-date trusted preferences", async () => {
    for (const preference of [
      null,
      [],
      {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
        updatedAt: new Date(Number.NaN),
      },
      {
        density: "compact",
        fontSize: "large",
        radius: "none",
        theme: "rose-pine",
        updatedAt: "2026-07-25T00:00:00.000Z",
      },
    ]) {
      await expect(
        resolveRequestTheme({
          cookieHeader: null,
          loadTrustedPreference: async () => preference,
        })
      ).resolves.toMatchObject({
        authority: "trusted",
        preference: DEFAULT_ANONYMOUS_THEME,
      });
    }
  });

  return it("evaluates route exposure against an explicit runtime manifest", () => {
    expect(isRouteExposed("/future", ["/future"])).toBe(true);
    return expect(isRouteExposed("/future", [])).toBe(false);
  });
});
