import { ensureDevelopmentSeedIdentity } from "@darkfactory/auth/server";
import { contactRateLimits } from "@darkfactory/db/schema";
import {
  createNodeDatabase,
  type Database,
  resetDevelopment,
  seedDevelopment,
} from "@darkfactory/db/server";
import { type E2EEnvironment, e2eEnvironment } from "../env.ts";

const EXPECTED_SEED_IDENTITIES = 3;

const withRunDatabase = async (
  env: E2EEnvironment,
  work: (database: Database) => Promise<void>
): Promise<void> => {
  const resource = createNodeDatabase({
    connectionString: env.databaseUrl,
    maxConnections: 1,
  });
  try {
    await work(resource.db);
  } finally {
    await resource.close();
  }
};

/** Truncates every app table and re-seeds exactly the three E2E identities. */
export const resetDatabase = (
  env: E2EEnvironment = e2eEnvironment()
): Promise<void> =>
  withRunDatabase(env, async (database) => {
    await resetDevelopment(database, { environment: "test" });
    const seeded = await seedDevelopment(database, {
      environment: "test",
      prepareIdentity: (identities) =>
        ensureDevelopmentSeedIdentity(
          {
            baseURL: env.appUrl,
            environment: "test",
            secret: env.authSecret,
            trustedOrigins: [env.appUrl],
          },
          identities
        ),
    });
    if (
      seeded.identitiesCreated !== EXPECTED_SEED_IDENTITIES ||
      seeded.usersConverged !== EXPECTED_SEED_IDENTITIES
    ) {
      throw new Error("E2E seed did not create exactly three identities");
    }
  });

/**
 * Empties the database-backed contact throttle. Every local submission shares
 * one throttle key, so a spec that really submits calls this before each
 * attempt, retries included.
 */
export const clearContactThrottle = (
  env: E2EEnvironment = e2eEnvironment()
): Promise<void> =>
  withRunDatabase(env, async (database) => {
    await database.delete(contactRateLimits);
  });
