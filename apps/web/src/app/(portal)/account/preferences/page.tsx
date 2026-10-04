import { PageHeader } from "@darkfactory/ui";

import { PreferencesPageClient } from "../../../../components/account/preferences-page-client.tsx";

export default function PreferencesPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Preferences" />
      <PreferencesPageClient />
    </div>
  );
}
