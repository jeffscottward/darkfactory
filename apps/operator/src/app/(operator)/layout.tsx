import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { OperatorShell } from "../../components/operator-shell.tsx";
import { getOperatorAdministrator } from "../../server/operator-session.ts";

export default async function OperatorLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const administrator = await getOperatorAdministrator(
    new Headers(await headers())
  );
  if (administrator === null) {
    redirect("/sign-in?callbackURL=%2Foperator");
  }

  return <OperatorShell name={administrator.name}>{children}</OperatorShell>;
}
