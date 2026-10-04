import { PageHeader } from "@darkfactory/ui";

import { AddressPageClient } from "../../../../components/account/address-page-client.tsx";

export default function AddressPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Addresses" />
      <AddressPageClient />
    </div>
  );
}
