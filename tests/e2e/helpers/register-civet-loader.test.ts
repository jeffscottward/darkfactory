import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const repositoryPath = fileURLToPath(new URL("../../../", import.meta.url));

describe("Civet E2E loader boundary", () => {
  it("reaches a safe validation failure through the exact configured loader", () => {
    const result = spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--import",
        "./tests/e2e/helpers/register-civet-loader.mjs",
        "./tests/e2e/helpers/web-server.civet",
      ],
      {
        cwd: repositoryPath,
        encoding: "utf8",
        env: {
          APP_ENV: "invalid",
          DATABASE_URL: "",
          E2E_RUN_ADOPTION: "",
          E2E_RUN_ID: "",
          HOME: process.env["HOME"] ?? "",
          NODE_NO_WARNINGS: "1",
          NODE_ENV: "test",
          PATH: process.env["PATH"] ?? "",
          PORTLESS_PORT: "",
        },
        timeout: 30_000,
      }
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "Error: E2E lifecycle startup failed during validation.\n"
    );
    expect(`${result.stdout}${result.stderr}`).not.toMatch(
      /ERR_MODULE_NOT_FOUND|owner-lock\.js|APP_ENV=test|DATABASE_URL/iu
    );
  });
});
