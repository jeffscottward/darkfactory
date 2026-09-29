import type { ReactNode } from "react";

import { PublicShell } from "../../components/public-shell.tsx";

export default function PublicLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return <PublicShell>{children}</PublicShell>;
}
