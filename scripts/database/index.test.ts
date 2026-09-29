import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const databaseCli = vi.hoisted(() => {
  const database = Object.freeze({ marker: "database" });
  const identities = Object.freeze([
    Object.freeze({ id: "admin-id", email: "admin@example.test" }),
  ]);
  const parsedEnvironment = Object.freeze({
    APP_URL: "https://darkfactory.localhost",
    BETTER_AUTH_URL: "https://auth.darkfactory.localhost",
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters",
  });
  const profile = Object.freeze({
    connection: Object.freeze({
      connectionString: "postgresql://isolated.example.test/darkfactory",
    }),
  });
  const seedResult = Object.freeze({
    identitiesCreated: 1,
    usersConverged: 1,
    profilesConverged: 1,
    preferencesConverged: 1,
    addressesConverged: 1,
    featureItemsConverged: 1,
  });
  const resetResult = Object.freeze({ tablesCleared: 10 });

  const close = vi.fn(async () => undefined);
  return {
    close,
    composeDatabaseProfile: vi.fn(() => profile),
    createNodeDatabase: vi.fn(() => ({
      db: database,
      close,
    })),
    database,
    ensureDevelopmentSeedIdentity: vi.fn(async () => ({
      identitiesCreated: 1,
    })),
    identities,
    packageImports: [] as string[],
    parseServerEnv: vi.fn(() => parsedEnvironment),
    parsedEnvironment,
    profile,
    register: vi.fn(),
    resetDevelopment: vi.fn(async () => resetResult),
    resetResult,
    seedDevelopment: vi.fn(
      async (
        _database: unknown,
        options: Readonly<{
          environment: "development" | "test";
          prepareIdentity: (
            seedIdentities: typeof identities
          ) => Promise<unknown>;
        }>
      ) => {
        await options.prepareIdentity(identities);
        return seedResult;
      }
    ),
    seedResult,
  };
});

vi.mock("node:module", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:module")>();
  return { ...actual, register: databaseCli.register };
});
vi.mock("@darkfactory/auth/server", () => {
  databaseCli.packageImports.push("@darkfactory/auth/server");
  return {
    ensureDevelopmentSeedIdentity: databaseCli.ensureDevelopmentSeedIdentity,
  };
});
vi.mock("@darkfactory/config/server", () => {
  databaseCli.packageImports.push("@darkfactory/config/server");
  return { parseServerEnv: databaseCli.parseServerEnv };
});
vi.mock("@darkfactory/config/database", () => {
  databaseCli.packageImports.push("@darkfactory/config/database");
  return { composeDatabaseProfile: databaseCli.composeDatabaseProfile };
});
vi.mock("@darkfactory/db/server", () => {
  databaseCli.packageImports.push("@darkfactory/db/server");
  return {
    createNodeDatabase: databaseCli.createNodeDatabase,
    resetDevelopment: databaseCli.resetDevelopment,
    seedDevelopment: databaseCli.seedDevelopment,
  };
});

const originalArguments = [...process.argv];
const originalAppEnvironment = process.env["APP_ENV"];

const importDatabaseCli = async (): Promise<unknown> =>
  await import("./index.ts");

const outputSpy = () => {
  return vi.spyOn(process.stdout, "write").mockImplementation(() => true);
};

const expectNoLoaderPackageOrDatabaseAcquisition = (): void => {
  expect(databaseCli.register).not.toHaveBeenCalled();
  expect(databaseCli.packageImports).toEqual([]);
  expect(databaseCli.parseServerEnv).not.toHaveBeenCalled();
  expect(databaseCli.composeDatabaseProfile).not.toHaveBeenCalled();
  expect(databaseCli.createNodeDatabase).not.toHaveBeenCalled();
  expect(databaseCli.seedDevelopment).not.toHaveBeenCalled();
  expect(databaseCli.resetDevelopment).not.toHaveBeenCalled();
  expect(databaseCli.close).not.toHaveBeenCalled();
};

beforeEach(() => {
  databaseCli.close.mockReset().mockResolvedValue(undefined);
  databaseCli.composeDatabaseProfile
    .mockReset()
    .mockReturnValue(databaseCli.profile);
  databaseCli.createNodeDatabase.mockReset().mockImplementation(() => ({
    db: databaseCli.database,
    close: databaseCli.close,
  }));
  databaseCli.ensureDevelopmentSeedIdentity
    .mockReset()
    .mockResolvedValue({ identitiesCreated: 1 });
  databaseCli.parseServerEnv
    .mockReset()
    .mockReturnValue(databaseCli.parsedEnvironment);
  databaseCli.packageImports.length = 0;
  databaseCli.register.mockReset();
  databaseCli.resetDevelopment
    .mockReset()
    .mockResolvedValue(databaseCli.resetResult);
  databaseCli.seedDevelopment.mockReset().mockImplementation(
    async (
      _database: unknown,
      options: Readonly<{
        environment: "development" | "test";
        prepareIdentity: (
          identities: typeof databaseCli.identities
        ) => Promise<unknown>;
      }>
    ) => {
      await options.prepareIdentity(databaseCli.identities);
      return databaseCli.seedResult;
    }
  );
  process.argv = [
    "node",
    "scripts/database/index.ts",
    "seed",
    "--",
    "--confirm-environment=test",
  ];
  return (process.env["APP_ENV"] = "test");
});

afterEach(() => {
  process.argv = [...originalArguments];
  if (originalAppEnvironment === undefined) {
    delete process.env["APP_ENV"];
  } else process.env["APP_ENV"] = originalAppEnvironment;
  vi.restoreAllMocks();
  return vi.resetModules();
});

describe.sequential("database CLI", () => {
  it("runs a test seed to completion without registering a module loader", async () => {
    const stdout = outputSpy();

    await importDatabaseCli();

    // TypeScript workspace packages load natively; no custom loader is registered.
    expect(databaseCli.register).not.toHaveBeenCalled();

    expect(databaseCli.parseServerEnv).toHaveBeenCalledWith(process.env);
    expect(databaseCli.composeDatabaseProfile).toHaveBeenCalledWith(
      databaseCli.parsedEnvironment
    );
    expect(databaseCli.createNodeDatabase).toHaveBeenCalledWith({
      connectionString: databaseCli.profile.connection.connectionString,
    });
    expect(databaseCli.seedDevelopment).toHaveBeenCalledWith(
      databaseCli.database,
      expect.objectContaining({
        environment: "test",
        prepareIdentity: expect.any(Function),
      })
    );
    expect(databaseCli.ensureDevelopmentSeedIdentity).toHaveBeenCalledWith(
      {
        environment: "test",
        secret: databaseCli.parsedEnvironment.BETTER_AUTH_SECRET,
        baseURL: databaseCli.parsedEnvironment.BETTER_AUTH_URL,
        trustedOrigins: [databaseCli.parsedEnvironment.APP_URL],
      },
      databaseCli.identities
    );
    expect(databaseCli.resetDevelopment).not.toHaveBeenCalled();
    expect(databaseCli.close).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledWith(
      `${JSON.stringify(databaseCli.seedResult)}\n`
    );
    return expect(databaseCli.close.mock.invocationCallOrder[0]).toBeLessThan(
      stdout.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
    );
  });

  it("runs reset in development, closes the resource, and emits its result", async () => {
    process.argv = [
      "node",
      "scripts/database/index.ts",
      "reset",
      "--confirm-environment=development",
    ];
    process.env["APP_ENV"] = "development";
    const stdout = outputSpy();

    await importDatabaseCli();

    expect(databaseCli.resetDevelopment).toHaveBeenCalledWith(
      databaseCli.database,
      {
        environment: "development",
      }
    );
    expect(databaseCli.seedDevelopment).not.toHaveBeenCalled();
    expect(databaseCli.ensureDevelopmentSeedIdentity).not.toHaveBeenCalled();
    expect(databaseCli.close).toHaveBeenCalledOnce();
    return expect(stdout).toHaveBeenCalledWith(
      `${JSON.stringify(databaseCli.resetResult)}\n`
    );
  });

  it.each([
    ["a missing command", undefined],
    ["an unsupported command", "migrate"],
  ])("rejects %s before registering a loader or importing packages", async (_label, command) => {
    process.argv =
      command === undefined
        ? ["node", "scripts/database/index.ts"]
        : ["node", "scripts/database/index.ts", command];
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "Database command must be either seed or reset"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it.each([
    ["a missing APP_ENV", undefined],
    ["an empty APP_ENV", ""],
    ["a production APP_ENV", "production"],
  ])("rejects %s before registering the package loader", async (_label, environment) => {
    if (environment === undefined) {
      delete process.env["APP_ENV"];
    } else process.env["APP_ENV"] = environment;
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "APP_ENV must be explicitly set to development or test for database seed/reset"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects a missing confirmation before loader, package, or database acquisition", async () => {
    process.argv = ["node", "scripts/database/index.ts", "seed"];
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "Database seed/reset requires --confirm-environment=<development|test>"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it.each([
    ["a flag without an equals sign", ["--confirm-environment"]],
    ["a space-separated value", ["--confirm-environment", "test"]],
    ["an empty value", ["--confirm-environment="]],
    ["an unsupported value", ["--confirm-environment=production"]],
    ["an additional argument", ["--confirm-environment=test", "--force"]],
  ])("rejects malformed confirmation with %s before acquisition", async (_label, confirmationArguments) => {
    process.argv = [
      "node",
      "scripts/database/index.ts",
      "seed",
      ...confirmationArguments,
    ];
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "Database confirmation must use --confirm-environment=<development|test>"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("rejects duplicate confirmation before acquisition", async () => {
    process.argv = [
      "node",
      "scripts/database/index.ts",
      "reset",
      "--confirm-environment=test",
      "--confirm-environment=test",
    ];
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "Database confirmation must be provided exactly once"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it.each([
    ["test", "development"],
    ["development", "test"],
  ] as const)("rejects %s APP_ENV with a %s confirmation before acquisition", async (environment, confirmation) => {
    process.env["APP_ENV"] = environment;
    process.argv = [
      "node",
      "scripts/database/index.ts",
      "seed",
      `--confirm-environment=${confirmation}`,
    ];
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(
      "Database confirmation must match APP_ENV exactly"
    );

    expectNoLoaderPackageOrDatabaseAcquisition();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("propagates configuration parsing failures before acquiring a database resource", async () => {
    const configurationError = new Error("invalid server environment");
    databaseCli.parseServerEnv.mockImplementationOnce(() => {
      throw configurationError;
    });
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(configurationError);

    expect(databaseCli.register).not.toHaveBeenCalled();
    expect(databaseCli.createNodeDatabase).not.toHaveBeenCalled();
    expect(databaseCli.close).not.toHaveBeenCalled();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("propagates database resource construction failures without fake cleanup", async () => {
    const constructionError = new Error("database construction failed");
    databaseCli.createNodeDatabase.mockImplementationOnce(() => {
      throw constructionError;
    });
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(constructionError);

    expect(databaseCli.close).not.toHaveBeenCalled();
    expect(databaseCli.seedDevelopment).not.toHaveBeenCalled();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("closes the resource when seeding fails and does not print a success result", async () => {
    const seedError = new Error("seed failed");
    databaseCli.seedDevelopment.mockRejectedValueOnce(seedError);
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(seedError);

    expect(databaseCli.close).toHaveBeenCalledOnce();
    expect(databaseCli.resetDevelopment).not.toHaveBeenCalled();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("closes the resource when reset fails and does not print a success result", async () => {
    process.argv = [
      "node",
      "scripts/database/index.ts",
      "reset",
      "--confirm-environment=test",
    ];
    const resetError = new Error("reset failed");
    databaseCli.resetDevelopment.mockRejectedValueOnce(resetError);
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(resetError);

    expect(databaseCli.close).toHaveBeenCalledOnce();
    expect(databaseCli.seedDevelopment).not.toHaveBeenCalled();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("closes the resource when seed identity preparation fails", async () => {
    const identityError = new Error("identity preparation failed");
    databaseCli.ensureDevelopmentSeedIdentity.mockRejectedValueOnce(
      identityError
    );
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(identityError);

    expect(databaseCli.seedDevelopment).toHaveBeenCalledOnce();
    expect(databaseCli.close).toHaveBeenCalledOnce();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("closes the resource when a seed result cannot be serialized", async () => {
    databaseCli.seedDevelopment.mockResolvedValueOnce({ count: 1n } as never);
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toThrow(/BigInt/);

    expect(databaseCli.close).toHaveBeenCalledOnce();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("surfaces cleanup failure instead of printing an unclosed success", async () => {
    const closeError = new Error("database close failed");
    databaseCli.close.mockRejectedValueOnce(closeError);
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(closeError);

    expect(databaseCli.seedDevelopment).toHaveBeenCalledOnce();
    return expect(stdout).not.toHaveBeenCalled();
  });

  it("preserves JavaScript finally semantics when operation and cleanup both fail", async () => {
    const seedError = new Error("seed failed");
    const closeError = new Error("database close failed");
    databaseCli.seedDevelopment.mockRejectedValueOnce(seedError);
    databaseCli.close.mockRejectedValueOnce(closeError);
    const stdout = outputSpy();

    await expect(importDatabaseCli()).rejects.toBe(closeError);

    expect(databaseCli.seedDevelopment).toHaveBeenCalledOnce();
    expect(databaseCli.close).toHaveBeenCalledOnce();
    return expect(stdout).not.toHaveBeenCalled();
  });

  return it("has already closed the database if stdout rejects the final write", async () => {
    const outputError = new Error("stdout failed");
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => {
      throw outputError;
    });

    await expect(importDatabaseCli()).rejects.toBe(outputError);

    expect(databaseCli.close).toHaveBeenCalledOnce();
    return expect(stdout).toHaveBeenCalledOnce();
  });
});
