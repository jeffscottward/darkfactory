import { describe, expect, it } from "vitest";
import {
  CANONICAL_APP_URL,
  type ClientEnv,
  type ClientEnvironmentSource,
  toClientEnv,
} from "./client.ts";

describe("client environment contract", () => {
  it("returns only the public environment allowlist", () => {
    const source: ClientEnvironmentSource = {
      APP_ENV: "test",
      APP_URL: CANONICAL_APP_URL,
      APP_NAME: "DarkFactory",
    };
    const clientEnv: ClientEnv = toClientEnv(source);

    expect(clientEnv).toEqual(source);
    return expect(Object.keys(clientEnv)).toEqual([
      "APP_ENV",
      "APP_URL",
      "APP_NAME",
    ]);
  });

  return it("returns a new immutable-shaped value instead of the source object", () => {
    const source: ClientEnvironmentSource = {
      APP_ENV: "development",
      APP_URL: CANONICAL_APP_URL,
      APP_NAME: "DarkFactory",
    };

    return expect(toClientEnv(source)).not.toBe(source);
  });
});
