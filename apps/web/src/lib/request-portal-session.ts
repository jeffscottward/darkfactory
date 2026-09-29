import { cache } from "react";

import { dispatchInternalAuthRequest } from "./server-internal-dispatch.ts";
import { getPortalSession } from "./server-session.ts";

export const getRequestPortalSession = cache(function (
  cookieHeader: string | null,
  cfConnectingIp: string | null
) {
  return getPortalSession({
    cookieHeader,
    cfConnectingIp,
    fetch: dispatchInternalAuthRequest,
  });
});
