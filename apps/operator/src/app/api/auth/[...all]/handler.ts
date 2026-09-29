import { createAuthHandler } from "@darkfactory/auth/server";

import { withOperatorRequestScope } from "../../../../server/operator-auth.ts";

export const handleOperatorAuthRequest = (
  request: Request
): Promise<Response> =>
  withOperatorRequestScope(({ auth }) => createAuthHandler(auth)(request));
