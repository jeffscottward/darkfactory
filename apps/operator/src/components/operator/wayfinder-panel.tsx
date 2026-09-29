"use client";

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  StatusBadge,
  Textarea,
} from "@darkfactory/ui";
import { useEffect, useRef, useState } from "react";

import {
  classifyOperatorFailure,
  type OperatorGateway,
  type OperatorWayfinderQueuedRun,
  type OperatorWayfinderStatus,
} from "./operator-client.ts";
import {
  hasOperatorControlCharacters,
  MAX_OPERATOR_REQUEST_BYTES,
  trimmedUtf8ByteLength,
} from "./operator-text-limit.ts";

type WayfinderGateway = Pick<
  OperatorGateway,
  "wayfinderStatus" | "startWayfinder"
>;

type StatusState =
  | Readonly<{ type: "loading" }>
  | Readonly<{ type: "ready"; status: OperatorWayfinderStatus }>;

export interface WayfinderPanelProps {
  readonly gateway: WayfinderGateway;
}

export const WayfinderPanel = ({ gateway }: WayfinderPanelProps) => {
  const [statusState, setStatusState] = useState<StatusState>({
    type: "loading",
  });
  const [repositoryId, setRepositoryId] = useState("");
  const [scopePaths, setScopePaths] = useState("");
  const [request, setRequest] = useState("");
  const [queued, setQueued] = useState<OperatorWayfinderQueuedRun | null>(null);
  const [failure, setFailure] = useState("");
  const failureRef = useRef<HTMLParagraphElement>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    let active = true;
    void gateway
      .wayfinderStatus()
      .then((status) => {
        if (active) return setStatusState({ type: "ready", status });
        return;
      })
      .catch(() => {
        if (active) {
          return setStatusState({
            type: "ready",
            status: { availability: "unavailable", tracker: "local-markdown" },
          });
        }
        return;
      });
    return () => {
      active = false;
      return;
    };
  }, [gateway]);

  useEffect(() => {
    if (failure.length > 0) return failureRef.current?.focus();
    return;
  }, [failure]);

  const availability =
    statusState.type === "ready" ? statusState.status.availability : null;
  const requestByteLength = trimmedUtf8ByteLength(request);
  const requestTooLong = requestByteLength > MAX_OPERATOR_REQUEST_BYTES;
  const requestHasControlCharacters = hasOperatorControlCharacters(request);
  const requestError = requestHasControlCharacters
    ? "Use one line without control characters."
    : requestTooLong
      ? `Use ${MAX_OPERATOR_REQUEST_BYTES.toLocaleString("en-US")} UTF-8 bytes or fewer.`
      : null;
  const canSubmit =
    availability === "installed" &&
    repositoryId.trim().length > 0 &&
    requestByteLength > 0 &&
    requestError === null &&
    scopePaths.split(/\r?\n/u).some((path) => path.trim().length > 0) &&
    !isPending;

  return (
    <Card aria-labelledby="wayfinder-panel-title">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <CardTitle headingLevel={2} id="wayfinder-panel-title">
              Plan with Wayfinder
            </CardTitle>
            <CardDescription>
              Describe the work in plain language. Wayfinder creates a
              reviewable plan only. It does not edit code until you approve the
              plan.
            </CardDescription>
          </div>
          {availability === null ? (
            <span aria-label="Checking Wayfinder availability" role="status">
              Checking…
            </span>
          ) : availability === "installed" ? (
            <StatusBadge status="success">Wayfinder is ready</StatusBadge>
          ) : (
            <StatusBadge status="warning">Wayfinder is unavailable</StatusBadge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol
          aria-label="Planning workflow"
          className="grid gap-3 border-border border-y py-4 sm:grid-cols-3"
        >
          <li className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-pill bg-primary font-semibold text-primary-foreground text-sm"
            >
              1
            </span>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                Start planning
              </h3>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                Share the goal and safe file scope.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-border-strong font-semibold text-foreground text-sm"
            >
              2
            </span>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                Review plan
              </h3>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                Request changes or approve the latest plan.
              </p>
            </div>
          </li>
          <li className="flex gap-3">
            <span
              aria-hidden="true"
              className="flex size-7 shrink-0 items-center justify-center rounded-pill border border-border-strong font-semibold text-foreground text-sm"
            >
              3
            </span>
            <div>
              <h3 className="font-semibold text-foreground text-sm">
                Monitor work
              </h3>
              <p className="mt-1 text-muted-foreground text-xs leading-5">
                Follow progress and respond if work needs attention.
              </p>
            </div>
          </li>
        </ol>
        <form
          className="grid gap-5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!canSubmit) return;
            setFailure("");
            setQueued(null);
            setIsPending(true);
            try {
              const result = await gateway.startWayfinder(request.trim(), {
                repositoryId: repositoryId.trim().toLowerCase(),
                paths: scopePaths
                  .split(/\r?\n/u)
                  .map((path) => path.trim())
                  .filter((path) => path.length > 0),
              });
              return setQueued(result);
            } catch (error) {
              return setFailure(classifyOperatorFailure(error).message);
            } finally {
              setIsPending(false);
            }
          }}
        >
          <div className="grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="wayfinder-repository">Repository</Label>
              <Input
                aria-describedby="wayfinder-repository-hint"
                className="min-h-11"
                disabled={availability !== "installed" || isPending}
                id="wayfinder-repository"
                onChange={(event) => setRepositoryId(event.target.value)}
                required
                value={repositoryId}
              />
              <p
                className="text-muted-foreground text-xs leading-5"
                id="wayfinder-repository-hint"
              >
                Enter the repository name that Wayfinder may inspect.
              </p>
            </div>
            <div className="grid gap-2 md:row-span-2">
              <Label htmlFor="wayfinder-request">
                What should Wayfinder plan?
              </Label>
              <Textarea
                aria-describedby={
                  requestError === null
                    ? "wayfinder-request-hint wayfinder-request-count"
                    : "wayfinder-request-hint wayfinder-request-count wayfinder-request-error"
                }
                aria-invalid={requestError !== null || undefined}
                className="min-h-32"
                disabled={availability !== "installed" || isPending}
                id="wayfinder-request"
                onChange={(event) => setRequest(event.target.value)}
                required
                value={request}
              />
              <p
                className="text-muted-foreground text-xs leading-5"
                id="wayfinder-request-hint"
              >
                State the outcome, limits, and important checks. Do not include
                secrets.
              </p>
              <p
                className={
                  requestError !== null
                    ? "text-destructive text-xs leading-5"
                    : "text-muted-foreground text-xs leading-5"
                }
                id="wayfinder-request-count"
              >
                {requestByteLength.toLocaleString("en-US")} /{" "}
                {MAX_OPERATOR_REQUEST_BYTES.toLocaleString("en-US")} bytes
              </p>
              {requestError === null ? null : (
                <p
                  className="text-destructive text-sm"
                  id="wayfinder-request-error"
                  role="alert"
                >
                  {requestError}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              <Label htmlFor="wayfinder-scope">
                Files Wayfinder can review, one path per line
              </Label>
              <Textarea
                aria-describedby="wayfinder-scope-hint"
                className="min-h-24"
                disabled={availability !== "installed" || isPending}
                id="wayfinder-scope"
                onChange={(event) => setScopePaths(event.target.value)}
                required
                value={scopePaths}
              />
              <p
                className="text-muted-foreground text-xs leading-5"
                id="wayfinder-scope-hint"
              >
                Use repository-relative paths. Planning and later work stay
                inside this scope.
              </p>
            </div>
          </div>
          {failure.length === 0 ? null : (
            <p
              className="font-medium text-destructive text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              ref={failureRef}
              role="alert"
              tabIndex={-1}
            >
              {failure}
            </p>
          )}
          {queued === null ? null : (
            <div
              className="flex flex-wrap items-center justify-between gap-3 border-success-border border-y bg-success-subtle px-4 py-3"
              role="status"
            >
              <div>
                <p className="font-semibold text-sm text-success-foreground">
                  Planning queued
                </p>
                <p className="mt-1 text-success-foreground text-xs leading-5">
                  Open the run to review the plan when Wayfinder finishes.
                </p>
              </div>
              <a
                aria-label={`Review run ${queued.runId}`}
                className="inline-flex min-h-11 items-center font-semibold text-success-foreground underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={`/operator/runs/${encodeURIComponent(queued.runId)}`}
              >
                Open run
              </a>
            </div>
          )}
          <Button
            disabled={!canSubmit}
            loading={isPending}
            loadingLabel="Starting planning"
            type="submit"
          >
            Start planning
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};
