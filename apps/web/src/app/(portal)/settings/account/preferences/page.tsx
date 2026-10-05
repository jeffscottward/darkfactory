import { SectionHeader } from "@darkfactory/ui";

import { PreferencesPageClient } from "../../../../../components/account/preferences-page-client.tsx";

export default function PreferencesSettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Preferences" />
      <PreferencesPageClient />
    </div>
  );
}
