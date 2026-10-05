import { SectionHeader } from "@darkfactory/ui";

import { AddressPageClient } from "../../../../../components/account/address-page-client.tsx";

export default function AddressSettingsPage() {
  return (
    <div className="space-y-4">
      <SectionHeader title="Addresses" />
      <AddressPageClient />
    </div>
  );
}
