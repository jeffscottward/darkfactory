"use client";

import { Button, Skeleton, SkeletonGroup } from "@darkfactory/ui";
import { RefreshCw, RotateCcw, XCircle } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ApprovalPanel } from "./approval-panel.tsx";
import { ConversationPanel } from "./conversation-panel.tsx";
import { EvidencePanel } from "./evidence-panel.tsx";
import {
  classifyOperatorFailure,
  createBrowserOperatorGateway,
  createOperatorIdempotencyKeySlot,
  type OperatorFailure,
  type OperatorGateway,
  type OperatorIdempotencyKeySlot,
  type OperatorRunDetailOutput,
} from "./operator-client.ts";
import { formatOperatorDate, operatorRunTitle } from "./operator-format.ts";
import { RunTimeline } from "./run-timeline.tsx";
import { WorkflowStatus } from "./workflow-status.tsx";

type DetailState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "ready"; output: OperatorRunDetailOutput }>
  | Readonly<{ type: "error"; failure: OperatorFailure }>;

type DetailAction =
  | "approve"
  | "reject"
  | "revise"
  | "cancel"
  | "retry"
  | "message";
type AutoRefreshStatus = "active" | "retrying" | "paused";

export interface OperatorRunDetailProps {
  readonly gateway?: OperatorGateway;
  readonly id: string;
}

const AUTO_REFRESH_INTERVAL_MS = 10_000;
const AUTO_REFRESH_SESSION_MS = 5 * 60_000;
const isTerminalState = (
  state: OperatorRunDetailOutput["run"]["state"]
): boolean => state === "completed" || state === "cancelled";

const blockedGuidance = (output: OperatorRunDetailOutput): string => {
  if (output.implementationPlan === null) {
    if (output.canRequestPlanRevision) {
      return "Planning stopped before Wayfinder produced a plan. Request changes to give Wayfinder clearer direction, or retry after you resolve the stated issue.";
    }
    return "No plan is available to revise or approve at this stage. Resolve the issue above, then retry the run.";
  }
  if (output.canRequestPlanRevision) {
    return "Review the conversation and plan. Request changes if the plan is the problem, or retry after you resolve the stated issue.";
  }
  return "Resolve the stated issue, then retry the run. Plan revision is not available at this stage.";
};

const DetailLoading = () => (
  <SkeletonGroup
    className="grid gap-6 xl:grid-cols-5"
    label="Loading workflow run"
  >
    <div className="space-y-4 xl:col-span-3">
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
    <div className="space-y-4 xl:col-span-2">
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-52 w-full" />
    </div>
  </SkeletonGroup>
);

export const OperatorRunDetail = ({
  gateway: suppliedGateway,
  id,
}: OperatorRunDetailProps) => {
  const [gateway] = useState(
    () => suppliedGateway ?? createBrowserOperatorGateway()
  );
  const [state, setState] = useState<DetailState>({ type: "loading" });
  const [busyAction, setBusyAction] = useState<DetailAction | null>(null);
  const [failure, setFailure] = useState<OperatorFailure | null>(null);
  const [failureAction, setFailureAction] = useState<DetailAction | null>(null);
  const [approvalConflict, setApprovalConflict] =
    useState<OperatorFailure | null>(null);
  const [feedback, setFeedback] = useState("");
  const [autoRefreshStatus, setAutoRefreshStatus] =
    useState<AutoRefreshStatus>("active");
  const requestRevision = useRef(0);
  const activeRunId = useRef(id);
  const mounted = useRef(false);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const failureRef = useRef<HTMLParagraphElement>(null);
  const busyActionRef = useRef<DetailAction | null>(null);
  const currentOutput = useRef<OperatorRunDetailOutput | null>(null);
  const automaticGeneration = useRef(0);
  const automaticDeadline = useRef(0);
  const automaticTimer = useRef<number | null>(null);
  const deadlineTimer = useRef<number | null>(null);
  const automaticReadInFlight = useRef(false);
  const manualReadInFlight = useRef(false);
  const revisionIdempotency = useRef<OperatorIdempotencyKeySlot | null>(null);
  const lastRevisionMessage = useRef<string | null>(null);

  const clearAutomaticTimers = useCallback((): void => {
    if (automaticTimer.current !== null) {
      window.clearTimeout(automaticTimer.current);
      automaticTimer.current = null;
    }
    if (deadlineTimer.current !== null) {
      window.clearTimeout(deadlineTimer.current);
      deadlineTimer.current = null;
    }
  }, []);

  const cancelAutomaticRefresh = useCallback((): void => {
    automaticGeneration.current += 1;
    clearAutomaticTimers();
  }, [clearAutomaticTimers]);

  const pauseAutomaticRefresh = useCallback(
    (_session: number): void => {
      cancelAutomaticRefresh();
      setAutoRefreshStatus("paused");
    },
    [cancelAutomaticRefresh]
  );

  const beginAutomaticRefresh = useCallback((): number => {
    cancelAutomaticRefresh();
    const session = automaticGeneration.current;
    automaticDeadline.current = performance.now() + AUTO_REFRESH_SESSION_MS;
    setAutoRefreshStatus("active");
    deadlineTimer.current = window.setTimeout(() => {
      if (automaticGeneration.current !== session) return;
      cancelAutomaticRefresh();
      return setAutoRefreshStatus("paused");
    }, AUTO_REFRESH_SESSION_MS);
    return session;
  }, [cancelAutomaticRefresh]);

  const scheduleAutomaticRefresh: (session: number) => void = useCallback(
    (session: number): void => {
      if (
        !mounted.current ||
        activeRunId.current !== id ||
        automaticGeneration.current !== session ||
        automaticReadInFlight.current ||
        automaticTimer.current !== null
      )
        return;
      const remaining = automaticDeadline.current - performance.now();
      if (remaining <= 0) {
        pauseAutomaticRefresh(session);
        return;
      }
      automaticTimer.current = window.setTimeout(
        () => {
          automaticTimer.current = null;
          if (
            !mounted.current ||
            activeRunId.current !== id ||
            automaticGeneration.current !== session
          )
            return;
          if (manualReadInFlight.current || busyActionRef.current !== null) {
            scheduleAutomaticRefresh(session);
            return;
          }
          const revision = requestRevision.current;
          automaticReadInFlight.current = true;
          return void gateway
            .detail(id)
            .then((output) => {
              if (
                mounted.current &&
                activeRunId.current === id &&
                automaticGeneration.current === session &&
                requestRevision.current === revision &&
                performance.now() < automaticDeadline.current
              ) {
                currentOutput.current = output;
                setState({ type: "ready", output });
                setApprovalConflict(null);
                setAutoRefreshStatus("active");
                if (isTerminalState(output.run.state))
                  return pauseAutomaticRefresh(session);
                return;
              }
              return;
            })
            .catch(() => {
              if (
                mounted.current &&
                activeRunId.current === id &&
                automaticGeneration.current === session &&
                requestRevision.current === revision &&
                performance.now() < automaticDeadline.current
              )
                return setAutoRefreshStatus("retrying");
              return;
            })
            .finally(() => {
              automaticReadInFlight.current = false;
              const current = currentOutput.current;
              const currentSession = automaticGeneration.current;
              if (
                mounted.current &&
                activeRunId.current === id &&
                current !== null &&
                !isTerminalState(current.run.state) &&
                performance.now() < automaticDeadline.current
              )
                return scheduleAutomaticRefresh(currentSession);
              return;
            });
        },
        Math.min(AUTO_REFRESH_INTERVAL_MS, remaining)
      );
    },
    [gateway, id, pauseAutomaticRefresh]
  );

  const load = useCallback(async () => {
    const session = beginAutomaticRefresh();
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    currentOutput.current = null;
    manualReadInFlight.current = true;
    setState({ type: "loading" });
    busyActionRef.current = null;
    setBusyAction(null);
    setFeedback("");
    setFailureAction(null);
    setFailure(null);
    const isCurrent = (): boolean =>
      mounted.current &&
      activeRunId.current === id &&
      requestRevision.current === revision;
    try {
      const output = await gateway.detail(id);
      if (isCurrent()) {
        currentOutput.current = output;
        setState({ type: "ready", output });
        setApprovalConflict(null);
        if (isTerminalState(output.run.state))
          return pauseAutomaticRefresh(session);
        return;
      }
      return;
    } catch (error) {
      if (isCurrent()) {
        pauseAutomaticRefresh(session);
        return setState({
          type: "error",
          failure: classifyOperatorFailure(error),
        });
      }
      return;
    } finally {
      manualReadInFlight.current = false;
      const output = currentOutput.current;
      if (
        isCurrent() &&
        output !== null &&
        !isTerminalState(output.run.state)
      ) {
        scheduleAutomaticRefresh(session);
      }
    }
  }, [
    beginAutomaticRefresh,
    gateway,
    id,
    pauseAutomaticRefresh,
    scheduleAutomaticRefresh,
  ]);

  useEffect(() => {
    activeRunId.current = id;
    mounted.current = true;
    setApprovalConflict(null);
    revisionIdempotency.current?.invalidate();
    lastRevisionMessage.current = null;
    void load();
    return () => {
      mounted.current = false;
      requestRevision.current += 1;
      currentOutput.current = null;
      cancelAutomaticRefresh();
      return undefined;
    };
  }, [cancelAutomaticRefresh, id, load]);

  useEffect(() => {
    if (failure === null || approvalConflict || failureAction === "message")
      return;
    return failureRef.current?.focus();
  }, [approvalConflict, failure, failureAction]);

  const perform = async (
    action: DetailAction,
    operation: () => Promise<OperatorRunDetailOutput>,
    successMessage: string
  ): Promise<boolean> => {
    if (busyActionRef.current !== null) return false;
    const actionRunId = id;
    const revision = requestRevision.current + 1;
    requestRevision.current = revision;
    const isCurrent = (): boolean =>
      mounted.current &&
      activeRunId.current === actionRunId &&
      requestRevision.current === revision;
    busyActionRef.current = action;
    setBusyAction(action);
    setFailure(null);
    setFailureAction(null);
    setFeedback("");
    try {
      const output = await operation();
      if (!isCurrent()) return false;
      currentOutput.current = output;
      setState({ type: "ready", output });
      setApprovalConflict(null);
      if (isTerminalState(output.run.state)) {
        pauseAutomaticRefresh(automaticGeneration.current);
      }
      setFeedback(successMessage);
      queueMicrotask(() => {
        if (isCurrent()) return feedbackRef.current?.focus();
        return;
      });
      return true;
    } catch (error) {
      if (!isCurrent()) return false;
      const nextFailure = classifyOperatorFailure(error);
      const establishesApprovalConflict =
        nextFailure.kind === "stale" &&
        (action === "approve" ||
          action === "reject" ||
          (action === "revise" &&
            state.type === "ready" &&
            state.output.approval !== null));
      if (establishesApprovalConflict) {
        setApprovalConflict(nextFailure);
        setFailure(null);
        setFailureAction(null);
      } else {
        setFailure(nextFailure);
        setFailureAction(action);
      }
      setFeedback("");
      return false;
    } finally {
      if (isCurrent()) {
        busyActionRef.current = null;
        setBusyAction(null);
        const output = currentOutput.current;
        if (output !== null && !isTerminalState(output.run.state)) {
          scheduleAutomaticRefresh(automaticGeneration.current);
        }
      }
    }
  };

  const requestPlanRevision = async (message: string): Promise<boolean> => {
    const keySlot =
      revisionIdempotency.current ?? createOperatorIdempotencyKeySlot();
    revisionIdempotency.current = keySlot;
    if (
      lastRevisionMessage.current !== null &&
      lastRevisionMessage.current !== message
    )
      keySlot.invalidate();
    lastRevisionMessage.current = message;
    const succeeded = await perform(
      "revise",
      () => gateway.revise(id, message, keySlot.key()),
      "Changes requested. A new plan is queued."
    );
    if (succeeded) {
      keySlot.invalidate();
      lastRevisionMessage.current = null;
    }
    return succeeded;
  };
  if (state.type === "loading") return <DetailLoading />;
  if (state.type === "error") {
    return (
      <section
        className="border-destructive-border border-y bg-destructive-subtle px-4 py-6"
        role="alert"
      >
        <h2 className="font-heading font-semibold text-foreground text-lg">
          Workflow run unavailable
        </h2>
        <p className="mt-2 text-muted-foreground text-sm leading-6">
          {state.failure.message}
        </p>
        <Button className="mt-4" onClick={load} variant="secondary">
          <RefreshCw aria-hidden="true" className="size-4" />
          Retry loading
        </Button>
      </section>
    );
  }

  const { output } = state;
  const blocked = output.run.state === "blocked";
  const terminal =
    output.run.state === "completed" || output.run.state === "cancelled";
  const refreshSummary =
    output.run.state === "cancelled"
      ? "This run was cancelled. Automatic updates are paused."
      : output.run.state === "completed"
        ? "This run is complete. Automatic updates are paused."
        : autoRefreshStatus === "retrying"
          ? "An automatic update failed. Retrying until this update session ends."
          : autoRefreshStatus === "paused"
            ? "Automatic updates are paused. Select Refresh run to start another five-minute session."
            : "Automatic updates are active for five minutes. You can refresh this run at any time.";
  return (
    <div className="space-y-6">
      <section
        aria-labelledby="run-summary-title"
        className="min-w-0 border-border border-y bg-surface px-4 py-5 sm:px-6"
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              className="break-words font-heading font-semibold text-foreground text-xl"
              id="run-summary-title"
            >
              {operatorRunTitle(output.run)}
            </h2>
            <p
              aria-atomic="true"
              aria-live="polite"
              className="mt-2 text-muted-foreground text-sm leading-6"
              role="status"
            >
              {refreshSummary}
            </p>
          </div>
          <WorkflowStatus state={output.run.state} />
        </div>
        <dl className="mt-5">
          <div>
            <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
              Last update
            </dt>
            <dd className="text-foreground text-sm">
              <time dateTime={output.run.updatedAt.toISOString()}>
                {formatOperatorDate(output.run.updatedAt)}
              </time>
            </dd>
          </div>
        </dl>
        <details className="mt-4 border-border border-t pt-2">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            Integrity details
          </summary>
          <dl className="grid min-w-0 gap-4 pb-2 sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Run ID
              </dt>
              <dd className="break-all font-mono text-foreground text-xs">
                {output.run.id}
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Journal sequence
              </dt>
              <dd className="font-mono text-foreground text-xs">
                {output.run.sequence}
              </dd>
            </div>
            <div className="min-w-0 sm:col-span-2">
              <dt className="font-semibold text-muted-foreground text-xs uppercase tracking-wide">
                Journal head
              </dt>
              <dd className="break-all font-mono text-foreground text-xs">
                {output.run.headHash}
              </dd>
            </div>
          </dl>
        </details>
        {output.run.blockedReason === undefined ? null : (
          <div className="mt-5 border-destructive-border border-y bg-destructive-subtle px-4 py-4">
            <h3 className="font-heading font-semibold text-base text-destructive">
              Why this run needs attention
            </h3>
            <p className="mt-1 text-destructive text-sm leading-6">
              {output.run.blockedReason}
            </p>
            <p className="mt-2 text-muted-foreground text-sm leading-6">
              {blockedGuidance(output)}
            </p>
          </div>
        )}
        <div className="mt-5 flex flex-wrap gap-2 border-border border-t pt-4">
          <Button
            disabled={busyAction !== null}
            onClick={() => void load()}
            size="compact"
            variant="secondary"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            Refresh run
          </Button>
          <Button
            disabled={
              !blocked || approvalConflict !== null || busyAction !== null
            }
            loading={busyAction === "retry"}
            loadingLabel="Requesting retry"
            onClick={() =>
              void perform("retry", () => gateway.retry(id), "Retry requested.")
            }
            size="compact"
            variant="secondary"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Retry run
          </Button>
          <Button
            disabled={
              terminal || approvalConflict !== null || busyAction !== null
            }
            loading={busyAction === "cancel"}
            loadingLabel="Cancelling run"
            onClick={() =>
              void perform(
                "cancel",
                () => gateway.cancel(id),
                "Cancellation requested."
              )
            }
            size="compact"
            variant="destructive"
          >
            <XCircle aria-hidden="true" className="size-4" />
            Cancel run
          </Button>
        </div>
      </section>
      <div
        aria-atomic="true"
        aria-live="polite"
        className="min-h-6 text-muted-foreground text-sm outline-none"
        ref={feedbackRef}
        tabIndex={-1}
      >
        {feedback}
      </div>
      {failure === null ||
      approvalConflict !== null ||
      failureAction === "message" ? null : (
        <p
          className="border-destructive-border border-y bg-destructive-subtle px-4 py-3 text-destructive text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          ref={failureRef}
          role="alert"
          tabIndex={-1}
        >
          {failure.message}
        </p>
      )}
      <ConversationPanel
        busy={busyAction === "message"}
        disabled={terminal || approvalConflict !== null || busyAction !== null}
        failureMessage={
          failureAction === "message" ? failure?.message : undefined
        }
        implementationPlan={output.implementationPlan}
        messages={output.messages}
        onSend={(body, idempotencyKey) => {
          return perform(
            "message",
            () => gateway.message(id, body, idempotencyKey),
            "Operator note added."
          );
        }}
        originalRequest={output.originalRequest}
        planRevisions={output.planRevisions}
        runState={output.run.state}
      />
      <div className="grid min-w-0 gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <ApprovalPanel
            approval={output.approval}
            busyAction={
              busyAction === "approve" ||
              busyAction === "reject" ||
              busyAction === "revise"
                ? busyAction
                : null
            }
            canRequestChanges={output.canRequestPlanRevision}
            conflictMessage={approvalConflict?.message}
            disabled={busyAction !== null}
            implementationPlan={output.implementationPlan}
            onApprove={() => {
              if (output.approval !== null) {
                return void perform(
                  "approve",
                  () => gateway.approve(id, output.approval!),
                  "Plan approved. Work can start."
                );
              }
              return;
            }}
            onReject={() =>
              void perform("reject", () => gateway.reject(id), "Plan rejected.")
            }
            onReload={() => void load()}
            onRequestChanges={requestPlanRevision}
          />
        </div>
        <aside
          aria-label="Run history and evidence"
          className="min-w-0 space-y-6 xl:col-span-2"
        >
          <RunTimeline entries={output.timeline} />
          <EvidencePanel evidence={output.evidence} />
        </aside>
      </div>
    </div>
  );
};
