import { DatabaseConfigurationError } from "@darkfactory/config/database";
import { describe, expect, it, vi } from "vitest";

const workerEnv = vi.hoisted(() => ({
  HYPERDRIVE: {
    connectionString: "postgresql://user:secret@abc.hyperdrive.local:5432/db",
  },
}));
vi.mock("cloudflare:workers", () => ({ env: workerEnv }));

import { resolveDatabaseRequestBinding } from "./database-binding.ts";

describe("resolveDatabaseRequestBinding", () => {
  it("reads the HYPERDRIVE binding from the Worker env by default", () =>
    expect(resolveDatabaseRequestBinding()).toEqual({
      connectionString: "postgresql://user:secret@abc.hyperdrive.local:5432/db",
      trustedPlatform: "cloudflare-hyperdrive",
    }));

  it("returns no binding when the Worker declares no HYPERDRIVE binding", () =>
    expect(resolveDatabaseRequestBinding({})).toBeUndefined());

  return it.each([
    null,
    "postgresql://not-a-binding",
    {},
    { connectionString: 5432 },
  ])("fails closed on a malformed HYPERDRIVE binding %j", (hyperdrive) => {
    const resolve = () =>
      resolveDatabaseRequestBinding({ HYPERDRIVE: hyperdrive });

    expect(resolve).toThrow(DatabaseConfigurationError);
    return expect(resolve).toThrow(
      "HYPERDRIVE binding must expose a connectionString"
    );
  });
});
