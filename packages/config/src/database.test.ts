import { describe, expect, it } from "vitest";
import { toClientEnv } from "./client.ts";
import {
  composeDatabaseProfile,
  DATABASE_PROVIDER_PROFILES,
  DATABASE_PROVIDERS,
  type DatabaseProvider,
  type DatabaseRequestBinding,
  DatabaseConfigurationError,
  isDatabaseProvider,
  RequestDatabaseEndpointError,
  validateRequestDatabaseEndpoint,
} from "./database.ts";
import { parseServerEnv, type ServerEnv } from "./server.ts";

const DATABASE_URL = "postgresql://localhost/darkfactory_test";
const BETTER_AUTH_SECRET = "a".repeat(32);
const CONTACT_THROTTLE_SECRET = "c".repeat(32);
const HYPERDRIVE_BINDING: DatabaseRequestBinding = {
  connectionString: " postgresql://hyperdrive.internal/darkfactory_test ",
  trustedPlatform: "cloudflare-hyperdrive",
};

const serverEnvFor = (provider: DatabaseProvider = "planetscale") => {
  return parseServerEnv({
    DATABASE_PROVIDER: provider,
    DATABASE_URL,
    BETTER_AUTH_SECRET,
    CONTACT_THROTTLE_SECRET,
  });
};

const PRODUCTION_PLANETSCALE_POOLED_URL =
  "postgresql://private-user:private-password@aws.pg.psdb.cloud:6432/darkfactory?sslmode=verify-full";
const verifiedPostgresUrl = (host: string): string =>
  `postgresql://private-user:private-password@${host}/darkfactory?sslmode=verify-full`;

describe("validateRequestDatabaseEndpoint", () => {
  it("accepts only the current PlanetScale provider-managed PgBouncer endpoint in production", () => {
    expect(
      validateRequestDatabaseEndpoint({
        appEnvironment: "production",
        provider: "planetscale",
        connectionString: PRODUCTION_PLANETSCALE_POOLED_URL,
      })
    ).toBeUndefined();

    const directUrl =
      "postgresql://private-user:private-password@aws.pg.psdb.cloud:5432/darkfactory?sslmode=verify-full";
    const validateDirect = () =>
      validateRequestDatabaseEndpoint({
        appEnvironment: "production",
        provider: "planetscale",
        connectionString: directUrl,
      });
    expect(validateDirect).toThrow(RequestDatabaseEndpointError);
    expect(validateDirect).toThrow(/PgBouncer endpoint on port 6432/);
    try {
      return validateDirect();
    } catch (error) {
      expect(String(error)).not.toContain(directUrl);
      return expect(String(error)).not.toContain("private-password");
    }
  });

  it.each([
    ["planetscale", PRODUCTION_PLANETSCALE_POOLED_URL],
    ["postgres", verifiedPostgresUrl("db.example.com:5432")],
    ["postgres", verifiedPostgresUrl("pool.example:6432")],
    ["postgres", verifiedPostgresUrl("[2001:db8::1]")],
    ["postgres", verifiedPostgresUrl("127.example.com")],
    ["hyperdrive", undefined],
  ] as const)(
    "accepts a %s production profile: %s",
    (provider, connectionString) =>
      expect(
        validateRequestDatabaseEndpoint({
          appEnvironment: "production",
          provider,
          connectionString,
        })
      ).toBeUndefined()
  );

  it.each([
    [
      "missing verified TLS",
      "planetscale",
      "postgresql://private-user:private-password@aws.pg.psdb.cloud:6432/darkfactory",
      /sslmode=verify-full/,
    ],
    [
      "a malformed URL",
      "planetscale",
      "postgresql://private-user:private-password@[invalid",
      /PostgreSQL URL/,
    ],
    [
      "a PlanetScale provider and a non-PlanetScale host",
      "planetscale",
      "postgresql://private-user:private-password@pool.example:6432/darkfactory?sslmode=verify-full",
      /hostname ending in \.pg\.psdb\.cloud/,
    ],
    [
      "a PlanetScale provider and a bare PlanetScale suffix host",
      "planetscale",
      "postgresql://private-user:private-password@.pg.psdb.cloud:6432/darkfactory?sslmode=verify-full",
      /hostname ending in \.pg\.psdb\.cloud/,
    ],
    [
      "a PlanetScale port override",
      "planetscale",
      `${PRODUCTION_PLANETSCALE_POOLED_URL}&port=5432`,
      /cannot override its host or port/,
    ],
    [
      "a postgres URL without verified TLS",
      "postgres",
      "postgresql://private-user:private-password@db.example.com/darkfactory?sslmode=require",
      /sslmode=verify-full/,
    ],
    [
      "a postgres host override",
      "postgres",
      `${verifiedPostgresUrl("db.example.com")}&HOST=localhost`,
      /cannot override its host or port/,
    ],
    [
      "a postgres hostaddr override",
      "postgres",
      `${verifiedPostgresUrl("db.example.com")}&hostaddr=127.0.0.1`,
      /cannot override its host or port/,
    ],
    ["a missing postgres URL", "postgres", undefined, /PostgreSQL URL/],
    ["a missing PlanetScale URL", "planetscale", undefined, /PostgreSQL URL/],
    [
      "a direct URL beside the Hyperdrive binding",
      "hyperdrive",
      PRODUCTION_PLANETSCALE_POOLED_URL,
      /must be absent in production when DATABASE_PROVIDER=hyperdrive/,
    ],
  ] as const)(
    "rejects production endpoint with $0 without reflecting credentials",
    (_label, provider, connectionString, expectedMessage) => {
      const validate = () =>
        validateRequestDatabaseEndpoint({
          appEnvironment: "production",
          provider,
          connectionString,
        });

      expect(validate).toThrow(RequestDatabaseEndpointError);
      expect(validate).toThrow(expectedMessage);
      try {
        return validate();
      } catch (error) {
        if (connectionString)
          expect(String(error)).not.toContain(connectionString);
        return expect(String(error)).not.toContain("private-password");
      }
    }
  );

  it.each([
    "localhost",
    "localhost.",
    "LOCALHOST",
    "app.localhost",
    "%6c%6fcalhost",
    "127.0.0.1",
    "127.10.20.30",
    "127.1",
    "0x7f.1",
    "2130706433",
    "0.0.0.0",
    "0",
    "[::1]",
    "[::]",
    "[::ffff:127.0.0.1]",
    "169.254.169.254",
    "[::ffff:169.254.169.254]",
    "[fe80::1]",
    "[febf::1]",
    "db.example.com%40localhost",
    "%zz",
  ])("rejects the local or ambiguous production postgres host %s", (host) => {
    const connectionString = verifiedPostgresUrl(host);
    const validate = () =>
      validateRequestDatabaseEndpoint({
        appEnvironment: "production",
        provider: "postgres",
        connectionString,
      });

    expect(validate).toThrow(
      /Production postgres DATABASE_URL must use a non-local host/
    );
    try {
      return validate();
    } catch (error) {
      return expect(String(error)).not.toContain("private-password");
    }
  });

  it.each(
    DATABASE_PROVIDERS.flatMap((provider) =>
      (["development", "test"] as const).map(
        (appEnvironment) => [provider, appEnvironment] as const
      )
    )
  )("keeps local %s endpoints available in %s", (provider, appEnvironment) =>
    expect(
      validateRequestDatabaseEndpoint({
        appEnvironment,
        provider,
        connectionString: DATABASE_URL,
      })
    ).toBeUndefined()
  );

  return it("fails closed on an unknown provider in every environment", () => {
    for (const appEnvironment of ["development", "production"] as const) {
      expect(() =>
        validateRequestDatabaseEndpoint({
          appEnvironment,
          provider: "sqlite" as never,
          connectionString: DATABASE_URL,
        })
      ).toThrow(DatabaseConfigurationError);
    }
    expect(isDatabaseProvider("postgres")).toBe(true);
    return expect(isDatabaseProvider("constructor")).toBe(false);
  });
});

describe("DATABASE_PROVIDER_PROFILES", () => {
  return it("defines one frozen production contract per provider", () => {
    expect(Object.keys(DATABASE_PROVIDER_PROFILES)).toEqual([
      ...DATABASE_PROVIDERS,
    ]);
    expect(Object.isFrozen(DATABASE_PROVIDER_PROFILES)).toBe(true);
    return expect(
      Object.fromEntries(
        Object.entries(DATABASE_PROVIDER_PROFILES).map(
          ([provider, profile]) => [provider, profile.deployment]
        )
      )
    ).toEqual({
      postgres: "standard",
      planetscale: "managed",
      hyperdrive: "managed",
    });
  });
});

describe("composeDatabaseProfile", () => {
  it("changes composition metadata but preserves one PostgreSQL connection contract", () => {
    const planetscaleProfile = composeDatabaseProfile(
      serverEnvFor("planetscale")
    );
    const postgresProfile = composeDatabaseProfile(serverEnvFor("postgres"));

    expect(planetscaleProfile.composition).toEqual({
      provider: "planetscale",
      deployment: "managed",
    });
    expect(postgresProfile.composition).toEqual({
      provider: "postgres",
      deployment: "standard",
    });
    expect(planetscaleProfile.connection).toEqual(postgresProfile.connection);
    return expect(planetscaleProfile.connection).toEqual({
      protocol: "postgresql",
      connectionString: DATABASE_URL,
    });
  });

  it("uses DATABASE_URL when the optional request binding is absent", () => {
    const profile = composeDatabaseProfile(serverEnvFor());

    return expect(profile.connection.connectionString).toBe(DATABASE_URL);
  });

  it("uses the Hyperdrive binding connectionString under the hyperdrive provider", () => {
    const productionEnv = parseServerEnv({
      APP_ENV: "production",
      APP_URL: "https://app.darkfactory.example",
      BETTER_AUTH_URL: "https://app.darkfactory.example",
      DATABASE_PROVIDER: "hyperdrive",
      BETTER_AUTH_SECRET,
      CONTACT_THROTTLE_SECRET,
      EMAIL_TRANSPORT: "resend",
      RESEND_API_KEY: "r".repeat(32),
    });

    for (const env of [serverEnvFor("hyperdrive"), productionEnv]) {
      expect(composeDatabaseProfile(env, HYPERDRIVE_BINDING)).toEqual({
        composition: { provider: "hyperdrive", deployment: "managed" },
        connection: {
          protocol: "postgresql",
          connectionString: "postgresql://hyperdrive.internal/darkfactory_test",
        },
      });
    }
    return expect(productionEnv.DATABASE_URL).toBeUndefined();
  });

  it("requires the Hyperdrive binding under the hyperdrive provider", () =>
    expect(() => composeDatabaseProfile(serverEnvFor("hyperdrive"))).toThrow(
      "DATABASE_PROVIDER=hyperdrive requires the HYPERDRIVE request binding"
    ));

  it.each(["postgres", "planetscale"] as const)(
    "rejects a Hyperdrive binding under the %s provider",
    (provider) =>
      expect(() =>
        composeDatabaseProfile(serverEnvFor(provider), HYPERDRIVE_BINDING)
      ).toThrow(
        `a HYPERDRIVE request binding requires DATABASE_PROVIDER=hyperdrive, not ${provider}`
      )
  );

  it("rejects request bindings without an explicit trusted platform", () => {
    const compose = () =>
      composeDatabaseProfile(serverEnvFor("hyperdrive"), {
        connectionString: "postgresql://untrusted.internal/darkfactory_test",
      } as never);

    return expect(compose).toThrow(
      "request binding must declare the trusted Cloudflare Hyperdrive platform"
    );
  });

  it("keeps DATABASE_URL mandatory even when a request binding is available", () => {
    const composeWithoutDatabaseUrl = () => {
      return composeDatabaseProfile(
        parseServerEnv({
          DATABASE_PROVIDER: "planetscale",
          BETTER_AUTH_SECRET,
          CONTACT_THROTTLE_SECRET,
        }),
        HYPERDRIVE_BINDING
      );
    };

    expect(composeWithoutDatabaseUrl).toThrow("DATABASE_URL");
    const unparsedEnv: ServerEnv = {
      ...serverEnvFor("postgres"),
      DATABASE_URL: undefined,
    };
    return expect(() => composeDatabaseProfile(unparsedEnv)).toThrow(
      "DATABASE_URL is required when DATABASE_PROVIDER=postgres"
    );
  });

  it("rejects invalid DATABASE_URL and unsupported provider values", () => {
    const invalidDatabaseUrl = "https://database.internal/darkfactory";

    const parseInvalidDatabaseUrl = () => {
      return parseServerEnv({
        DATABASE_PROVIDER: "unsupported",
        DATABASE_URL: invalidDatabaseUrl,
        BETTER_AUTH_SECRET,
        CONTACT_THROTTLE_SECRET,
      });
    };
    const parseUnsupportedProvider = () => {
      return parseServerEnv({
        DATABASE_PROVIDER: "unsupported",
        DATABASE_URL,
        BETTER_AUTH_SECRET,
        CONTACT_THROTTLE_SECRET,
      });
    };

    expect(parseInvalidDatabaseUrl).toThrow(
      "DATABASE_URL must be a PostgreSQL URL"
    );
    expect(parseUnsupportedProvider).toThrow("DATABASE_PROVIDER");
    return expect(() =>
      composeDatabaseProfile({
        ...serverEnvFor("postgres"),
        DATABASE_PROVIDER: "unsupported" as never,
      })
    ).toThrow(DatabaseConfigurationError);
  });

  it("rejects invalid request connection strings without echoing secrets", () => {
    const invalidConnectionString =
      "https://database-user:database-password@database.internal/darkfactory";

    const composeWithInvalidBinding = () => {
      return composeDatabaseProfile(serverEnvFor("hyperdrive"), {
        connectionString: invalidConnectionString,
        trustedPlatform: "cloudflare-hyperdrive",
      });
    };

    expect(composeWithInvalidBinding).toThrow(DatabaseConfigurationError);
    expect(composeWithInvalidBinding).toThrow(
      "request binding connectionString must be a PostgreSQL URL"
    );

    try {
      return composeWithInvalidBinding();
    } catch (error) {
      return expect(String(error)).not.toContain(invalidConnectionString);
    }
  });

  it("rejects a syntactically malformed request binding without reflecting it", () => {
    const malformedConnectionString = "not a database URL";
    const compose = () =>
      composeDatabaseProfile(serverEnvFor("hyperdrive"), {
        connectionString: malformedConnectionString,
        trustedPlatform: "cloudflare-hyperdrive",
      });

    expect(compose).toThrow(DatabaseConfigurationError);
    expect(compose).toThrow(
      "request binding connectionString must be a PostgreSQL URL"
    );
    try {
      return compose();
    } catch (error) {
      return expect(String(error)).not.toContain(malformedConnectionString);
    }
  });
  return it("does not add database configuration or secrets to client config", () => {
    const env = serverEnvFor("planetscale");
    const clientEnv = toClientEnv(env);
    const serializedClientEnv = JSON.stringify(clientEnv);

    expect(clientEnv).not.toHaveProperty("DATABASE_PROVIDER");
    expect(clientEnv).not.toHaveProperty("DATABASE_URL");
    return expect(serializedClientEnv).not.toContain(DATABASE_URL);
  });
});
