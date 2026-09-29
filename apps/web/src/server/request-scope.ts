import { resolveApiRequestId } from "@darkfactory/api/server";
import { createAuth, type DarkFactoryAuth } from "@darkfactory/auth/server";
import { composeDatabaseProfile } from "@darkfactory/config/database";
import { parseServerEnv, type ServerEnv } from "@darkfactory/config/server";
import {
  type BackgroundTaskScheduler,
  type Database,
  type DatabaseRequestScope,
  openRequestScope,
  RequestDatabaseCapacityError,
  requestDatabaseCapacityResponse,
} from "@darkfactory/db/server";
import { selectEmailPort } from "@darkfactory/email/server";
import type { StructuredEventSink } from "@darkfactory/observability";
import {
  createEvlogSink,
  initializeEvlog,
} from "@darkfactory/observability/server/evlog";

import { resolveE2eEmailPreviewOptions } from "../lib/e2e-fixtures.ts";
import { createRequestDatabaseDiagnosticSink } from "../lib/request-database-diagnostics.ts";
import { resolveDatabaseRequestBinding } from "./database-binding.ts";

export type WebRequestScope = Readonly<{
  env: ServerEnv;
  /** Also used for the span, context and `x-request-id` response header. */
  requestId: string;
  sink: StructuredEventSink;
  db: Database;
  auth: DarkFactoryAuth;
  /** Tracked: drained before the connection closes. Use the raw `waitUntil` for non-DB work. */
  schedule: BackgroundTaskScheduler;
}>;

const withRequestIdHeader = (
  response: Response,
  requestId: string
): Response => {
  // Copy rather than mutate: platform and redirect responses carry immutable headers.
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

/**
 * The single composition root for a DB-backed web request: env, request id,
 * evlog sink, request database (Hyperdrive-aware, capped in
 * packages/db/src/server/client.ts), email, Better Auth, then `run`.
 * Capacity exhaustion becomes the shared 503; finalization (drain tracked
 * tasks, close once) goes to `waitUntil` and falls back to being awaited.
 */
export const withRequestScope = async (
  request: Request,
  waitUntil: BackgroundTaskScheduler,
  run: (scope: WebRequestScope) => Promise<Response>,
  /**
   * The parent page's id, passed only by in-process dispatch
   * (apps/web/src/lib/server-internal-dispatch.ts). Route exports never
   * forward a third argument, so a network client cannot set it.
   */
  internalParentRequestId?: string
): Promise<Response> => {
  const env = parseServerEnv(process.env);
  const requestId = resolveApiRequestId(
    request,
    internalParentRequestId === undefined
      ? {}
      : { requestId: internalParentRequestId }
  );
  const connectionString = composeDatabaseProfile(
    env,
    resolveDatabaseRequestBinding()
  ).connection.connectionString;
  const sink = createEvlogSink({
    runtime: initializeEvlog({ serviceName: env.OTEL_SERVICE_NAME }),
    request,
    executionContext: { waitUntil },
  });

  let database: DatabaseRequestScope;
  try {
    database = await openRequestScope({
      connectionString,
      schedule: waitUntil,
      diagnosticSink: createRequestDatabaseDiagnosticSink({
        sink,
        scheduleBackgroundTask: waitUntil,
        requestId,
      }),
    });
  } catch (error) {
    if (error instanceof RequestDatabaseCapacityError) {
      return withRequestIdHeader(requestDatabaseCapacityResponse(), requestId);
    }
    throw error;
  }

  try {
    const previewOptions = resolveE2eEmailPreviewOptions();
    const email = selectEmailPort({
      environment: env.APP_ENV,
      transport: env.EMAIL_TRANSPORT,
      previewDirectory: previewOptions?.authDirectory,
      previewBinding: previewOptions?.binding,
      previewCaptureEndpoint: previewOptions?.captureEndpoint,
      resendApiKey: env.RESEND_API_KEY,
      from: env.EMAIL_FROM,
      trustedAppOrigin: env.APP_URL,
    });
    const auth = createAuth({
      database: database.db,
      email,
      secret: env.BETTER_AUTH_SECRET,
      baseURL: env.BETTER_AUTH_URL,
      trustedOrigins: [env.APP_URL],
      rateLimitEnabled: env.APP_ENV !== "test",
      scheduleBackgroundTask: database.schedule,
    });
    const response = await run({
      env,
      requestId,
      sink,
      db: database.db,
      auth,
      schedule: database.schedule,
    });
    return withRequestIdHeader(response, requestId);
  } finally {
    // Scheduling (not awaiting) keeps drain+close off the response path, so
    // response timing does not reveal whether auth scheduled email work.
    const finalization = database.finalize();
    try {
      waitUntil(finalization);
    } catch {
      await finalization;
    }
  }
};
