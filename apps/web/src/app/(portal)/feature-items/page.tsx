import { buttonVariants, PageHeader } from "@darkfactory/ui";
import { FilePlus2 } from "lucide-react";

import { FeatureItemsWorkspace } from "../../../components/portal/feature-items-workspace.tsx";

export const metadata = { title: "Feature items" };

export default function FeatureItemsPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <a
            className={buttonVariants({ variant: "primary" })}
            href="/feature-items/new"
          >
            <FilePlus2 aria-hidden="true" className="size-4" />
            Create feature item
          </a>
        }
        title="Feature items"
      />
      <FeatureItemsWorkspace />
    </div>
  );
}
