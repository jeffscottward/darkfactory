import type { SafeAuthSession, UserRole } from "@darkfactory/auth/types";
import type { Repositories } from "@darkfactory/db/server";
import type {
  SemanticEventPort,
  SpanHandle,
  WaitUntil,
} from "@darkfactory/observability/port";
import type { CapabilityProjection } from "../contract.ts";
import type {
  ContactDeliveryPort,
  ContactThrottlePort,
} from "./contact-service.ts";

export type ApiContext = Readonly<{
  requestId: string;
  repositories: Repositories;
  capabilities: CapabilityProjection;
  requireSession: () => Promise<SafeAuthSession>;
  requireRole: (role: UserRole) => Promise<SafeAuthSession>;
  semanticEvents?: SemanticEventPort;
  span?: SpanHandle;
  waitUntil?: WaitUntil;
  contactDelivery?: ContactDeliveryPort;
  contactThrottle?: ContactThrottlePort;
  contactThrottleKey?: string;
}>;

export type ApiRequestIdOptions = Readonly<{
  requestId?: string;
  generateRequestId?: () => string;
}>;

export type ApiContextDependencies = Readonly<{
  repositories: Repositories;
  capabilities: CapabilityProjection;
  requireSession: (headers: Headers) => Promise<SafeAuthSession>;
  requireRole: (headers: Headers, role: UserRole) => Promise<SafeAuthSession>;
  requestId?: string;
  generateRequestId?: () => string;
  semanticEvents?: SemanticEventPort;
  span?: SpanHandle;
  waitUntil?: WaitUntil;
  contactDelivery?: ContactDeliveryPort;
  contactThrottle?: ContactThrottlePort;
  contactThrottleKey?: string;
}>;

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
// Cloudflare ray ids: 16 lowercase hex digits, optionally suffixed with the colo code.
const CF_RAY_PATTERN = /^[0-9a-f]{16}(?:-[A-Z]{3})?$/;

/**
 * Correlation id for one request, shared by evlog, the OTel span and audit rows.
 * Order: an injected id (in-process dispatch passes its parent's, see
 * apps/web/src/lib/server-internal-dispatch.ts), then a pattern-checked
 * edge-set `cf-ray`, then a fresh UUID. A public `x-request-id` is never
 * read: it would let a client choose its own `audit_records.request_id`.
 */
export const resolveApiRequestId = (
  request: Readonly<{ headers: Pick<Headers, "get"> }>,
  options: ApiRequestIdOptions = {}
): string => {
  if (options.requestId !== undefined) {
    if (!REQUEST_ID_PATTERN.test(options.requestId)) {
      throw new TypeError(
        "requestId must be 1-128 safe correlation characters"
      );
    }
    return options.requestId;
  }

  const ray = request.headers.get("cf-ray");
  if (ray !== null && CF_RAY_PATTERN.test(ray)) return ray;

  const generated = options.generateRequestId?.() ?? crypto.randomUUID();
  if (!REQUEST_ID_PATTERN.test(generated)) {
    throw new TypeError(
      "generated requestId must be 1-128 safe correlation characters"
    );
  }
  return generated;
};

export const createApiContext = (
  request: Request,
  dependencies: ApiContextDependencies
): ApiContext => ({
  requestId: resolveApiRequestId(request, dependencies),
  repositories: dependencies.repositories,
  capabilities: dependencies.capabilities,
  requireSession: () => dependencies.requireSession(request.headers),
  requireRole: (role) => dependencies.requireRole(request.headers, role),
  ...(dependencies.semanticEvents === undefined
    ? {}
    : { semanticEvents: dependencies.semanticEvents }),
  ...(dependencies.span === undefined ? {} : { span: dependencies.span }),
  ...(dependencies.waitUntil === undefined
    ? {}
    : { waitUntil: dependencies.waitUntil }),
  ...(dependencies.contactDelivery === undefined
    ? {}
    : { contactDelivery: dependencies.contactDelivery }),
  ...(dependencies.contactThrottle === undefined
    ? {}
    : { contactThrottle: dependencies.contactThrottle }),
  ...(dependencies.contactThrottleKey === undefined
    ? {}
    : { contactThrottleKey: dependencies.contactThrottleKey }),
});
