import { createApiClient } from "@darkfactory/api";
import { parseServerEnv } from "@darkfactory/config/server";
import {
  createEvlogSink,
  initializeEvlog,
} from "@darkfactory/observability/server/evlog";
import { PageHeader } from "@darkfactory/ui";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardContent } from "../../../components/portal/dashboard-content.tsx";
import {
  type DashboardSummaryState,
  toDashboardViewModel,
} from "../../../features/dashboard/view-model.ts";
import { ownErrorData, retryOnCapacity } from "../../../lib/capacity-retry.ts";
import {
  createAuthenticatedDashboardFetch,
  type DashboardTransportFetch,
  DEFAULT_DASHBOARD_TIMEOUT_MS,
} from "../../../lib/dashboard-transport.ts";
import { dispatchInternalOrpcRequest } from "../../../lib/server-internal-dispatch.ts";
import {
  portalSignInHref,
  resolvePortalAppUrl,
} from "../../../lib/server-session.ts";

export const metadata = { title: "Dashboard" };
const INTERNAL_DASHBOARD_TIMEOUT_MS = 10_000;

const SUMMARY_ERROR_STATUSES: Readonly<Record<string, number>> = Object.freeze({
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION_ERROR: 422,
  STORAGE_ERROR: 503,
});

const summaryFailureCategory = (error: unknown): string => {
  const code = ownErrorData(error, "code");
  const defined = ownErrorData(error, "defined");
  if (
    defined === true &&
    typeof code === "string" &&
    Object.hasOwn(SUMMARY_ERROR_STATUSES, code) &&
    ownErrorData(error, "status") === SUMMARY_ERROR_STATUSES[code]
  ) {
    return `orpc.${code}.${SUMMARY_ERROR_STATUSES[code]}`;
  }
  if (defined === false) {
    if (
      code === "SERVICE_UNAVAILABLE" &&
      ownErrorData(error, "status") === 503
    ) {
      return "orpc.undeclared.SERVICE_UNAVAILABLE.503";
    }
    if (
      code === "INTERNAL_SERVER_ERROR" &&
      ownErrorData(error, "status") === 500
    ) {
      return "orpc.undeclared.INTERNAL_SERVER_ERROR.500";
    }
  }
  if (error instanceof Error) {
    const name = ownErrorData(error, "name");
    const message = ownErrorData(error, "message");
    if (
      name === "TimeoutError" ||
      message === "Dashboard request exceeded the safe deadline"
    ) {
      return "timeout";
    }
    if (
      name === "AbortError" ||
      message === "Dashboard request was cancelled"
    ) {
      return "abort";
    }
  }
  return "unknown";
};

const reportSummaryFailure = async (error: unknown): Promise<void> => {
  try {
    const env = parseServerEnv(process.env);
    const sink = createEvlogSink({
      runtime: initializeEvlog({ serviceName: env.OTEL_SERVICE_NAME }),
      request: new Request(new URL("/dashboard", env.APP_URL)),
    });
    await sink.emit({
      eventId: crypto.randomUUID(),
      name: "dashboard.summary-failed",
      occurredAt: new Date().toISOString(),
      correlation: {
        requestId: crypto.randomUUID(),
        route: "/dashboard",
        procedure: "dashboard.summary",
      },
      outcome: "failure",
      source: "web",
      errorCategory: summaryFailureCategory(error),
    });
  } catch {
    // Diagnostic emission must not change the original summary outcome.
    return;
  }
};

const isDefinedUnauthorized = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const failure = error as Record<string, unknown>;
  return (
    failure["defined"] === true &&
    failure["code"] === "UNAUTHORIZED" &&
    failure["status"] === 401
  );
};

export const loadDashboardSummaryState = async (
  cookieHeader: string | null,
  fetcher: DashboardTransportFetch = globalThis.fetch,
  timeoutMs = DEFAULT_DASHBOARD_TIMEOUT_MS,
  signal?: AbortSignal
): Promise<DashboardSummaryState> => {
  const controller = new AbortController();
  const abort = () => controller.abort();
  const deadline = Date.now() + timeoutMs;
  const timeout = setTimeout(abort, timeoutMs);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) {
    abort();
  }
  try {
    const appUrl = resolvePortalAppUrl();
    const summary = await retryOnCapacity(
      fetcher,
      controller.signal,
      (observedFetch) =>
        createApiClient({
          baseUrl: appUrl,
          fetch: (request) => {
            const remainingMs = Math.max(0, deadline - Date.now());
            if (remainingMs === 0) {
              abort();
            }
            return createAuthenticatedDashboardFetch(
              cookieHeader,
              appUrl.origin,
              observedFetch,
              remainingMs
            )(request);
          },
        }).dashboard.summary({}, { signal: controller.signal })
    );
    return { type: "ready", summary };
  } catch (error) {
    const state: DashboardSummaryState = isDefinedUnauthorized(error)
      ? { type: "unauthorized" }
      : { type: "error" };
    await reportSummaryFailure(error);
    return state;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", abort);
  }
};

export default async function DashboardPage() {
  const requestHeaders = await headers();
  const summaryState = await loadDashboardSummaryState(
    requestHeaders.get("cookie"),
    dispatchInternalOrpcRequest,
    INTERNAL_DASHBOARD_TIMEOUT_MS
  );
  if (summaryState.type === "unauthorized") {
    redirect(portalSignInHref(requestHeaders));
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" />
      <DashboardContent model={toDashboardViewModel(summaryState)} />
    </div>
  );
}
