import { createAuthHandler } from "@darkfactory/auth/server";
import type { BackgroundTaskScheduler } from "@darkfactory/db/server";

import { bufferBoundedRequest } from "../../../../lib/bounded-request-body.ts";
import { withRequestScope } from "../../../../server/request-scope.ts";

const AUTH_BODY_METHODS: readonly string[] = ["POST", "PUT", "PATCH", "DELETE"];
export const AUTH_REQUEST_MAX_BYTES = 64 * 1024;

export const handleAuthRequest = async (
  request: Request,
  waitUntil: BackgroundTaskScheduler,
  internalParentRequestId?: string
): Promise<Response> => {
  // Bound the body before the scope opens a connection, so oversized input never costs a DB slot.
  const bounded = AUTH_BODY_METHODS.includes(request.method.toUpperCase())
    ? await bufferBoundedRequest(request, AUTH_REQUEST_MAX_BYTES)
    : { request, tooLarge: false };
  if (bounded.tooLarge) {
    return Response.json({ error: "Payload Too Large" }, { status: 413 });
  }
  return await withRequestScope(
    bounded.request,
    waitUntil,
    ({ auth }) => createAuthHandler(auth)(bounded.request),
    internalParentRequestId
  );
};
