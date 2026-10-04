import { buttonVariants, PageHeader } from "@darkfactory/ui";
import { ArrowLeft } from "lucide-react";

import { FeatureItemCreateWorkflow } from "../../../../components/portal/feature-item-create-workflow.tsx";

export const metadata = { title: "Create feature item" };

export default function NewFeatureItemPage() {
  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <a
            className={buttonVariants({ variant: "ghost" })}
            href="/feature-items"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to feature items
          </a>
        }
        title="Create feature item"
      />
      <FeatureItemCreateWorkflow />
    </div>
  );
}
