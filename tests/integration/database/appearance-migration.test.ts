import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createNodeDatabase,
  type DatabaseResource,
} from "@darkfactory/db/server";
import { migrate } from "@darkfactory/db/server/migration";
import {
  createPostgresTestDatabase,
  dropPostgresTestDatabase,
  type PostgresTestDatabase,
} from "@darkfactory/testkit/postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const MIGRATIONS = fileURLToPath(
  new URL("../../../packages/db/migrations", import.meta.url)
);
const APPEARANCE_MIGRATION = "0009_appearance_preferences";

interface Journal {
  entries: { tag: string }[];
}

let testDatabase: PostgresTestDatabase | undefined;
let databaseResource: DatabaseResource | undefined;
let previousMigrations: string | undefined;

const writePreviousMigrations = async (): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), "darkfactory-appearance-"));
  await cp(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const index = journal.entries.findIndex(
    (entry) => entry.tag === APPEARANCE_MIGRATION
  );
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
};

describe("appearance preference migration", { concurrent: false }, () => {
  beforeAll(async () => {
    previousMigrations = await writePreviousMigrations();
    testDatabase = await createPostgresTestDatabase();
    databaseResource = createNodeDatabase({
      connectionString: testDatabase.databaseUrl,
      maxConnections: 2,
    });
    return await migrate(databaseResource.db, {
      migrationsFolder: previousMigrations,
    });
  }, 60_000);

  afterAll(async () => {
    try {
      await databaseResource?.close();
    } finally {
      try {
        if (testDatabase !== undefined) {
          await dropPostgresTestDatabase(testDatabase);
        }
      } finally {
        if (previousMigrations !== undefined) {
          await rm(previousMigrations, { recursive: true, force: true });
        }
      }
    }
  }, 60_000);

  it("maps every old mode and palette row to the appearance defaults", async () => {
    const database = testDatabase!;
    for (const [id, mode, colorScheme] of [
      ["appearance-old-dark", "dark", "violet"],
      ["appearance-old-light", "light", "amber"],
    ] as const) {
      await database.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
      await database.query(
        "INSERT INTO user_preferences (user_id, mode, color_scheme) VALUES ($1, $2, $3)",
        [id, mode, colorScheme]
      );
    }

    await migrate(databaseResource!.db);

    const rows = await database.query<Record<string, unknown>>(
      "SELECT * FROM user_preferences ORDER BY user_id"
    );
    for (const row of rows) {
      expect(row).not.toHaveProperty("mode");
      expect(row).not.toHaveProperty("color_scheme");
    }
    return expect(
      rows.map(({ user_id, theme, font_size, density, radius }) => ({
        user_id,
        theme,
        font_size,
        density,
        radius,
      }))
    ).toEqual(
      ["appearance-old-dark", "appearance-old-light"].map((user_id) => ({
        user_id,
        theme: "system",
        font_size: "default",
        density: "default",
        radius: "small",
      }))
    );
  });
});
