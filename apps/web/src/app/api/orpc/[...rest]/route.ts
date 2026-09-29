import { waitUntil } from "cloudflare:workers";
import { createPostHogAnalyticsPort } from "@darkfactory/analytics/server/posthog";
import { CONTACT_ERRORS } from "@darkfactory/api";
import { createApiContext, resolveApiRequestId } from "@darkfactory/api/server";
import {
  createAuth,
  requireRole,
  requireSession,
} from "@darkfactory/auth/server";
import { composeDatabaseProfile } from "@darkfactory/config/database";
import {
  getProviderCapabilities,
  parseServerEnv,
} from "@darkfactory/config/server";
import {
  createContactThrottleRepository,
  createRepositories,
  createRequestDatabase,
  REQUEST_DATABASE_POOL_MAX_CONNECTIONS,
  RequestDatabaseCapacityError,
} from "@darkfactory/db/server";
import {
  selectContactEmailPort,
  selectEmailPort,
} from "@darkfactory/email/server";
import {
  createEvlogSink,
  initializeEvlog,
} from "@darkfactory/observability/server/evlog";
import { createSemanticEventFanout } from "@darkfactory/observability/server/fanout";
import { initializeTelemetry } from "@darkfactory/observability/server/otel";

import {
  type BackgroundTaskScheduler,
  createBackgroundTaskLifecycle,
} from "../../../../lib/background-task-lifecycle.ts";
import { bufferBoundedRequest } from "../../../../lib/bounded-request-body.ts";
import { resolveE2eEmailPreviewOptions } from "../../../../lib/e2e-fixtures.ts";
import { createRequestDatabaseDiagnosticSink } from "../../../../lib/request-database-diagnostics.ts";
import {
  bufferContactRequest,
  createContactThrottleKey,
} from "./contact-runtime.ts";
import { handleOrpcRequest } from "./handler.ts";
import {
  configuredOtlpAllowedHosts,
  resolveAnalyticsConsent,
  runWithRequestTelemetry,
} from "./runtime.ts";

type ServerEnv = ReturnType<typeof parseServerEnv>;

let telemetryRuntime: ReturnType<typeof initializeTelemetry> | undefined;
let evlogRuntime: ReturnType<typeof initializeEvlog> | undefined;
let analyticsPort: ReturnType<typeof createPostHogAnalyticsPort> | undefined;

const telemetryFor = (env: ServerEnv) => {
  telemetryRuntime ??= initializeTelemetry({
    enabled: env.OTEL_ENABLED,
    serviceName: env.OTEL_SERVICE_NAME,
    ...(env.OTEL_EXPORTER_OTLP_ENDPOINT === undefined
      ? {}
      : {
          otlpEndpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT,
          otlpAllowedHosts: configuredOtlpAllowedHosts(
            env.OTEL_EXPORTER_OTLP_ENDPOINT
          ),
        }),
  });
  return telemetryRuntime;
};

const evlogFor = (env: ServerEnv) => {
  evlogRuntime ??= initializeEvlog({
    serviceName: env.OTEL_SERVICE_NAME,
  });
  return evlogRuntime;
};

const analyticsFor = (env: ServerEnv) => {
  analyticsPort ??= createPostHogAnalyticsPort({
    ...(env.POSTHOG_KEY === undefined ? {} : { apiKey: env.POSTHOG_KEY }),
    ...(env.POSTHOG_HOST === undefined ? {} : { host: env.POSTHOG_HOST }),
  });
  return analyticsPort;
};

const unsafeRequestDenied = (request: Request, appUrl: string): boolean => {
  if (!["POST", "PATCH", "DELETE"].includes(request.method.toUpperCase()))
    return false;
  const trustedOrigin = new URL(appUrl).origin;
  if (request.headers.get("origin") !== trustedOrigin) return true;
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite !== null && fetchSite !== "same-origin";
};

const forbiddenOriginResponse = (): Response => {
  return Response.json({ error: "Forbidden" }, { status: 403 });
};

const SUPPORTED_ORPC_METHODS: readonly string[] = [
  "GET",
  "POST",
  "PATCH",
  "DELETE",
];
const BODY_BEARING_ORPC_METHODS: readonly string[] = [
  "POST",
  "PATCH",
  "DELETE",
];
export const ORPC_REQUEST_MAX_BYTES = 1024 * 1024;
export const ORPC_DATABASE_CONCURRENCY_LIMIT =
  REQUEST_DATABASE_POOL_MAX_CONNECTIONS;
const ORPC_DATABASE_RETRY_AFTER_SECONDS = 1;

let activeDatabaseRequests = 0;

const methodNotAllowedResponse = (): Response => {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: SUPPORTED_ORPC_METHODS.join(", ") },
  });
};

const payloadTooLargeResponse = (): Response => {
  return Response.json({ error: "Payload Too Large" }, { status: 413 });
};

const databaseCapacityResponse = (): Response => {
  return Response.json(
    { error: "Service Unavailable" },
    {
      status: 503,
      headers: {
        "retry-after": String(ORPC_DATABASE_RETRY_AFTER_SECONDS),
      },
    }
  );
};

type DatabaseAdmission = Readonly<{
  release: () => void;
  releaseIfOwned: () => void;
  transfer: () => void;
}>;

const tryAcquireDatabaseRequest = (): DatabaseAdmission | undefined => {
  if (activeDatabaseRequests >= ORPC_DATABASE_CONCURRENCY_LIMIT)
    return undefined;
  activeDatabaseRequests += 1;
  let released = false;
  let transferred = false;
  const release = (): void => {
    if (released) return;
    released = true;
    activeDatabaseRequests -= 1;
  };
  return Object.freeze({
    release,
    releaseIfOwned: () => {
      if (!transferred) return release();
      return;
    },
    transfer: () => {
      transferred = true;
    },
  });
};

const withDatabaseAdmission = async (
  run: (admission: DatabaseAdmission) => Promise<Response>
): Promise<Response> => {
  const admission = tryAcquireDatabaseRequest();
  if (admission === undefined) return databaseCapacityResponse();
  try {
    return await run(admission);
  } finally {
    admission.releaseIfOwned();
  }
};

const CONTACT_EDGE_MAX_REQUESTS = 30;

const contactAbuseResponse = (
  code: "PAYLOAD_TOO_LARGE" | "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE",
  retryAfterSeconds?: number
): Response => {
  const definition = CONTACT_ERRORS[code];
  const error = {
    defined: true,
    code,
    status: definition.status,
    message: definition.message,
  };
  return Response.json(
    { json: error },
    {
      status: definition.status,
      ...(retryAfterSeconds === undefined
        ? {}
        : { headers: { "retry-after": String(retryAfterSeconds) } }),
    }
  );
};
export const handleOrpcRuntimeRequest = async (
  request: Request,
  scheduleBackgroundTask: BackgroundTaskScheduler
): Promise<Response> => {
  const env = parseServerEnv(process.env);
  const method = request.method.toUpperCase();
  if (!SUPPORTED_ORPC_METHODS.includes(method))
    return methodNotAllowedResponse();
  const previewOptions = resolveE2eEmailPreviewOptions();
  const createDatabase = createRequestDatabase;
  if (unsafeRequestDenied(request, env.APP_URL))
    return forbiddenOriginResponse();

  return await withDatabaseAdmission(async (admission) => {
    const isContactSubmission =
      method === "POST" &&
      new URL(request.url).pathname === "/api/orpc/contact/submit";
    const boundedRequest = BODY_BEARING_ORPC_METHODS.includes(method)
      ? isContactSubmission
        ? await bufferContactRequest(request)
        : await bufferBoundedRequest(request, ORPC_REQUEST_MAX_BYTES)
      : { request, tooLarge: false };
    if (boundedRequest.tooLarge && !isContactSubmission)
      return payloadTooLargeResponse();
    const bufferedContact = boundedRequest;
    const effectiveRequest = bufferedContact.request;
    const telemetry = telemetryFor(env);
    const requestId = resolveApiRequestId(effectiveRequest);

    return runWithRequestTelemetry(
      telemetry,
      {
        name: "orpc.request",
        correlation: { requestId, route: "/api/orpc" },
        attributes: { "rpc.system": "orpc" },
      },
      scheduleBackgroundTask,
      async (span) => {
        const databaseProfile = composeDatabaseProfile(env);
        const sink = createEvlogSink({
          runtime: evlogFor(env),
          request: effectiveRequest,
          executionContext: { waitUntil: scheduleBackgroundTask },
        });
        const diagnosticSink = createRequestDatabaseDiagnosticSink({
          sink,
          scheduleBackgroundTask,
          requestId,
        });
        let database: Awaited<ReturnType<typeof createDatabase>>;
        try {
          database = await createDatabase({
            connectionString: databaseProfile.connection.connectionString,
            diagnosticSink,
          });
        } catch (error) {
          if (error instanceof RequestDatabaseCapacityError) {
            return databaseCapacityResponse();
          }
          throw error;
        }
        const backgroundTasks = createBackgroundTaskLifecycle(
          scheduleBackgroundTask,
          async () => {
            try {
              return await database.close();
            } catch (_error) {
              return;
              // Closure is best-effort after the request result has been determined.
            } finally {
              admission.release();
            }
          }
        );

        try {
          const contactThrottle = isContactSubmission
            ? createContactThrottleRepository(database.db)
            : undefined;
          let contactThrottleKey: string | undefined;
          const contactEdgeThrottle = isContactSubmission
            ? createContactThrottleRepository(database.db, {
                maxRequests: CONTACT_EDGE_MAX_REQUESTS,
              })
            : undefined;
          if (
            contactThrottle !== undefined &&
            contactEdgeThrottle !== undefined
          ) {
            const edgeKey = await createContactThrottleKey(
              effectiveRequest,
              env.CONTACT_THROTTLE_SECRET,
              "edge"
            );
            let edgeResult: Awaited<
              ReturnType<typeof contactEdgeThrottle.consume>
            >;
            try {
              edgeResult = await contactEdgeThrottle.consume(edgeKey);
            } catch {
              return contactAbuseResponse("SERVICE_UNAVAILABLE");
            }
            if (!edgeResult.allowed) {
              return contactAbuseResponse(
                "TOO_MANY_REQUESTS",
                edgeResult.retryAfterSeconds
              );
            }
            if (bufferedContact.tooLarge) {
              return contactAbuseResponse("PAYLOAD_TOO_LARGE");
            }
            contactThrottleKey = await createContactThrottleKey(
              effectiveRequest,
              env.CONTACT_THROTTLE_SECRET,
              "submit"
            );
          }
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
          const contactDelivery = isContactSubmission
            ? selectContactEmailPort({
                environment: env.APP_ENV,
                transport: env.EMAIL_TRANSPORT,
                recipient: env.CONTACT_EMAIL_TO,
                previewDirectory: previewOptions?.contactDirectory,
                previewCaptureEndpoint: previewOptions?.captureEndpoint,
                previewBinding: previewOptions?.binding,
                resendApiKey: env.RESEND_API_KEY,
                from: env.EMAIL_FROM,
              })
            : undefined;
          const auth = createAuth({
            database: database.db,
            email,
            secret: env.BETTER_AUTH_SECRET,
            baseURL: env.BETTER_AUTH_URL,
            trustedOrigins: [env.APP_URL],
            scheduleBackgroundTask: backgroundTasks.schedule,
          });
          const semanticEvents = createSemanticEventFanout({
            sink,
            analytics: analyticsFor(env),
            resolveConsent: () => resolveAnalyticsConsent(request),
          });
          const repositories = createRepositories(database.db);
          const context = createApiContext(effectiveRequest, {
            repositories,
            capabilities: getProviderCapabilities(env),
            requireSession: (headers) => requireSession(auth, headers),
            requireRole: (headers, role) => requireRole(auth, headers, role),
            requestId,
            semanticEvents,
            span,
            waitUntil: scheduleBackgroundTask,
            ...(contactDelivery === undefined ||
            contactThrottle === undefined ||
            contactThrottleKey === undefined
              ? {}
              : { contactDelivery, contactThrottle, contactThrottleKey }),
          });
          return await handleOrpcRequest(effectiveRequest, context);
        } finally {
          const finalization = backgroundTasks.finalize();
          try {
            scheduleBackgroundTask(finalization);
            admission.transfer();
          } catch {
            await finalization;
          }
        }
      }
    );
  });
};

const handleOrpc = (request: Request): Promise<Response> => {
  return handleOrpcRuntimeRequest(request, waitUntil);
};

export const GET = handleOrpc;
export const POST = handleOrpc;
export const PATCH = handleOrpc;
export const DELETE = handleOrpc;
