import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRequestPortalSession: vi.fn(),
  headers: vi.fn(
    async () =>
      new Headers({
        cookie: "better-auth.session_token=opaque",
        "cf-connecting-ip": "203.0.113.42",
        "x-pathname": "/admin/users",
      })
  ),
  portalSignInHref: vi.fn(() => "/sign-in?callbackURL=%2Fadmin%2Fusers"),
  redirect: vi.fn(),
}));

vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("../../../lib/request-portal-session.ts", () => ({
  getRequestPortalSession: mocks.getRequestPortalSession,
}));
vi.mock("../../../lib/server-session.ts", () => ({
  portalSignInHref: mocks.portalSignInHref,
}));

import AdminLayout from "./layout.tsx";

describe("server-authorized admin layout", function () {
  beforeEach(function () {
    mocks.getRequestPortalSession.mockReset();
    mocks.headers.mockResolvedValue(
      new Headers({
        cookie: "better-auth.session_token=opaque",
        "cf-connecting-ip": "203.0.113.42",
        "x-pathname": "/admin/users",
      })
    );
    mocks.portalSignInHref.mockReturnValue(
      "/sign-in?callbackURL=%2Fadmin%2Fusers"
    );
    return mocks.redirect.mockReset();
  });

  it("fails closed for an anonymous direct request", async function () {
    mocks.getRequestPortalSession.mockResolvedValueOnce(null);
    await AdminLayout({ children: "private directory" });
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/sign-in?callbackURL=%2Fadmin%2Fusers"
    );
    return expect(mocks.getRequestPortalSession).toHaveBeenCalledWith(
      "better-auth.session_token=opaque",
      "203.0.113.42"
    );
  });

  it("fails closed for a member before rendering admin content", async function () {
    mocks.getRequestPortalSession.mockResolvedValueOnce({
      userId: "member-1",
      name: "Example Member",
      role: "member",
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    await AdminLayout({ children: "private directory" });
    return expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  return it("renders read-only admin content for a trusted active admin", async function () {
    mocks.getRequestPortalSession.mockResolvedValueOnce({
      userId: "admin-1",
      name: "Example Admin",
      role: "admin",
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    });
    const result = await AdminLayout({ children: "private directory" });
    expect(result.props.children).toBe("private directory");
    return expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
