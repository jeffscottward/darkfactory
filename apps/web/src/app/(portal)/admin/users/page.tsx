import { PageHeader } from "@darkfactory/ui";

import { AdminUsersPageClient } from "../../../../components/admin/admin-users-page-client.tsx";

export default function AdminUsersPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Users" />
      <AdminUsersPageClient />
    </div>
  );
}
