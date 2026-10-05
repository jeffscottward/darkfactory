import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { PortalShell } from "../../components/portal-shell.tsx";
import {
  ADMIN_PORTAL_ROUTE_PATHS,
  MEMBER_PORTAL_ROUTE_PATHS,
} from "../../lib/navigation.ts";
import { getRequestPortalSession } from "../../lib/request-portal-session.ts";
import { portalSignInHref } from "../../lib/server-session.ts";

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
      availableRoutes={
        isAdmin ? ADMIN_PORTAL_ROUTE_PATHS : MEMBER_PORTAL_ROUTE_PATHS
      }
      isAdmin={isAdmin}
      userName={session.name}
    >
      {children}
    </PortalShell>
  );
}
