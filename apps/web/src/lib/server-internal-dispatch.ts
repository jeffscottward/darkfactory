import { waitUntil } from "cloudflare:workers";
import { resolveApiRequestId } from "@darkfactory/api/server";
import { headers } from "next/headers";
import { cache } from "react";

import { handleAuthRequest } from "../app/api/auth/[...all]/handler.ts";
import { handleOrpcRuntimeRequest } from "../app/api/orpc/[...rest]/route.ts";
import { resolvePortalAppUrl } from "./server-session.ts";

const ORPC_ROUTE_PREFIX = "/api/orpc/";
const ORPC_METHODS: ReadonlySet<string> = new Set([
  "GET",
  "POST",
  "PATCH",
  "DELETE",
]);

const requestFrom = (input: RequestInfo | URL, init?: RequestInit): Request =>
  input instanceof Request && init === undefined
    ? input
    : new Request(input, init);

/*
 * Each dispatch runs the full route handler and therefore opens its own
 * request scope and pg Client (see apps/web/src/server/request-scope.ts).
 * Sharing one Client across the dispatches of a render was rejected: pg
 * multiplexes nothing, so concurrent `db.transaction` calls from sibling
 * dispatches (layout theme + page data) would interleave their statements
 * inside each other's BEGIN/COMMIT. Capacity pressure is handled instead by
 * the callers' bounded retry (see ./capacity-retry.ts#retryOnCapacity).
 */

/**
 * The parent page request's id (its edge-set `cf-ray`, else a UUID), memoized
 * per server request by React `cache` so every dispatch of one render shares
 * it. It is handed to the route handler as an explicit in-process argument,
 * never as a header: a header is forgeable by any network client.
 */
const parentRequestId = cache(
  async (): Promise<string> => resolveApiRequestId({ headers: await headers() })
);

const isConfiguredOrigin = (url: URL): boolean => {
  return url.origin === resolvePortalAppUrl().origin;
};

const abortReason = (signal: AbortSignal): unknown => {
  return signal.reason === undefined
    ? new DOMException("The operation was aborted", "AbortError")
    : signal.reason;
};

const dispatchWithAbort = (
  request: Request,
  handle: () => Promise<Response>
): Promise<Response> => {
  const signal = request.signal;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  const operation = handle();

  return new Promise<Response>((resolve, reject) => {
    let settled = false;
    let completion!: Promise<void>;
    const removeAbortListener = () => {
      return signal.removeEventListener("abort", abort);
    };
    const abort = () => {
      if (settled) return;
      settled = true;
      removeAbortListener();
      try {
        waitUntil(completion);
      } catch {
        // The operation still has a rejection handler when scheduling is unavailable.
      }
      return reject(abortReason(signal));
    };
    completion = operation.then(
      (response) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        return resolve(response);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        removeAbortListener();
        return reject(error);
      }
    );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) return abort();
    return;
  });
};

export const dispatchInternalAuthRequest: typeof globalThis.fetch = async (
  input,
  init
) => {
  const request = requestFrom(input, init);
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.pathname !== "/api/auth/get-session" ||
    !isConfiguredOrigin(url)
  ) {
    throw new TypeError(
      "Internal auth dispatch requires GET /api/auth/get-session on the configured app origin"
    );
  }
  return await dispatchWithAbort(request, async () =>
    handleAuthRequest(request, waitUntil, await parentRequestId())
  );
};

export const dispatchInternalOrpcRequest: typeof globalThis.fetch = async (
  input,
  init
) => {
  const request = requestFrom(input, init);
  const url = new URL(request.url);
  if (
    !(
      ORPC_METHODS.has(request.method) &&
      url.pathname.startsWith(ORPC_ROUTE_PREFIX)
    ) ||
    url.pathname.length === ORPC_ROUTE_PREFIX.length ||
    !isConfiguredOrigin(url)
  ) {
    throw new TypeError(
      "Internal oRPC dispatch requires a routed API request on the configured app origin"
    );
  }
  return await dispatchWithAbort(request, async () =>
    handleOrpcRuntimeRequest(request, waitUntil, await parentRequestId())
  );
};
