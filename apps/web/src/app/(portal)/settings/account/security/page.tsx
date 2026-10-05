import { SectionHeader } from "@darkfactory/ui";

import { SecurityPageClient } from "../../../../../components/account/security-page-client.tsx";

export default function SecuritySettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Security" />
      <SecurityPageClient />
    </div>
  );
}
