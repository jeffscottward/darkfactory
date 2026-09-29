import { cache } from "react";

import { dispatchInternalAuthRequest } from "./server-internal-dispatch.ts";
import { getPortalSession } from "./server-session.ts";

export const getRequestPortalSession = cache(
  (cookieHeader: string | null, cfConnectingIp: string | null) =>
    getPortalSession({
      cookieHeader,
      cfConnectingIp,
      fetch: dispatchInternalAuthRequest,
    })
);
