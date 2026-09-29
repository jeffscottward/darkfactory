import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageDirectory = fileURLToPath(new URL("../..", import.meta.url));
const resolveServerWith = (conditions: readonly string[]) => {
  return spawnSync(
    process.execPath,
    [
      ...conditions.map((condition) => `--conditions=${condition}`),
      "--input-type=module",
      "--eval",
      'process.stdout.write(import.meta.resolve("@darkfactory/db/server"))',
    ],
    { cwd: packageDirectory, encoding: "utf8" }
  );
};

describe("database package boundaries", function () {
  it("poisons browser-only resolution without importing Node or database vendors", async function () {
    const manifest = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    );
    expect(manifest.exports["./server"]).toMatchObject({
      workerd: "./src/server/index.ts",
      worker: "./src/server/index.ts",
      browser: "./src/server/unsupported.ts",
    });
    expect(manifest.exports["./server/migration"]).toEqual({
      import: "./src/server/migration.ts",
      default: "./src/server/migration.ts",
    });
    expect(manifest.sideEffects).toEqual(["./src/server/unsupported.ts"]);

    const poisonSource = await readFile(
      new URL("./unsupported.ts", import.meta.url),
      "utf8"
    );
    expect(poisonSource).not.toMatch(/^\s*import\s/m);
    expect(poisonSource).not.toMatch(/drizzle|postgres|\bpg\b|node:/i);

    const result = resolveServerWith(["browser"]);
    expect({ status: result.status, stderr: result.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    expect(result.stdout).toMatch(/\/src\/server\/unsupported\.ts$/);
    return await expect(import("./unsupported.ts")).rejects.toThrow(
      "@darkfactory/db/server is unavailable in browser bundles"
    );
  });

  it("resolves the real server for workerd or worker before browser", function () {
    const workerd = resolveServerWith(["workerd", "browser"]);
    const worker = resolveServerWith(["worker", "browser"]);

    expect({ status: workerd.status, stderr: workerd.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    expect(workerd.stdout).toMatch(/\/src\/server\/index\.ts$/);
    expect({ status: worker.status, stderr: worker.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    return expect(worker.stdout).toMatch(/\/src\/server\/index\.ts$/);
  });

  it("keeps Node-only migration code out of the Worker runtime entry", async function () {
    const [entrySource, clientSource] = await Promise.all([
      readFile(new URL("./index.ts", import.meta.url), "utf8"),
      readFile(new URL("./client.ts", import.meta.url), "utf8"),
    ]);
    expect(entrySource).not.toMatch(/\bmigrate\b|migration\.ts/);
    return expect(clientSource).not.toMatch(
      /node:url|node-postgres\/migrator|fileURLToPath|\brunMigrations\b/
    );
  });

  return it("keeps the schema export free of Node and PostgreSQL client imports", async function () {
    const schemaSource = await readFile(
      new URL("../schema/index.ts", import.meta.url),
      "utf8"
    );
    expect(schemaSource).not.toMatch(/from\s+["']node:/);
    return expect(schemaSource).not.toMatch(/from\s+["'](?:pg|postgres)["']/);
  });
});
