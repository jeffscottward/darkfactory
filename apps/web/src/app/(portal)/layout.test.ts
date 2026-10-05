import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestPortalSession: vi.fn(),
  headers: vi.fn(
    async () =>
      new Headers({
        "cf-connecting-ip": "203.0.113.42",
        cookie: "better-auth.session_token=opaque",
        "x-pathname": "/feature-items",
      })
  ),
  portalSignInHref: vi.fn(() => "/sign-in?callbackURL=%2Ffeature-items"),
  redirect: vi.fn((href: string) => {
    throw new Error(`REDIRECT:${href}`);
  }),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../lib/request-portal-session.ts", () => ({
  getRequestPortalSession: mocks.getRequestPortalSession,
}));
vi.mock("../../lib/server-session.ts", () => ({
  portalSignInHref: mocks.portalSignInHref,
}));
vi.mock("../../components/portal-shell.tsx", () => ({
  PortalShell: "portal-shell",
}));

import { AddressPageClient } from "../../components/account/address-page-client.tsx";
import { PreferencesPageClient } from "../../components/account/preferences-page-client.tsx";
import { ProfilePageClient } from "../../components/account/profile-page-client.tsx";
import { SecurityPageClient } from "../../components/account/security-page-client.tsx";
import { AdminUsersPageClient } from "../../components/admin/admin-users-page-client.tsx";
import { FeatureItemCreateWorkflow } from "../../components/portal/feature-item-create-workflow.tsx";
import { FeatureItemEditor } from "../../components/portal/feature-item-editor.tsx";
import { FeatureItemsWorkspace } from "../../components/portal/feature-items-workspace.tsx";
import { AppearanceSettings } from "../../components/settings/appearance-settings.tsx";
import { SettingsNavigation } from "../../components/settings/settings-navigation.tsx";
import {
  ADMIN_PORTAL_ROUTE_PATHS,
  LEGACY_ROUTE_REDIRECTS,
  MEMBER_PORTAL_ROUTE_PATHS,
} from "../../lib/navigation.ts";
import LegacyAddressPage from "./account/address/page.ts";
import LegacyAccountPage from "./account/page.ts";
import LegacyPreferencesPage from "./account/preferences/page.ts";
import LegacyProfilePage from "./account/profile/page.ts";
import LegacySecurityPage from "./account/security/page.ts";
import LegacyAdminPage from "./admin/page.ts";
import LegacyAdminUsersPage from "./admin/users/page.ts";
import DashboardError from "./dashboard/error.tsx";
import DashboardLoading from "./dashboard/loading.tsx";
import FeatureItemPage, {
  metadata as featureItemMetadata,
} from "./feature-items/[id]/page.tsx";
import FeatureItemsError from "./feature-items/error.tsx";
import FeatureItemsLoading from "./feature-items/loading.tsx";
import NewFeatureItemPage, {
  metadata as newFeatureItemMetadata,
} from "./feature-items/new/page.tsx";
import FeatureItemsPage, {
  metadata as featureItemsMetadata,
} from "./feature-items/page.tsx";
import PortalLayout from "./layout.tsx";
import AddressSettingsPage from "./settings/account/address/page.tsx";
import AccountSettingsError from "./settings/account/error.tsx";
import AccountSettingsLayout from "./settings/account/layout.tsx";
import AccountSettingsLoading from "./settings/account/loading.tsx";
import AccountSettingsPage from "./settings/account/page.ts";
import PreferencesSettingsPage from "./settings/account/preferences/page.tsx";
import ProfileSettingsPage from "./settings/account/profile/page.tsx";
import SecuritySettingsPage from "./settings/account/security/page.tsx";
import AdministrationSettingsError from "./settings/administration/error.tsx";
import AdministrationSettingsLoading from "./settings/administration/loading.tsx";
import AdministrationSettingsPage from "./settings/administration/page.tsx";
import AppearanceSettingsPage from "./settings/appearance/page.tsx";
import SettingsLayout, {
  metadata as settingsMetadata,
} from "./settings/layout.tsx";
import SettingsPage from "./settings/page.ts";

type RuntimeElement = ReactElement<{
  readonly action?: ReactNode;
  readonly actions?: ReactNode;
  readonly availableRoutes?: readonly string[];
  readonly children?: ReactNode;
  readonly href?: string;
  readonly id?: string;
  readonly menu?: string;
  readonly onClick?: (() => void) | undefined;
  readonly title?: ReactNode;
}>;

const runtimeElements = (node: ReactNode): readonly RuntimeElement[] => {
  if (!isValidElement<RuntimeElement["props"]>(node)) return [];
  return [
    node,
    ...Children.toArray([
      node.props.children,
      node.props.action,
      node.props.actions,
    ]).flatMap(runtimeElements),
  ];
};

const runtimeElement = (
  node: ReactNode,
  type: RuntimeElement["type"]
): RuntimeElement | undefined => {
  return runtimeElements(node).find((element) => element.type === type);
};

beforeEach(() => vi.clearAllMocks());

describe("PortalLayout", () => {
  it("redirects an anonymous server request before returning protected content", async () => {
    mocks.getRequestPortalSession.mockResolvedValueOnce(null);

    await expect(PortalLayout({ children: "protected" })).rejects.toThrow(
      "REDIRECT:/sign-in?callbackURL=%2Ffeature-items"
    );
    expect(mocks.getRequestPortalSession).toHaveBeenCalledWith(
      "better-auth.session_token=opaque",
      "203.0.113.42"
    );
    return expect(mocks.redirect).toHaveBeenCalledOnce();
  });

  return it.each([
    ["member", false, MEMBER_PORTAL_ROUTE_PATHS],
    ["admin", true, ADMIN_PORTAL_ROUTE_PATHS],
  ])(
    "renders role-gated routes for an active %s session",
    async (role, isAdmin, availableRoutes) => {
      mocks.getRequestPortalSession.mockResolvedValueOnce({
        expiresAt: new Date("2030-01-01T00:00:00.000Z"),
        name: "Example User",
        role,
        status: "active",
        userId: "user-1",
      });

      const result = await PortalLayout({ children: "protected" });

      expect(result.type).toBe("portal-shell");
      expect(result.props.children).toBe("protected");
      expect(result.props.isAdmin).toBe(isAdmin);
      expect(result.props.userName).toBe("Example User");
      return expect(result.props.availableRoutes).toEqual(availableRoutes);
    }
  );
});

describe("portal route manifests", () =>
  it("gives members every portal page and administrators the Administration tab too", () => {
    expect(MEMBER_PORTAL_ROUTE_PATHS).toEqual([
      "/dashboard",
      "/feature-items",
      "/settings",
      "/settings/account",
      "/settings/account/profile",
      "/settings/account/address",
      "/settings/account/preferences",
      "/settings/account/security",
      "/settings/appearance",
    ]);
    return expect(ADMIN_PORTAL_ROUTE_PATHS).toEqual([
      ...MEMBER_PORTAL_ROUTE_PATHS,
      "/settings/administration",
    ]);
  }));

const activeSession = (role: "admin" | "member") => ({
  expiresAt: new Date("2030-01-01T00:00:00.000Z"),
  name: "Example User",
  role,
  status: "active",
  userId: "user-1",
});

describe("settings layout", () => {
  it("redirects an anonymous request to sign in", async () => {
    mocks.getRequestPortalSession.mockResolvedValueOnce(null);
    await expect(SettingsLayout({ children: "settings" })).rejects.toThrow(
      "REDIRECT:/sign-in?callbackURL=%2Ffeature-items"
    );
    return expect(mocks.getRequestPortalSession).toHaveBeenCalledWith(
      "better-auth.session_token=opaque",
      "203.0.113.42"
    );
  });

  return it.each([
    ["member", MEMBER_PORTAL_ROUTE_PATHS],
    ["admin", ADMIN_PORTAL_ROUTE_PATHS],
  ] as const)(
    "renders the Settings title and role-filtered tabs for a %s",
    async (role, availableRoutes) => {
      mocks.getRequestPortalSession.mockResolvedValueOnce(activeSession(role));
      const layout = await SettingsLayout({ children: "settings content" });
      const elements = runtimeElements(layout);
      expect(
        elements.some((element) => element.props.title === "Settings")
      ).toBe(true);
      const tabs = runtimeElement(layout, SettingsNavigation);
      expect(tabs?.props).toEqual({ availableRoutes, menu: "settings" });
      expect(
        elements.some(
          (element) => element.props.children === "settings content"
        )
      ).toBe(true);
      return expect(settingsMetadata).toEqual({ title: "Settings" });
    }
  );
});

describe("portal route leaf composition", () => {
  it("redirects the settings and account indexes to the profile section", () => {
    expect(() => SettingsPage()).toThrow("REDIRECT:/settings/account/profile");
    expect(() => AccountSettingsPage()).toThrow(
      "REDIRECT:/settings/account/profile"
    );
    return expect(mocks.redirect).toHaveBeenCalledTimes(2);
  });

  it("redirects every legacy account and admin URL to its settings tab", () => {
    const legacyPages = [
      ["/account", LegacyAccountPage],
      ["/account/profile", LegacyProfilePage],
      ["/account/address", LegacyAddressPage],
      ["/account/preferences", LegacyPreferencesPage],
      ["/account/security", LegacySecurityPage],
      ["/admin", LegacyAdminPage],
      ["/admin/users", LegacyAdminUsersPage],
    ] as const;
    for (const [path, Page] of legacyPages) {
      expect(() => Page()).toThrow(`REDIRECT:${LEGACY_ROUTE_REDIRECTS[path]}`);
    }
    expect(LEGACY_ROUTE_REDIRECTS).toEqual({
      "/account": "/settings/account/profile",
      "/account/address": "/settings/account/address",
      "/account/preferences": "/settings/account/preferences",
      "/account/profile": "/settings/account/profile",
      "/account/security": "/settings/account/security",
      "/admin": "/settings/administration",
      "/admin/users": "/settings/administration",
    });
    return expect(mocks.redirect).toHaveBeenCalledTimes(legacyPages.length);
  });

  it("renders the account sections navigation and every account client leaf", () => {
    const layout = AccountSettingsLayout({ children: "account content" });
    expect(runtimeElement(layout, SettingsNavigation)?.props).toEqual({
      menu: "account",
    });
    expect(
      runtimeElements(layout).some(
        (element) => element.props.children === "account content"
      )
    ).toBe(true);

    for (const [Page, Client, title] of [
      [AddressSettingsPage, AddressPageClient, "Addresses"],
      [PreferencesSettingsPage, PreferencesPageClient, "Preferences"],
      [ProfileSettingsPage, ProfilePageClient, "Profile"],
      [SecuritySettingsPage, SecurityPageClient, "Security"],
    ] as const) {
      const page = Page();
      expect(runtimeElement(page, Client)).toBeDefined();
      expect(
        runtimeElements(page).some((element) => element.props.title === title)
      ).toBe(true);
    }
  });

  it("renders the administration directory and the appearance form", () => {
    expect(
      runtimeElement(AdministrationSettingsPage(), AdminUsersPageClient)
    ).toBeDefined();
    return expect(
      runtimeElement(AppearanceSettingsPage(), AppearanceSettings)
    ).toBeDefined();
  });

  it("renders feature-item list, detail, and creation leaves with metadata", async () => {
    const list = FeatureItemsPage();
    expect(runtimeElement(list, FeatureItemsWorkspace)).toBeDefined();
    expect(
      runtimeElements(list).some(
        (element) =>
          element.type === "a" && element.props.href === "/feature-items/new"
      )
    ).toBe(true);

    const detail = await FeatureItemPage({
      params: Promise.resolve({ id: "item/with-delimiter" }),
    });
    expect(runtimeElement(detail, FeatureItemEditor)?.props.id).toBe(
      "item/with-delimiter"
    );

    const create = NewFeatureItemPage();
    expect(runtimeElement(create, FeatureItemCreateWorkflow)).toBeDefined();
    expect(featureItemsMetadata).toEqual({ title: "Feature items" });
    expect(featureItemMetadata).toEqual({ title: "Feature item details" });
    return expect(newFeatureItemMetadata).toEqual({
      title: "Create feature item",
    });
  });

  it("wires every portal error boundary to its supplied retry action", () => {
    const reset = vi.fn();
    const boundaries = [
      AccountSettingsError({ error: new Error("account"), reset }),
      AdministrationSettingsError({ error: new Error("admin"), reset }),
      DashboardError({ reset }),
      FeatureItemsError({ reset }),
    ];

    for (const boundary of boundaries) {
      const retry = runtimeElements(boundary).find(
        (element) => element.props.onClick === reset
      );
      expect(retry).toBeDefined();
      retry?.props.onClick?.();
    }
    return expect(reset).toHaveBeenCalledTimes(boundaries.length);
  });

  return it("announces every portal loading boundary without exposing live data", () => {
    for (const loading of [
      AccountSettingsLoading(),
      AdministrationSettingsLoading(),
      DashboardLoading(),
      FeatureItemsLoading(),
    ]) {
      expect(loading.props).toMatchObject({
        "aria-busy": "true",
        role: "status",
      });
    }
  });
});
