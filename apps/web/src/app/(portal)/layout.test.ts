import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(function() { return ({
  getRequestPortalSession: vi.fn(),
  headers: vi.fn(async function() { return new Headers({
    cookie: "better-auth.session_token=opaque",
    "cf-connecting-ip": "203.0.113.42",
    "x-pathname": "/feature-items",
  }) }),
  portalSignInHref: vi.fn(function() { return "/sign-in?callbackURL=%2Ffeature-items" }),
  redirect: vi.fn(function(href: string) {
    throw new Error(`REDIRECT:${href}`)
  }
  ),
}) })

vi.mock("next/headers", function() { return ({ headers: mocks.headers }) })
vi.mock("next/navigation", function() { return ({ redirect: mocks.redirect }) })
vi.mock("../../lib/request-portal-session.ts", function() { return ({
  getRequestPortalSession: mocks.getRequestPortalSession,
}) })
vi.mock("../../lib/server-session.ts", function() { return ({
  portalSignInHref: mocks.portalSignInHref,
}) })
vi.mock("../../components/portal-shell.tsx", function() { return ({
  PortalShell: "portal-shell",
}) })

import PortalLayout from "./layout.tsx"
import AccountPage from "./account/page.tsx"
import AccountError from "./account/error.tsx"
import AccountLayout from "./account/layout.tsx"
import AccountLoading from "./account/loading.tsx"
import AddressPage from "./account/address/page.tsx"
import PreferencesPage from "./account/preferences/page.tsx"
import ProfilePage from "./account/profile/page.tsx"
import SecurityPage from "./account/security/page.tsx"
import AdminError from "./admin/error.tsx"
import AdminLoading from "./admin/loading.tsx"
import AdminPage from "./admin/page.ts"
import AdminUsersPage from "./admin/users/page.tsx"
import DashboardError from "./dashboard/error.tsx"
import DashboardLoading from "./dashboard/loading.tsx"
import FeatureItemsError from "./feature-items/error.tsx"
import FeatureItemsLoading from "./feature-items/loading.tsx"
import FeatureItemsPage, {
  metadata as featureItemsMetadata,
} from "./feature-items/page.tsx"
import FeatureItemPage, {
  metadata as featureItemMetadata,
} from "./feature-items/[id]/page.tsx"
import NewFeatureItemPage, {
  metadata as newFeatureItemMetadata,
} from "./feature-items/new/page.tsx"
import { AccountNavigationClient } from "../../components/account/account-navigation-client.tsx"
import { AddressPageClient } from "../../components/account/address-page-client.tsx"
import { PreferencesPageClient } from "../../components/account/preferences-page-client.tsx"
import { ProfilePageClient } from "../../components/account/profile-page-client.tsx"
import { SecurityPageClient } from "../../components/account/security-page-client.tsx"
import { AdminUsersPageClient } from "../../components/admin/admin-users-page-client.tsx"
import { FeatureItemCreateWorkflow } from "../../components/portal/feature-item-create-workflow.tsx"
import { FeatureItemEditor } from "../../components/portal/feature-item-editor.tsx"
import { FeatureItemsWorkspace } from "../../components/portal/feature-items-workspace.tsx"

type RuntimeElement = ReactElement<{
  readonly action?: ReactNode
  readonly actions?: ReactNode
  readonly children?: ReactNode
  readonly href?: string
  readonly id?: string
  readonly onClick?: (() => void) | undefined
}>

const runtimeElements = (node: ReactNode): readonly RuntimeElement[] => {
  if (!isValidElement<RuntimeElement["props"]>(node)) return []
  return [
    node,
    ...Children.toArray([
      node.props.children,
      node.props.action,
      node.props.actions,
    ]).flatMap(runtimeElements),
  ]
}

const runtimeElement = (
  node: ReactNode,
  type: RuntimeElement["type"],
): RuntimeElement | undefined => {
  return runtimeElements(node).find((element) => element.type === type)
}

beforeEach(function() {
  return vi.clearAllMocks()
})

describe("PortalLayout", function() {
  it("redirects an anonymous server request before returning protected content", async function() {
    mocks.getRequestPortalSession.mockResolvedValueOnce(null)

    await expect(PortalLayout({ children: "protected" })).rejects.toThrow(
      "REDIRECT:/sign-in?callbackURL=%2Ffeature-items",
    )
    expect(mocks.getRequestPortalSession).toHaveBeenCalledWith(
      "better-auth.session_token=opaque",
      "203.0.113.42",
    )
    return expect(mocks.redirect).toHaveBeenCalledOnce()
  })
  
  return it.each([
    [
      "member",
      false,
      [
        "/dashboard",
        "/feature-items",
        "/account",
        "/account/profile",
        "/account/address",
        "/account/preferences",
        "/account/security",
      ],
    ],
    [
      "admin",
      true,
      [
        "/dashboard",
        "/feature-items",
        "/account",
        "/account/profile",
        "/account/address",
        "/account/preferences",
        "/account/security",
        "/admin/users",
      ],
    ],
  ])("renders role-gated routes for an active %s session", async function(role, isAdmin, availableRoutes) {
    mocks.getRequestPortalSession.mockResolvedValueOnce({
      userId: "user-1",
      name: "Example User",
      role,
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    })

    const result = await PortalLayout({ children: "protected" })

    expect(result.type).toBe("portal-shell")
    expect(result.props.children).toBe("protected")
    expect(result.props.isAdmin).toBe(isAdmin)
    return expect(result.props.availableRoutes).toEqual(availableRoutes)
  }
  )
})

describe("portal route leaf composition", function() {
  it("renders the account index, layout, and all account client leaves", function() {
    const account = AccountPage()
    expect(
      runtimeElements(account)
        .filter((element) => element.type === "a")
        .map((element) => element.props.href),
    ).toEqual([
      "/account/profile",
      "/account/address",
      "/account/preferences",
      "/account/security",
    ])

    const layout = AccountLayout({ children: "account content" })
    expect(runtimeElement(layout, AccountNavigationClient)).toBeDefined()
    expect(layout.props.children).toBeDefined()

    expect(runtimeElement(AddressPage(), AddressPageClient)).toBeDefined()
    expect(
      runtimeElement(PreferencesPage(), PreferencesPageClient),
    ).toBeDefined()
    expect(runtimeElement(ProfilePage(), ProfilePageClient)).toBeDefined()
    return expect(runtimeElement(SecurityPage(), SecurityPageClient)).toBeDefined()
  })

  it("renders feature-item list, detail, and creation leaves with metadata", async function() {
    const list = FeatureItemsPage()
    expect(runtimeElement(list, FeatureItemsWorkspace)).toBeDefined()
    expect(
      runtimeElements(list).some(function(element) {
        return element.type === "a" &&
          element.props.href === "/feature-items/new"
      }
      )
    ).toBe(true)

    const detail = await FeatureItemPage({
      params: Promise.resolve({ id: "item/with-delimiter" }),
    })
    expect(runtimeElement(detail, FeatureItemEditor)?.props.id).toBe(
      "item/with-delimiter",
    )

    const create = NewFeatureItemPage()
    expect(runtimeElement(create, FeatureItemCreateWorkflow)).toBeDefined()
    expect(featureItemsMetadata).toEqual({ title: "Feature items" })
    expect(featureItemMetadata).toEqual({ title: "Feature item details" })
    return expect(newFeatureItemMetadata).toEqual({ title: "Create feature item" })
  })

  it("renders the administrator directory and redirects its index", function() {
    expect(runtimeElement(AdminUsersPage(), AdminUsersPageClient)).toBeDefined()
    expect(() => AdminPage()).toThrow("REDIRECT:/admin/users")
    return expect(mocks.redirect).toHaveBeenCalledWith("/admin/users")
  })

  it("wires every portal error boundary to its supplied retry action", function() {
    const reset = vi.fn()
    const boundaries = [
      AccountError({ error: new Error("account"), reset }),
      AdminError({ error: new Error("admin"), reset }),
      DashboardError({ reset }),
      FeatureItemsError({ reset }),
    ]

    for (const boundary of boundaries) {
      const retry = runtimeElements(boundary).find(
        (element) => element.props.onClick === reset,
      )
      expect(retry).toBeDefined()
      retry?.props.onClick?.()
    }
    return expect(reset).toHaveBeenCalledTimes(boundaries.length)
  })

  return it("announces every portal loading boundary without exposing live data", function() {
    const results=[];for (const loading of [
      AccountLoading(),
      AdminLoading(),
      DashboardLoading(),
      FeatureItemsLoading(),
    ]) {
      results.push(expect(loading.props).toMatchObject({
        "aria-busy": "true",
        role: "status",
      }))
    };return results;
  })
})
