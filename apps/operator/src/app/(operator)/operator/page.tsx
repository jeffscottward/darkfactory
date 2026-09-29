import { PageHeader } from "@darkfactory/ui";

import { OperatorWorkspace } from "../../../components/operator/operator-workspace.tsx";

export const metadata = { title: "Operator" };

export default function OperatorPage() {
  return (
    <div className="space-y-10">
      <PageHeader
        description="Start with a Wayfinder plan, approve the exact plan when it is ready, then monitor the work."
        eyebrow="Operator"
        title="Plan and monitor work"
      />
      <OperatorWorkspace />
    </div>
  );
}
