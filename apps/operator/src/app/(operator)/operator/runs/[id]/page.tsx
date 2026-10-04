import { buttonVariants, PageHeader } from "@darkfactory/ui";
import { ArrowLeft } from "lucide-react";

import { OperatorRunDetail } from "../../../../../components/operator/operator-run-detail.tsx";

export const metadata = { title: "Workflow run" };

interface OperatorRunPageProps {
  readonly params: Promise<Readonly<{ id: string }>>;
}

export default async function OperatorRunPage({
  params,
}: OperatorRunPageProps) {
  const { id } = await params;
  return (
    <div className="space-y-4">
      <PageHeader
        actions={
          <a className={buttonVariants({ variant: "ghost" })} href="/operator">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to operator
          </a>
        }
        title="Review plan and monitor work"
      />
      <OperatorRunDetail id={id} />
    </div>
  );
}
