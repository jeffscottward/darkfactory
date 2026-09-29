import { waitUntil } from "cloudflare:workers";
import { createPostHogAnalyticsPort } from "@darkfactory/analytics/server/posthog";
import { CONTACT_ERRORS } from "@darkfactory/api";
import {
  type ApiContextDependencies,
  createApiContext,
} from "@darkfactory/api/server";
import { requireRole, requireSession } from "@darkfactory/auth/server";
import {
  getProviderCapabilities,
  parseServerEnv,
  type ServerEnv,
} from "@darkfactory/config/server";
import {
  type BackgroundTaskScheduler,
  type ContactThrottleResult,
  createContactThrottleRepository,
  createRepositories,
} from "@darkfactory/db/server";
import { selectContactEmailPort } from "@darkfactory/email/server";
import { createSemanticEventFanout } from "@darkfactory/observability/server/fanout";
import { initializeTelemetry } from "@darkfactory/observability/server/otel";

import { bufferBoundedRequest } from "../../../../lib/bounded-request-body.ts";
import { resolveE2eEmailPreviewOptions } from "../../../../lib/e2e-fixtures.ts";
import {
  type WebRequestScope,
  withRequestScope,
} from "../../../../server/request-scope.ts";
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

let telemetryRuntime: ReturnType<typeof initializeTelemetry> | undefined;
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

const methodNotAllowedResponse = (): Response => {
  return new Response("Method Not Allowed", {
    status: 405,
    headers: { allow: SUPPORTED_ORPC_METHODS.join(", ") },
  });
};

const payloadTooLargeResponse = (): Response => {
  return Response.json({ error: "Payload Too Large" }, { status: 413 });
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

type ContactDependencies = Required<
  Pick<
    ApiContextDependencies,
    "contactDelivery" | "contactThrottle" | "contactThrottleKey"
  >
>;

/** Edge throttle first (it also counts malformed and oversized submissions), then the submit key and delivery port. */
const admitContactSubmission = async (
  scope: WebRequestScope,
  request: Request,
  tooLarge: boolean
): Promise<ContactDependencies | Response> => {
  const edgeThrottle = createContactThrottleRepository(scope.db, {
    maxRequests: CONTACT_EDGE_MAX_REQUESTS,
  });
  const edgeKey = await createContactThrottleKey(
    request,
    scope.env.CONTACT_THROTTLE_SECRET,
    "edge"
  );
  let edgeResult: ContactThrottleResult;
  try {
    edgeResult = await edgeThrottle.consume(edgeKey);
  } catch {
    return contactAbuseResponse("SERVICE_UNAVAILABLE");
  }
  if (!edgeResult.allowed) {
    return contactAbuseResponse(
      "TOO_MANY_REQUESTS",
      edgeResult.retryAfterSeconds
    );
  }
  if (tooLarge) return contactAbuseResponse("PAYLOAD_TOO_LARGE");

  const previewOptions = resolveE2eEmailPreviewOptions();
  return {
    contactThrottle: createContactThrottleRepository(scope.db),
    contactThrottleKey: await createContactThrottleKey(
      request,
      scope.env.CONTACT_THROTTLE_SECRET,
      "submit"
    ),
    contactDelivery: selectContactEmailPort({
      environment: scope.env.APP_ENV,
      transport: scope.env.EMAIL_TRANSPORT,
      recipient: scope.env.CONTACT_EMAIL_TO,
      previewDirectory: previewOptions?.contactDirectory,
      previewCaptureEndpoint: previewOptions?.captureEndpoint,
      previewBinding: previewOptions?.binding,
      resendApiKey: scope.env.RESEND_API_KEY,
      from: scope.env.EMAIL_FROM,
    }),
  };
};

export const handleOrpcRuntimeRequest = async (
  request: Request,
  waitUntil: BackgroundTaskScheduler
): Promise<Response> => {
  const env = parseServerEnv(process.env);
  const method = request.method.toUpperCase();
  if (!SUPPORTED_ORPC_METHODS.includes(method))
    return methodNotAllowedResponse();
  if (unsafeRequestDenied(request, env.APP_URL))
    return forbiddenOriginResponse();

  // Cheap rejections and body bounding run before the scope opens a connection.
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
  const effectiveRequest = boundedRequest.request;

  return await withRequestScope(effectiveRequest, waitUntil, (scope) =>
    runWithRequestTelemetry(
      telemetryFor(env),
      {
        name: "orpc.request",
        correlation: { requestId: scope.requestId, route: "/api/orpc" },
        attributes: { "rpc.system": "orpc" },
      },
      waitUntil,
      async (span) => {
        let contact: ContactDependencies | undefined;
        if (isContactSubmission) {
          const admitted = await admitContactSubmission(
            scope,
            effectiveRequest,
            boundedRequest.tooLarge
          );
          if (admitted instanceof Response) return admitted;
          contact = admitted;
        }
        const context = createApiContext(effectiveRequest, {
          repositories: createRepositories(scope.db),
          capabilities: getProviderCapabilities(scope.env),
          requireSession: (headers) => requireSession(scope.auth, headers),
          requireRole: (headers, role) =>
            requireRole(scope.auth, headers, role),
          requestId: scope.requestId,
          semanticEvents: createSemanticEventFanout({
            sink: scope.sink,
            analytics: analyticsFor(scope.env),
            resolveConsent: () => resolveAnalyticsConsent(request),
          }),
          span,
          // Not DB-bound, so it must not hold the connection open: use the raw waitUntil.
          waitUntil,
          ...contact,
        });
        return await handleOrpcRequest(effectiveRequest, context);
      }
    )
  );
};

const handleOrpc = (request: Request): Promise<Response> => {
  return handleOrpcRuntimeRequest(request, waitUntil);
};

export const GET = handleOrpc;
export const POST = handleOrpc;
export const PATCH = handleOrpc;
export const DELETE = handleOrpc;
