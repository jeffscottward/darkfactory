import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PortalShell } from "../../components/portal-shell.tsx";
import { getRequestPortalSession } from "../../lib/request-portal-session.ts";
import { portalSignInHref } from "../../lib/server-session.ts";

const MEMBER_PORTAL_ROUTES = Object.freeze([
  "/dashboard",
  "/feature-items",
  "/account",
  "/account/profile",
  "/account/address",
  "/account/preferences",
  "/account/security",
] as const);

const ADMIN_PORTAL_ROUTES = Object.freeze([
  ...MEMBER_PORTAL_ROUTES,
  "/admin/users",
] as const);

export default async function PortalLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getRequestPortalSession(
    requestHeaders.get("cookie"),
    requestHeaders.get("cf-connecting-ip")
  );

  if (session === null) redirect(portalSignInHref(requestHeaders));

  const isAdmin = session.role === "admin";
  return (
    <PortalShell
      availableRoutes={isAdmin ? ADMIN_PORTAL_ROUTES : MEMBER_PORTAL_ROUTES}
      isAdmin={isAdmin}
      userName={session.name}
    >
      {children}
    </PortalShell>
  );
}
