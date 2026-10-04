import { PageHeader } from "@darkfactory/ui";

import { OperatorWorkspace } from "../../../components/operator/operator-workspace.tsx";

export const metadata = { title: "Operator" };

export default function OperatorPage() {
  return (
    <div className="space-y-4">
      <PageHeader title="Plan and monitor work" />
      <OperatorWorkspace />
    </div>
  );
}
