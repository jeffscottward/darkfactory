import { describe, expect, it } from "vitest";

import { inspectBunRuntime } from "./bun-runtime.ts";

const PIN = "1.4.2";
const pathBun = (version = PIN, exitCode = 0) => ({
  exitCode,
  stdout: `${version}\n`,
});

describe("Bun runtime authority", () => {
  it.each([PIN, `${PIN}\n`, `${PIN}\r\n`])(
    "accepts one exact pinned version line %j",
    (source) => {
      return expect(inspectBunRuntime(source, PIN, pathBun())).toMatchObject({
        ok: true,
        expectedVersion: PIN,
      });
    }
  );

  it.each(["", ` ${PIN}\n`, `v${PIN}\n`, `${PIN}-beta.1\n`, `${PIN}\n\n`])(
    "rejects malformed pin source %j",
    (source) =>
      expect(inspectBunRuntime(source, PIN, pathBun())).toMatchObject({
        ok: false,
        detail: expect.stringContaining(".bun-version is missing or malformed"),
      })
  );

  it.each(["1.3.13", "not-semver"])(
    "rejects executing Bun version %s",
    (version) => {
      return expect(
        inspectBunRuntime(`${PIN}\n`, version, pathBun())
      ).toMatchObject({
        ok: false,
        detail: expect.stringContaining("Executing Bun"),
      });
    }
  );

  return it.each([
    ["different version", pathBun("1.3.15")],
    ["malformed output", pathBun("not-semver")],
    ["failed command", pathBun(PIN, 1)],
  ] as const)("rejects a PATH-resolved bun with %s", (_name, result) => {
    return expect(inspectBunRuntime(`${PIN}\n`, PIN, result)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("PATH-resolved bun"),
    });
  });
});
