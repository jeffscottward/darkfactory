import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  StatusBadge,
} from "@darkfactory/ui";
import { LockKeyhole } from "lucide-react";

import type { OperatorEvidenceItem } from "./operator-client.ts";
import { formatOperatorDate } from "./operator-format.ts";

export const EvidencePanel = ({
  evidence,
}: {
  readonly evidence: readonly OperatorEvidenceItem[];
}) => (
  <Card aria-labelledby="evidence-panel-title">
    <CardHeader>
      <CardTitle headingLevel={2} id="evidence-panel-title">
        Stored evidence
      </CardTitle>
      <CardDescription>
        Only bounded, storage-safe evidence returned by the operator API is
        rendered. Raw prompts and raw command output are never requested.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {evidence.length === 0 ? (
        <div className="flex gap-3 py-3 text-muted-foreground text-sm">
          <LockKeyhole aria-hidden="true" className="size-5 shrink-0" />
          No stored evidence is available for this run.
        </div>
      ) : (
        <ul className="divide-y divide-border border-border border-y">
          {evidence.map((item) => (
            <li className="min-w-0 py-5" key={item.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words font-heading font-semibold text-base text-foreground">
                    {item.label}
                  </h3>
                  <p className="mt-1 font-mono text-muted-foreground text-xs">
                    {item.kind}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {item.redacted ? (
                    <StatusBadge status="warning">Redacted</StatusBadge>
                  ) : (
                    <StatusBadge status="success">Storage-safe</StatusBadge>
                  )}
                  <time
                    className="text-muted-foreground text-xs"
                    dateTime={item.createdAt.toISOString()}
                  >
                    {formatOperatorDate(item.createdAt)}
                  </time>
                </div>
              </div>
              <p className="mt-4 whitespace-pre-wrap break-all rounded-sm bg-muted px-3 py-3 font-body text-foreground text-sm leading-6">
                {item.redactedContent.length === 0
                  ? "Content removed by storage policy."
                  : item.redactedContent}
              </p>
            </li>
          ))}
        </ul>
      )}
    </CardContent>
  </Card>
);
