import { buttonVariants, PageHeader } from "@darkfactory/ui";
import { ArrowLeft } from "lucide-react";

import { FeatureItemEditor } from "../../../../components/portal/feature-item-editor.tsx";

export const metadata = { title: "Feature item details" };

interface FeatureItemPageProps {
  readonly params: Promise<Readonly<{ id: string }>>;
}

export default async function FeatureItemPage({
  params,
}: FeatureItemPageProps) {
  const { id } = await params;
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
        title="Feature item details"
      />
      <FeatureItemEditor id={id} />
    </div>
  );
}
