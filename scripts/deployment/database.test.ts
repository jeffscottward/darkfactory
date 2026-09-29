import * as databaseConfig from "@darkfactory/config/database";
import { describe, expect, it, vi } from "vitest";
import {
  checkProductionWebDatabaseEndpoint,
  runProductionWebDatabaseCheck,
} from "./database.ts";

const pooledDatabaseUrl =
  "postgresql://private-user:private-password@aws.pg.psdb.cloud:6432/darkfactory?sslmode=verify-full";

const productionEnvironment = (
  databaseUrl: string
): Record<string, string> => ({
  DATABASE_PROVIDER: "planetscale",
  DATABASE_URL: databaseUrl,
});

const hyperdriveBinding = (id = "0123456789abcdef0123456789abcdef") =>
  `"hyperdrive": [{ "binding": "HYPERDRIVE", "id": "${id}" }]`;
const wrangler =
  (topLevel: string, staging = `"vars": {}`) =>
  () =>
    `{
    // JSONC comments must not break the check.
    ${topLevel},
    "env": { "staging": { ${staging} } }
  }`;
const hyperdriveWrangler = wrangler(
  `"vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding()}`,
  `"vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding()}`
);

describe("production web database deployment check", () => {
  it("accepts the current PlanetScale provider-managed PgBouncer endpoint", () =>
    expect(
      checkProductionWebDatabaseEndpoint(
        productionEnvironment(pooledDatabaseUrl)
      )
    ).toEqual({
      ok: true,
      message:
        "Production web DATABASE_URL uses the provider-managed PlanetScale PgBouncer endpoint on port 6432 with sslmode=verify-full",
    }));

  it.each([
    {
      provider: "postgres",
      databaseUrl:
        "postgresql://private-user:private-password@pool.example:6432/darkfactory?sslmode=verify-full",
      readConfig: undefined,
    },
    {
      provider: "hyperdrive",
      databaseUrl: undefined,
      readConfig: hyperdriveWrangler,
    },
    {
      provider: "hyperdrive",
      databaseUrl: " ",
      readConfig: wrangler(
        `"vars": { "DATABASE_PROVIDER": "planetscale" }`,
        `"vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding()}`
      ),
    },
    {
      provider: "hyperdrive",
      databaseUrl: undefined,
      readConfig: () =>
        `{ "vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding()} }`,
    },
  ])("accepts the $provider production profile with its profile message", ({
    provider,
    databaseUrl,
    readConfig,
  }) => {
    const report = checkProductionWebDatabaseEndpoint(
      { DATABASE_PROVIDER: provider, DATABASE_URL: databaseUrl },
      readConfig
    );

    return expect(report).toEqual({
      ok: true,
      message:
        databaseConfig.DATABASE_PROVIDER_PROFILES[
          provider as databaseConfig.DatabaseProvider
        ].productionRequirement,
    });
  });

  it.each([
    [
      "direct PlanetScale",
      "postgresql://private-user:private-password@aws.pg.psdb.cloud:5432/darkfactory?sslmode=verify-full",
      /PgBouncer endpoint on port 6432/,
    ],
    [
      "missing TLS",
      "postgresql://private-user:private-password@aws.pg.psdb.cloud:6432/darkfactory",
      /sslmode=verify-full/,
    ],
    [
      "malformed",
      "postgresql://private-user:private-password@[invalid",
      /PostgreSQL URL/,
    ],
  ])("rejects $0 endpoints with credential-free diagnostics", (_label, databaseUrl, expectedMessage) => {
    const report = checkProductionWebDatabaseEndpoint(
      productionEnvironment(databaseUrl)
    );

    expect(report).toMatchObject({ ok: false, message: expectedMessage });
    expect(report.message).not.toContain(databaseUrl);
    return expect(report.message).not.toContain("private-password");
  });

  it.each([
    {
      label: "a local postgres host",
      source: {
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL:
          "postgresql://private-user:private-password@localhost:5432/darkfactory?sslmode=verify-full",
      },
      readConfig: undefined,
      message: /must use a non-local host/,
    },
    {
      label: "a direct URL beside Hyperdrive",
      source: {
        DATABASE_PROVIDER: "hyperdrive",
        DATABASE_URL: pooledDatabaseUrl,
      },
      readConfig: hyperdriveWrangler,
      message: /DATABASE_URL must be absent/,
    },
    {
      label: "Hyperdrive without a declared binding",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: undefined,
      message:
        /DATABASE_PROVIDER=hyperdrive requires apps\/web\/wrangler\.jsonc to set DATABASE_PROVIDER=hyperdrive and declare a HYPERDRIVE binding/,
    },
    {
      label: "a Hyperdrive environment that relies on inherited bindings",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: wrangler(
        `"vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding()}`,
        `"vars": { "DATABASE_PROVIDER": "hyperdrive" }`
      ),
      message:
        /apps\/web\/wrangler\.jsonc env\.staging must declare a HYPERDRIVE binding exactly when its DATABASE_PROVIDER var is hyperdrive/,
    },
    {
      label: "a HYPERDRIVE binding under another provider",
      source: productionEnvironment(pooledDatabaseUrl),
      readConfig: wrangler(
        `"vars": { "DATABASE_PROVIDER": "planetscale" }, ${hyperdriveBinding()}`
      ),
      message: /top-level must declare a HYPERDRIVE binding exactly when/,
    },
    {
      label: "a HYPERDRIVE binding without an id",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: wrangler(
        `"vars": { "DATABASE_PROVIDER": "hyperdrive" }, ${hyperdriveBinding(" ")}`
      ),
      message: /top-level must declare a HYPERDRIVE binding exactly when/,
    },
    {
      label: "a non-object wrangler environment",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: () => `{ "env": { "staging": [] } }`,
      message: /apps\/web\/wrangler\.jsonc env\.staging must be an object/,
    },
    {
      label: "an unparseable wrangler config",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: () => "{ not json",
      message: /apps\/web\/wrangler\.jsonc could not be parsed/,
    },
    {
      label: "a non-object wrangler config",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: () => "[]",
      message: /apps\/web\/wrangler\.jsonc could not be parsed/,
    },
    {
      label: "an unreadable wrangler config",
      source: { DATABASE_PROVIDER: "hyperdrive" },
      readConfig: () => {
        throw new Error("EACCES private path");
      },
      message: /^apps\/web\/wrangler\.jsonc could not be read$/,
    },
  ])("rejects $label", ({ source, readConfig, message }) => {
    const report = checkProductionWebDatabaseEndpoint(source, readConfig);

    expect(report).toMatchObject({ ok: false, message });
    return expect(report.message).not.toContain("private-password");
  });

  it("rejects missing provider and connection settings before validation", () => {
    expect(
      checkProductionWebDatabaseEndpoint({
        DATABASE_PROVIDER: "sqlite",
        DATABASE_URL: pooledDatabaseUrl,
      })
    ).toEqual({
      ok: false,
      message:
        "DATABASE_PROVIDER must be one of postgres, planetscale, hyperdrive for production web deployment",
    });
    return expect(
      checkProductionWebDatabaseEndpoint({
        DATABASE_PROVIDER: " postgres ",
        DATABASE_URL: " ",
      })
    ).toEqual({
      ok: false,
      message: "DATABASE_URL is required for production web deployment",
    });
  });

  it("normalizes unexpected endpoint validator failures", () => {
    vi.spyOn(
      databaseConfig,
      "validateRequestDatabaseEndpoint"
    ).mockImplementationOnce(() => {
      throw new TypeError("private validator detail");
    });

    return expect(
      checkProductionWebDatabaseEndpoint({
        DATABASE_PROVIDER: "postgres",
        DATABASE_URL: pooledDatabaseUrl,
      })
    ).toEqual({
      ok: false,
      message: "Unable to validate the production web database endpoint",
    });
  });

  return it("renders the requirement without exposing the configured URL", () => {
    const output = { write: vi.fn() };
    const error = { write: vi.fn() };

    expect(
      runProductionWebDatabaseCheck(
        productionEnvironment(pooledDatabaseUrl),
        output,
        error
      )
    ).toBe(0);
    expect(output.write).toHaveBeenCalledWith(
      expect.stringContaining("provider-managed PlanetScale PgBouncer endpoint")
    );
    expect(JSON.stringify(output.write.mock.calls)).not.toContain(
      pooledDatabaseUrl
    );

    const directDatabaseUrl =
      "postgresql://private-user:private-password@aws.pg.psdb.cloud:5432/darkfactory?sslmode=verify-full";
    expect(
      runProductionWebDatabaseCheck(
        productionEnvironment(directDatabaseUrl),
        output,
        error
      )
    ).toBe(1);
    expect(error.write).toHaveBeenCalledWith(
      expect.stringContaining("PgBouncer endpoint on port 6432")
    );
    expect(JSON.stringify(error.write.mock.calls)).not.toContain(
      directDatabaseUrl
    );
    return expect(JSON.stringify(error.write.mock.calls)).not.toContain(
      "private-password"
    );
  });
});
