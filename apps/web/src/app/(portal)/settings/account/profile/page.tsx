import { SectionHeader } from "@darkfactory/ui";

import { ProfilePageClient } from "../../../../../components/account/profile-page-client.tsx";

export default function ProfileSettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Profile" />
      <ProfilePageClient />
    </div>
  );
}
