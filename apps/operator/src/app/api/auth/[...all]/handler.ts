import { createAuthHandler } from "@darkfactory/auth/server";

import { createOperatorAuthRuntime } from "../../../../server/operator-auth.ts";

export const handleOperatorAuthRequest = async (
  request: Request
): Promise<Response> => {
  const runtime = await createOperatorAuthRuntime();
  try {
    return await createAuthHandler(runtime.auth)(request);
  } finally {
    await runtime.close();
  }
};
