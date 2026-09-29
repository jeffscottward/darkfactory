import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import { users } from "@darkfactory/db/schema"
import { createNodeDatabase, type DatabaseExecutor } from "@darkfactory/db/server"
import { migrate } from "@darkfactory/db/server/migration"
import {
  createPostgresTestDatabase,
  dropPostgresTestDatabase,
  type PostgresTestDatabase,
} from "@darkfactory/testkit/postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { applyGenerationPlan } from "../../../scripts/generate-feature/apply.ts"
import { createGenerationPlan } from "../../../scripts/generate-feature/plan.ts"
import { validateFeatureName } from "../../../scripts/generate-feature/validate.ts"

const PROJECT_ROOT = fileURLToPath(new URL("../../..", import.meta.url))
const DB_PACKAGE = join(PROJECT_ROOT, "packages/db")
const FEATURE = "order-item"
const TABLE = "order_items"
const STATEMENT_BREAKPOINT = "--> statement-breakpoint"

// Copied from the real workspace so the generator sees the live registries and
// the checked-in migration journal instead of a synthetic fixture.
const WORKSPACE_REGISTRIES = [
  ".darkfactory/features.json",
  "apps/web/src/features/generated-navigation.ts",
  "packages/api/src/generated/contract-registry.ts",
  "packages/api/src/generated/public-registry.ts",
  "packages/api/src/generated/router-registry.ts",
  "packages/db/src/generated/repository-registry.ts",
  "packages/db/src/generated/schema-registry.ts",
] as const

type OrderItem = Readonly<{
  id: string
  ownerId: string
  name: string
  description: string
  status: string
  metadata: unknown
  createdAt: Date
  updatedAt: Date
}>

type OrderItemRepository = Readonly<{
  create: (input: Readonly<{ id: string; ownerId: string; name: string; description: string }>) => Promise<OrderItem>
  listByOwner: (ownerId: string) => Promise<readonly OrderItem[]>
}>

type DrizzleSnapshot = Readonly<{ id: string }>

type DrizzleKitApi = Readonly<{
  generateDrizzleJson: (imports: Record<string, unknown>, prevId?: string) => DrizzleSnapshot
  generateMigration: (previous: DrizzleSnapshot, current: DrizzleSnapshot) => Promise<string[]>
}>

let workspaceRoot: string
let migrationPath: string
let testDatabase: PostgresTestDatabase
let databaseResource: ReturnType<typeof createNodeDatabase>

// The workspace lives under the db package's ignored `.cache/` so generated
// Drizzle modules resolve `drizzle-orm` exactly as checked-in schema code does.
const createWorkspaceCopy = async (): Promise<string> => {
  const cacheDirectory = join(DB_PACKAGE, ".cache")
  await mkdir(cacheDirectory, { recursive: true })
  const root = await mkdtemp(join(cacheDirectory, "generator-integration-"))
  await writeFile(join(root, "package.json"), `${JSON.stringify({ name: "generator-integration", private: true })}\n`, "utf8")
  for (const path of WORKSPACE_REGISTRIES) {
    await mkdir(join(root, dirname(path)), { recursive: true })
    await writeFile(join(root, path), await readFile(join(PROJECT_ROOT, path), "utf8"), "utf8")
  }
  await cp(join(DB_PACKAGE, "migrations"), join(root, "packages/db/migrations"), { recursive: true })
  await mkdir(join(root, "packages/db/src/schema"), { recursive: true })
  await writeFile(
    join(root, "packages/db/src/schema/index.ts"),
    `export * from ${JSON.stringify(join(DB_PACKAGE, "src/schema/index.ts"))}\n`,
    "utf8",
  )
  return root
}

const generatedPath = (path: string): string => join(workspaceRoot, path)

const generatedMigration = (): Promise<string> => {
  return readFile(generatedPath(migrationPath), "utf8")
}

const loadDrizzleKit = async (): Promise<DrizzleKitApi> => {
  const entry = createRequire(join(DB_PACKAGE, "package.json")).resolve("drizzle-kit/api")
  const loaded = await import(entry) as DrizzleKitApi & Readonly<{ default?: DrizzleKitApi }>
  return loaded.default ?? loaded
}

const insertUser = async (id: string): Promise<void> => {
  await testDatabase.query(
    'INSERT INTO "user" (id, name, email) VALUES ($1, $2, $3)',
    [id, "Generator Owner", `${id}@example.test`],
  )
}

describe("generated feature migration on real Postgres", function() {
  beforeAll(async function() {
    workspaceRoot = await createWorkspaceCopy()
    const plan = await createGenerationPlan(workspaceRoot, validateFeatureName(FEATURE))
    migrationPath = plan.files.map((file) => file.path).find((path) => path.startsWith("packages/db/migrations/") && path.endsWith(".sql"))!
    await applyGenerationPlan(plan)
    testDatabase = await createPostgresTestDatabase()
    databaseResource = createNodeDatabase({
      connectionString: testDatabase.databaseUrl,
      maxConnections: 2,
    })
    await migrate(databaseResource.db, {
      migrationsFolder: generatedPath("packages/db/migrations"),
    })
    await insertUser("generator-owner")
    return await insertUser("cascade-owner")
  }
  , 60_000)

  afterAll(async function() {
    try {
      if (databaseResource !== undefined) {
        return await databaseResource.close()
      };return
    }
    finally {
      try {
        if (testDatabase !== undefined) {
          await dropPostgresTestDatabase(testDatabase)
        }
      }
      finally {
        if (workspaceRoot !== undefined) {
          await rm(workspaceRoot, { force: true, recursive: true })
        }
      }
    }
  }
  , 60_000)

  it("applies the generated migration after every checked-in migration", async function() {
    const journal = JSON.parse(await readFile(generatedPath("packages/db/migrations/meta/_journal.json"), "utf8")) as Readonly<{ entries: readonly Readonly<{ tag: string }>[] }>
    const applied = await testDatabase.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM drizzle.__drizzle_migrations",
    )

    expect(`packages/db/migrations/${journal.entries.at(-1)?.tag}.sql`).toBe(migrationPath)
    return expect(Number(applied[0]?.count)).toBe(journal.entries.length)
  })

  it("creates the owner foreign key to user(id) and the schema constraints", async function() {
    const constraints = await testDatabase.query<{ name: string; definition: string }>(
      `SELECT conname AS name, pg_get_constraintdef(oid) AS definition
       FROM pg_constraint WHERE conrelid = 'public.${TABLE}'::regclass ORDER BY conname`,
    )
    const indexes = await testDatabase.query<{ name: string; definition: string }>(
      "SELECT indexname AS name, indexdef AS definition FROM pg_indexes WHERE schemaname = 'public' AND tablename = $1 ORDER BY indexname",
      [TABLE],
    )

    expect(constraints).toEqual([
      { name: `${TABLE}_name_check`, definition: "CHECK ((length(TRIM(BOTH FROM name)) > 0))" },
      { name: `${TABLE}_owner_id_user_id_fk`, definition: 'FOREIGN KEY (owner_id) REFERENCES "user"(id) ON DELETE CASCADE' },
      { name: `${TABLE}_pkey`, definition: "PRIMARY KEY (id)" },
      { name: `${TABLE}_status_check`, definition: "CHECK ((status = ANY (ARRAY['draft'::text, 'active'::text, 'archived'::text])))" },
    ])
    return expect(indexes).toEqual([
      { name: `${TABLE}_owner_id_idx`, definition: `CREATE INDEX ${TABLE}_owner_id_idx ON public.${TABLE} USING btree (owner_id, updated_at DESC NULLS LAST, id DESC NULLS LAST)` },
      { name: `${TABLE}_pkey`, definition: `CREATE UNIQUE INDEX ${TABLE}_pkey ON public.${TABLE} USING btree (id)` },
    ])
  })

  it("matches drizzle-kit output for the generated Drizzle schema", async function() {
    const drizzleKit = await loadDrizzleKit()
    const schema = await import(generatedPath(`packages/db/src/generated/${FEATURE}/schema.civet`)) as Readonly<Record<string, unknown>>
    const previous = drizzleKit.generateDrizzleJson({ users })
    const current = drizzleKit.generateDrizzleJson({ users, orderItems: schema["orderItems"] }, previous.id)
    const expected = await drizzleKit.generateMigration(previous, current)

    return expect((await generatedMigration()).split(STATEMENT_BREAKPOINT).map((statement) => statement.trim())).toEqual(
      expected.map((statement) => statement.trim()),
    )
  })

  it("stores rows for a real user through the generated repository", async function() {
    const module = await import(generatedPath(`packages/db/src/generated/${FEATURE}/repository.civet`)) as Readonly<{
      createOrderItemRepository: (database: DatabaseExecutor) => OrderItemRepository
    }>
    const repository = module.createOrderItemRepository(databaseResource.db)

    const created = await repository.create({
      id: "order-item-1",
      ownerId: "generator-owner",
      name: "First order item",
      description: "",
    })

    expect(created).toMatchObject({ status: "draft", metadata: {} })
    expect(created.createdAt).toBeInstanceOf(Date)
    return expect(await repository.listByOwner("generator-owner")).toEqual([created])
  })

  it.each([
    ["an invalid status", "status_check", "generator-owner", "Valid name", "shipped", "23514"],
    ["a blank name", "name_check", "generator-owner", "   ", "draft", "23514"],
    ["an unknown owner", "owner_id_user_id_fk", "missing-owner", "Valid name", "draft", "23503"],
  ])("rejects %s", async function(_case, constraint, ownerId, name, status, code) {
    return await expect(testDatabase.query(
      `INSERT INTO "${TABLE}" (id, owner_id, name, description, status) VALUES ($1, $2, $3, '', $4)`,
      [`rejected-${constraint}`, ownerId, name, status],
    )).rejects.toMatchObject({ code, constraint: `${TABLE}_${constraint}` })
  }
  )

  return it("cascades owner deletion", async function() {
    await testDatabase.query(
      `INSERT INTO "${TABLE}" (id, owner_id, name, description) VALUES ('cascade-item', 'cascade-owner', 'Owned', '')`,
    )
    await testDatabase.query('DELETE FROM "user" WHERE id = $1', ["cascade-owner"])

    const remaining = await testDatabase.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM "${TABLE}" WHERE owner_id = $1`,
      ["cascade-owner"],
    )
    return expect(remaining[0]?.count).toBe("0")
  })
})
