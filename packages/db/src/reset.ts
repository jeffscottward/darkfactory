import { sql } from "drizzle-orm";
import type { DevelopmentEnvironment } from "./seeds/index.ts";
import { type Database, withTransaction } from "./server/client.ts";

export type ResetDevelopmentOptions = Readonly<{
  environment: DevelopmentEnvironment;
}>;

export type ResetDevelopmentResult = Readonly<{
  tablesCleared: number;
}>;

export class DevelopmentResetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DevelopmentResetError";
  }
}

export const resetDevelopment = async (
  database: Database,
  options: ResetDevelopmentOptions
): Promise<ResetDevelopmentResult> => {
  if (options.environment !== "development" && options.environment !== "test") {
    throw new DevelopmentResetError(
      "Development reset requires an explicit development or test environment"
    );
  }

  await withTransaction(database, async (transaction) => {
    return await transaction.execute(sql`
      TRUNCATE TABLE
        "session",
        "account",
        "addresses",
        "profiles",
        "user_preferences",
        "feature_items",
        "contact_rate_limits",
        "workflow_omp_resources",
        "workflow_messages",
        "workflow_evidence",
        "workflow_approvals",
        "workflow_snapshots",
        "workflow_journal",
        "workflow_runs",
        "audit_records",
        "user",
        "verification",
        "rate_limit",
        "outbox_events"
      RESTART IDENTITY
    `);
  });

  return Object.freeze({ tablesCleared: 19 });
};
