import { spawnSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
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

describe("database package boundaries", () => {
  it("poisons browser-only resolution without importing Node or database vendors", async () => {
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

  it("resolves the real server for workerd or worker before browser", () => {
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

  it("keeps Node-only migration code out of the Worker runtime entry", async () => {
    const [entrySource, clientSource] = await Promise.all([
      readFile(new URL("./index.ts", import.meta.url), "utf8"),
      readFile(new URL("./client.ts", import.meta.url), "utf8"),
    ]);
    expect(entrySource).not.toMatch(/\bmigrate\b|migration\.ts/);
    return expect(clientSource).not.toMatch(
      /node:url|node-postgres\/migrator|fileURLToPath|\brunMigrations\b/
    );
  });

  it("leaves operator workflow code to @darkfactory/jobs", async () => {
    const sourceDirectory = new URL("../", import.meta.url);
    const self = fileURLToPath(import.meta.url);
    const sources = (
      await readdir(sourceDirectory, { recursive: true, withFileTypes: true })
    ).filter((entry) => entry.isFile() && entry.name.endsWith(".ts"));
    expect(sources.length).toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const entry of sources) {
      const path = `${entry.parentPath}/${entry.name}`;
      if (path === self) continue;
      if (/workflow/i.test(await readFile(path, "utf8"))) offenders.push(path);
    }
    expect(offenders).toEqual([]);
    const manifest = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    );
    return expect(Object.keys(manifest.exports).join()).not.toMatch(
      /workflow/i
    );
  });

  return it("keeps the schema export free of Node and PostgreSQL client imports", async () => {
    const schemaSource = await readFile(
      new URL("../schema/index.ts", import.meta.url),
      "utf8"
    );
    expect(schemaSource).not.toMatch(/from\s+["']node:/);
    return expect(schemaSource).not.toMatch(/from\s+["'](?:pg|postgres)["']/);
  });
});
