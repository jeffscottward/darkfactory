import { createApiClient } from "@darkfactory/api";

import { retryOnCapacity } from "./capacity-retry.ts";
import { INDETERMINATE_THEME } from "./server-theme.ts";
import {
  fetchThemeApiRequest,
  THEME_API_REQUEST_TIMEOUT_MS,
  type ThemeTransport,
} from "./theme-api-timeout.ts";

export interface ThemeApiRequestOptions {
  readonly appUrl: string | URL;
  readonly cookieHeader: string | null;
  readonly clientFactory?: typeof createApiClient;
  readonly fetch?: typeof globalThis.fetch;
  readonly requestId: string | null;
}

const isUnauthorized = (error: unknown): boolean => {
  if (typeof error !== "object" || error === null) return false;
  const record = error as Record<string, unknown>;
  return record["status"] === 401 && record["code"] === "UNAUTHORIZED";
};

const BETTER_AUTH_SESSION_COOKIE_NAMES = new Set([
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
]);
const hasBetterAuthSessionCookie = (cookieHeader: string | null): boolean => {
  if (cookieHeader === null) return false;
  for (const segment of cookieHeader.split(";")) {
    const separator = segment.indexOf("=");
    if (separator === -1) continue;
    const name = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();
    if (BETTER_AUTH_SESSION_COOKIE_NAMES.has(name) && value.length > 0) {
      return true;
    }
  }
  return false;
};

const FORWARDED_THEME_HEADERS = [
  "accept",
  "content-type",
  "x-orpc-procedure",
] as const;

const requireTrustedOrigin = (value: string): string => {
  const configured = new URL(value);
  if (configured.protocol !== "https:" || configured.origin !== value) {
    throw new TypeError("Theme transport requires a clean HTTPS app origin");
  }
  return configured.origin;
};

export const forwardThemeApiRequest = async ({
  cookieHeader,
  fetchRequest,
  request,
  requestId,
  timeoutMs,
  trustedOrigin,
}: {
  readonly cookieHeader: string | null;
  readonly fetchRequest: ThemeTransport;
  readonly request: Request;
  readonly requestId: string | null;
  readonly timeoutMs?: number;
  readonly trustedOrigin: string;
}): Promise<Response> => {
  const configuredOrigin = requireTrustedOrigin(trustedOrigin);
  if (new URL(request.url).origin !== configuredOrigin) {
    throw new Error(
      "Theme request origin did not match the configured app origin"
    );
  }
  const forwardedHeaders = new Headers();
  for (const name of FORWARDED_THEME_HEADERS) {
    const value = request.headers.get(name);
    if (value !== null) forwardedHeaders.set(name, value);
  }
  if (cookieHeader !== null) forwardedHeaders.set("cookie", cookieHeader);
  forwardedHeaders.set("origin", configuredOrigin);
  forwardedHeaders.set("sec-fetch-site", "same-origin");
  if (requestId !== null) forwardedHeaders.set("x-request-id", requestId);
  const forwardedRequest = new Request(request.url, {
    cache: "no-store",
    headers: forwardedHeaders,
    method: request.method,
    redirect: "manual",
    // Carries the loader's overall deadline into the in-flight attempt.
    ...(request.signal === undefined ? {} : { signal: request.signal }),
    ...(request.body === null ? {} : { body: request.body, duplex: "half" }),
  } as RequestInit);
  return await fetchThemeApiRequest({
    fetchRequest,
    request: forwardedRequest,
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  });
};

export const loadApiThemePreference = async ({
  appUrl,
  clientFactory = createApiClient,
  cookieHeader,
  fetch: fetchRequest = globalThis.fetch,
  requestId,
}: ThemeApiRequestOptions): Promise<unknown> => {
  if (!hasBetterAuthSessionCookie(cookieHeader)) return undefined;
  // One deadline spans every attempt and capacity wait, so retries never extend the render budget.
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort(
      new DOMException("Theme preference request timed out", "TimeoutError")
    );
  }, THEME_API_REQUEST_TIMEOUT_MS);
  try {
    const configuredAppUrl = new URL(appUrl);
    const trustedOrigin = requireTrustedOrigin(configuredAppUrl.origin);
    // Sibling dispatches of the same render can briefly fill the isolate DB cap;
    // without this bounded retry that flake rendered `indeterminate` (fail-closed but wrong).
    return await retryOnCapacity(fetchRequest, controller.signal, (observed) =>
      clientFactory({
        baseUrl: trustedOrigin,
        fetch: async (request) =>
          forwardThemeApiRequest({
            cookieHeader,
            fetchRequest: observed,
            request,
            requestId,
            trustedOrigin,
          }),
      }).preferences.theme.get({}, { signal: controller.signal })
    );
  } catch (error) {
    return isUnauthorized(error) ? undefined : INDETERMINATE_THEME;
  } finally {
    clearTimeout(timeout);
  }
};
