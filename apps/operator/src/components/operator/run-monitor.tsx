import { Card, CardContent, CardHeader, CardTitle, cn } from "@darkfactory/ui";
import Link from "next/link";

import {
  type OperatorRunSummary,
  WORKFLOW_STATES,
  type WorkflowState,
} from "./operator-client.ts";
import { formatOperatorDate, operatorRunTitle } from "./operator-format.ts";
import { WorkflowStatus, workflowStateLabel } from "./workflow-status.tsx";

export const runsByWorkflowState = (
  runs: readonly OperatorRunSummary[]
): Readonly<Record<WorkflowState, readonly OperatorRunSummary[]>> => {
  const grouped = Object.fromEntries(
    WORKFLOW_STATES.map((state) => [state, [] as OperatorRunSummary[]])
  ) as Record<WorkflowState, OperatorRunSummary[]>;
  for (const run of runs) grouped[run.state].push(run);
  for (const state of WORKFLOW_STATES) {
    grouped[state].sort(
      (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
    );
  }
  return grouped;
};

type MonitorStageId = "planning" | "review" | "working" | "attention" | "done";

const MONITOR_STAGES: readonly Readonly<{
  id: MonitorStageId;
  label: string;
  states: readonly WorkflowState[];
}>[] = Object.freeze([
  { id: "planning", label: "Planning", states: ["draft", "planning"] },
  { id: "review", label: "Review plan", states: ["awaitingApproval"] },
  {
    id: "working",
    label: "Work in progress",
    states: ["implementing", "verifying"],
  },
  { id: "attention", label: "Needs attention", states: ["blocked"] },
  { id: "done", label: "Finished", states: ["completed", "cancelled"] },
]);

const RunLink = ({
  run,
  selected,
}: {
  readonly run: OperatorRunSummary;
  readonly selected: boolean;
}) => (
  <li className="border-border border-t first:border-t-0">
    <Link
      aria-current={selected ? "true" : undefined}
      aria-label={`Open ${operatorRunTitle(run)}, ${workflowStateLabel(run.state)}`}
      className={cn(
        "block min-h-11 min-w-0 px-1 py-3 transition-colors duration-base ease-out hover:bg-accent focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
        selected && "bg-accent"
      )}
      href={`/operator/runs/${encodeURIComponent(run.id)}`}
    >
      <span className="block break-words font-semibold text-foreground text-sm">
        {operatorRunTitle(run)}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-2">
        <WorkflowStatus state={run.state} />
        <time
          className="text-muted-foreground text-xs"
          dateTime={run.updatedAt.toISOString()}
        >
          {formatOperatorDate(run.updatedAt)}
        </time>
      </span>
      {run.blockedReason === undefined ? null : (
        <span className="mt-3 block border-destructive-border border-y bg-destructive-subtle px-3 py-3">
          <span className="block font-semibold text-destructive text-xs">
            Why it needs attention
          </span>
          <span className="mt-1 block text-destructive text-xs leading-5">
            {run.blockedReason}
          </span>
          <span className="mt-1 block text-muted-foreground text-xs leading-5">
            Open this run to review the next action.
          </span>
        </span>
      )}
    </Link>
  </li>
);

export interface RunMonitorProps {
  readonly runs: readonly OperatorRunSummary[];
  readonly selectedRunId?: string | undefined;
}

export const RunMonitor = ({ runs, selectedRunId }: RunMonitorProps) => {
  const sortedRuns = [...runs].sort(
    (left, right) => right.updatedAt.getTime() - left.updatedAt.getTime()
  );
  const populatedStages = MONITOR_STAGES.map((stage) => ({
    ...stage,
    runs: sortedRuns.filter((run) => stage.states.includes(run.state)),
  })).filter((stage) => stage.runs.length > 0);
  return (
    <section aria-labelledby="run-monitor-title" className="space-y-4">
      <div className="border-border border-b pb-4">
        <h2
          className="font-heading font-semibold text-foreground text-xl tracking-tight"
          id="run-monitor-title"
        >
          Work monitor
        </h2>
        <p className="mt-1 max-w-2xl text-muted-foreground text-sm leading-5">
          Follow each run through planning, review, active work, and completion.
          This board reports workflow state; moving a card does not change work.
        </p>
      </div>
      <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {populatedStages.map((stage) => (
          <Card className="min-w-0" key={stage.id}>
            <CardHeader className="flex-row items-center justify-between gap-3 p-4">
              <CardTitle className="text-base" headingLevel={3}>
                {stage.label}
              </CardTitle>
              <span
                aria-label={`${stage.runs.length} runs`}
                className="text-muted-foreground text-xs tabular-nums"
              >
                {stage.runs.length}
              </span>
            </CardHeader>
            <CardContent className="px-3 py-0">
              <ul>
                {stage.runs.map((run) => (
                  <RunLink
                    key={run.id}
                    run={run}
                    selected={run.id === selectedRunId}
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};
