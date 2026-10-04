import { PageHeader } from "@darkfactory/ui";

import { ProfilePageClient } from "../../../../components/account/profile-page-client.tsx";

export default function ProfilePage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Profile" />
      <ProfilePageClient />
    </div>
  );
}
