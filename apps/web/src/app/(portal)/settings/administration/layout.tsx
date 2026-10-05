// What: Server guard for the Administration settings tab: anonymous requests sign in, members return to their account settings.
// Used by: apps/web/src/app/(portal)/settings/administration/page.tsx.
// See: packages/api/src/contracts/admin-users.ts (the API enforces the same rule).
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { SETTINGS_HOME_PATH } from "../../../../lib/navigation.ts";
import { getRequestPortalSession } from "../../../../lib/request-portal-session.ts";
import { portalSignInHref } from "../../../../lib/server-session.ts";

export default async function AdministrationSettingsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const requestHeaders = await headers();
  const session = await getRequestPortalSession(
    requestHeaders.get("cookie"),
    requestHeaders.get("cf-connecting-ip")
  );
  if (session === null) {
    return redirect(portalSignInHref(requestHeaders));
  }
  if (session.role !== "admin") {
    return redirect(SETTINGS_HOME_PATH);
  }
  return <>{children}</>;
}
