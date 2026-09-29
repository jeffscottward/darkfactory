import { Card, CardContent, CardDescription, CardHeader, CardTitle, StatusBadge } from "@darkfactory/ui"
import { Clock3 } from "lucide-react"

import type { OperatorTimelineEntry } from "./operator-client.ts"
import { formatOperatorDate } from "./operator-format.ts"

const EVENT_LABELS: Readonly<Record<string, string>> = Object.freeze({
  RUN_SUBMITTED: "Planning queued",
  PLAN_PUBLISHED: "Plan ready",
  PLAN_REVISION_REQUESTED: "Changes requested",
  APPROVAL_GRANTED: "Plan approved",
  IMPLEMENTATION_STARTED: "Work started",
  VERIFICATION_SUCCEEDED: "Checks passed",
  RUN_BLOCKED: "Needs attention",
  RUN_COMPLETED: "Done",
})

const eventLabel = (eventType: string): string => {
  return EVENT_LABELS[eventType] ?? eventType.toLowerCase().split("_").filter(
    (part) => part.length > 0,
  ).map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`).join(" ")
}

export const RunTimeline = ({ entries }: { readonly entries: readonly OperatorTimelineEntry[] }) => (
  <Card aria-labelledby="run-timeline-title">
    <CardHeader>
      <CardTitle headingLevel={2} id="run-timeline-title">Run history
      </CardTitle>
      <CardDescription>
        Key events recorded while this run moves from planning to completion.
      </CardDescription>
    </CardHeader>
    <CardContent>
      {entries.length === 0 ? (
        <div className="flex gap-3 py-3 text-sm text-muted-foreground">
          <Clock3 aria-hidden="true" className="size-5 shrink-0" />No run history yet.
      </div>
      ) : (
        <ol className="relative border-l border-border pl-5">
          {entries.map((entry) => (
            <li className="relative pb-7 last:pb-0" key={`${entry.sequence}-${entry.hash}`}>
              <span aria-hidden="true" className="absolute -left-7 top-1 size-3 rounded-pill border border-primary-border bg-primary-subtle" />
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status="info">
                  {eventLabel(entry.eventType)}
                </StatusBadge>
                <time className="text-xs text-muted-foreground" dateTime={entry.createdAt.toISOString()}>
                  {formatOperatorDate(entry.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-sm leading-6 text-foreground">{entry.summary}
              </p>
              <details className="mt-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  Integrity details
                </summary>
                <code className="block break-all font-mono text-xs leading-5 text-muted-foreground">
                  Sequence {entry.sequence} · {entry.hash}
                </code>
              </details>
          </li>
          ))}
      </ol>
      )}
    </CardContent>
</Card>
)
