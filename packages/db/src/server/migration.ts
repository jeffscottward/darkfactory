// What: Runs Drizzle migrations from packages/db/migrations.
// Used by: scripts/setup/setup.ts (migrate).
// See: docs/debugging.md#symptom--where-to-look (Migration fails); docs/deploy.md#migrations.
import { fileURLToPath } from "node:url";
import { migrate as runMigrations } from "drizzle-orm/node-postgres/migrator";

import type { Database } from "./client.ts";

export type MigrationOptions = Readonly<{
  migrationsFolder?: string;
}>;

const defaultMigrationsFolder = fileURLToPath(
  new URL("../../migrations", import.meta.url)
);

export const migrate = async (
  database: Database,
  options: MigrationOptions = {}
): Promise<void> => {
  await runMigrations(database, {
    migrationsFolder: options.migrationsFolder ?? defaultMigrationsFolder,
  });
};
