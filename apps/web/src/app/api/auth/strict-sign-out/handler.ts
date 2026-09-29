import { createDatabaseConfirmedSignOutHandler } from "@darkfactory/auth/db";
import type { BackgroundTaskScheduler } from "@darkfactory/db/server";

import { withRequestScope } from "../../../../server/request-scope.ts";

export const handleStrictSignOutRequest = (
  request: Request,
  waitUntil: BackgroundTaskScheduler
): Promise<Response> =>
  withRequestScope(request, waitUntil, ({ auth, db, env }) =>
    createDatabaseConfirmedSignOutHandler({
      auth,
      database: db,
      secret: env.BETTER_AUTH_SECRET,
      trustedOrigin: env.APP_URL,
    })(request)
  );
