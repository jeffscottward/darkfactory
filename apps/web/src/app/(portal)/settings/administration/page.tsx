import { SectionHeader } from "@darkfactory/ui";

import { AdminUsersPageClient } from "../../../../components/admin/admin-users-page-client.tsx";

export default function AdministrationSettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Users" />
      <AdminUsersPageClient />
    </div>
  );
}
