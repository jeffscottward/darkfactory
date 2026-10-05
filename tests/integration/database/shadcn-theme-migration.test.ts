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
const THEME_MIGRATION = "0010_shadcn_themes";

interface Journal {
  entries: { tag: string }[];
}

let testDatabase: PostgresTestDatabase | undefined;
let databaseResource: DatabaseResource | undefined;
let previousMigrations: string | undefined;

const writePreviousMigrations = async (): Promise<string> => {
  const folder = await mkdtemp(join(tmpdir(), "darkfactory-themes-"));
  await cp(MIGRATIONS, folder, { recursive: true });
  const journalPath = join(folder, "meta/_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8")) as Journal;
  const index = journal.entries.findIndex(
    (entry) => entry.tag === THEME_MIGRATION
  );
  expect(index).toBeGreaterThan(0);
  journal.entries = journal.entries.slice(0, index);
  await writeFile(journalPath, JSON.stringify(journal));
  return folder;
};

describe("shadcn theme migration", { concurrent: false }, () => {
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

  it("moves retired theme names to System and keeps current ones", async () => {
    const database = testDatabase!;
    for (const [id, theme] of [
      ["theme-old-nord", "nord"],
      ["theme-old-latte", "catppuccin-latte"],
      ["theme-kept-tokyo", "tokyo-night"],
      ["theme-kept-dark", "default-dark"],
    ] as const) {
      await database.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ($1, $1, $2, true, now(), now())`,
        [id, `${id}@example.test`]
      );
      await database.query(
        "INSERT INTO user_preferences (user_id, theme, radius) VALUES ($1, $2, 'large')",
        [id, theme]
      );
    }

    await migrate(databaseResource!.db);

    const rows = await database.query<{
      radius: string;
      theme: string;
      user_id: string;
    }>("SELECT user_id, theme, radius FROM user_preferences ORDER BY user_id");
    expect(rows).toEqual([
      { radius: "large", theme: "default-dark", user_id: "theme-kept-dark" },
      { radius: "large", theme: "tokyo-night", user_id: "theme-kept-tokyo" },
      { radius: "large", theme: "system", user_id: "theme-old-latte" },
      { radius: "large", theme: "system", user_id: "theme-old-nord" },
    ]);
    await database.query(
      `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
       VALUES ('theme-new', 'theme-new', 'theme-new@example.test', true, now(), now())`
    );
    await database.query(
      "INSERT INTO user_preferences (user_id) VALUES ('theme-new')"
    );
    const [fresh] = await database.query<{ radius: string; theme: string }>(
      "SELECT theme, radius FROM user_preferences WHERE user_id = 'theme-new'"
    );
    expect(fresh).toEqual({ radius: "medium", theme: "system" });
    return await expect(
      database.query(
        "UPDATE user_preferences SET theme = 'nord' WHERE user_id = 'theme-new'"
      )
    ).rejects.toThrow(/user_preferences_theme_check/);
  });
});
