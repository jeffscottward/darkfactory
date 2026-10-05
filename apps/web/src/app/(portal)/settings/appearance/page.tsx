import { SectionHeader } from "@darkfactory/ui";

import { AppearanceSettings } from "../../../../components/settings/appearance-settings.tsx";

export default function AppearanceSettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Appearance" />
      <AppearanceSettings />
    </div>
  );
}
