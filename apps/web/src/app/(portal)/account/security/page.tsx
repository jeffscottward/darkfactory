import { PageHeader } from "@darkfactory/ui";

import { SecurityPageClient } from "../../../../components/account/security-page-client.tsx";

export default function SecurityPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Security" />
      <SecurityPageClient />
    </div>
  );
}
