import { createAuth, type DarkFactoryAuth } from "@darkfactory/auth/server";
import { composeDatabaseProfile } from "@darkfactory/config/database";
import { parseServerEnv, type ServerEnv } from "@darkfactory/config/server";
import {
  type BackgroundTaskScheduler,
  type Database,
  openRequestScope,
  RequestDatabaseCapacityError,
  requestDatabaseCapacityResponse,
} from "@darkfactory/db/server";
import { selectEmailPort } from "@darkfactory/email/server";

import {
  assertLocalOperatorEnvironment,
  OPERATOR_APP_ORIGIN,
} from "./operator-environment.ts";

export interface OperatorRequestScope {
  readonly env: ServerEnv;
  readonly db: Database;
  readonly auth: DarkFactoryAuth;
}

export const createOperatorAuthForDatabase = (
  database: Database,
  env: ServerEnv,
  scheduleBackgroundTask: BackgroundTaskScheduler = () => undefined
): DarkFactoryAuth => {
  assertLocalOperatorEnvironment(env);
  const email = selectEmailPort({
    environment: env.APP_ENV,
    transport: env.EMAIL_TRANSPORT,
    resendApiKey: env.RESEND_API_KEY,
    from: env.EMAIL_FROM,
    trustedAppOrigin: OPERATOR_APP_ORIGIN,
  });
  return createAuth({
    database,
    email,
    secret: env.BETTER_AUTH_SECRET,
    baseURL: OPERATOR_APP_ORIGIN,
    trustedOrigins: [OPERATOR_APP_ORIGIN],
    rateLimitEnabled: env.APP_ENV !== "test",
    scheduleBackgroundTask,
  });
};

// The dev-only operator host has no `waitUntil`: finalization is awaited below,
// so the external scheduler only has to mark task rejections as handled.
const observeRejections: BackgroundTaskScheduler = (task) => {
  task.catch(() => undefined);
};

/**
 * Operator twin of apps/web/src/server/request-scope.ts#withRequestScope,
 * built on the same packages/db/src/server/request-scope.ts#openRequestScope:
 * tracked auth tasks drain before the one request connection closes.
 */
export const withOperatorScope = async <Result>(
  run: (scope: OperatorRequestScope) => Promise<Result>
): Promise<Result> => {
  const env = parseServerEnv(process.env);
  assertLocalOperatorEnvironment(env);
  const scope = await openRequestScope({
    connectionString: composeDatabaseProfile(env).connection.connectionString,
    schedule: observeRejections,
  });
  try {
    const auth = createOperatorAuthForDatabase(scope.db, env, scope.schedule);
    return await run({ env, db: scope.db, auth });
  } finally {
    await scope.finalize();
  }
};

/** Route-handler form: capacity exhaustion becomes the shared coded 503. */
export const withOperatorRequestScope = async (
  run: (scope: OperatorRequestScope) => Promise<Response>
): Promise<Response> => {
  try {
    return await withOperatorScope(run);
  } catch (error) {
    if (error instanceof RequestDatabaseCapacityError) {
      return requestDatabaseCapacityResponse();
    }
    throw error;
  }
};

export const withOperatorAuth = <Result>(
  operation: (auth: DarkFactoryAuth) => Promise<Result>
): Promise<Result> => withOperatorScope(({ auth }) => operation(auth));
