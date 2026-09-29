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
      'process.stdout.write(import.meta.resolve("@darkfactory/operator/server"))',
    ],
    { cwd: packageDirectory, encoding: "utf8" }
  );
};

describe("operator package boundary", function () {
  return it("fails closed for browser-only resolution through a dependency-free poison module", async function () {
    const resolution = resolveServerWith(["browser"]);
    const poisonSource = await readFile(
      new URL("./unsupported.ts", import.meta.url),
      "utf8"
    );

    expect({ status: resolution.status, stderr: resolution.stderr }).toEqual({
      status: 0,
      stderr: "",
    });
    expect(resolution.stdout).toMatch(/\/src\/server\/unsupported\.ts$/);
    expect(poisonSource).not.toMatch(/^\s*import\s/m);
    expect(poisonSource).not.toMatch(
      /@darkfactory\/(?:auth|db|jobs|state)|node:/i
    );
    return await expect(import("./unsupported.ts")).rejects.toThrow(
      "@darkfactory/operator/server is unavailable in browser bundles"
    );
  });
});
