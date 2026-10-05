import type { ReactNode } from "react";

import { SettingsNavigation } from "../../../../components/settings/settings-navigation.tsx";

export default function AccountSettingsLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-6">
      <SettingsNavigation menu="account" />
      <div className="min-w-0 space-y-4">{children}</div>
    </div>
  );
}
