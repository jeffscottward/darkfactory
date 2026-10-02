import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type CommandResult,
  fillLocalEnvironment,
  LOCAL_DATABASE_URL,
  runSetup,
  type SetupDependencies,
} from "./setup.ts";

const repositoryFile = (path: string): string =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const MISE = repositoryFile("mise.toml");
const EXAMPLE = repositoryFile(".env.example");
const SECRET_PREFIX = "generated-secret-";

type Fixture = Readonly<{
  files: Map<string, { content: string; mode: number }>;
  commands: string[];
  lines: string[];
  dependencies: SetupDependencies;
}>;

const fixture = (
  options: Readonly<{
    files?: Readonly<Record<string, string>>;
    modes?: Readonly<Record<string, number>>;
    capture?: Readonly<Record<string, CommandResult>>;
    exitCodes?: Readonly<Record<string, number>>;
    bunVersion?: string;
  }> = {}
): Fixture => {
  const files = new Map<string, { content: string; mode: number }>();
  for (const [path, content] of Object.entries({
    "mise.toml": MISE,
    ".env.example": EXAMPLE,
    ...options.files,
  })) {
    files.set(path, { content, mode: options.modes?.[path] ?? 0o600 });
  }
  const commands: string[] = [];
  const lines: string[] = [];
  let secrets = 0;
  const captured: Record<string, CommandResult> = {
    "node --version": { exitCode: 0, stdout: "v24.21.0\n" },
    "pnpm --version": { exitCode: 0, stdout: "11.16.0\n" },
    "docker compose version": { exitCode: 127, stdout: "" },
    ...options.capture,
  };
  const dependencies: SetupDependencies = {
    environment: { PATH: "/bin" },
    bunVersion: options.bunVersion ?? "1.4.2",
    files: {
      readText: async (path) => files.get(path)?.content,
      createPrivate: async (path, content) => {
        if (files.has(path)) throw new Error("exists");
        files.set(path, { content, mode: 0o600 });
      },
      replacePrivate: async (path, content) => {
        files.set(path, { content, mode: 0o600 });
      },
      mode: async (path) => files.get(path)?.mode,
    },
    capture: async (command, arguments_) =>
      captured[[command, ...arguments_].join(" ")] ?? {
        exitCode: 1,
        stdout: "",
      },
    run: async (command, arguments_, environment) => {
      const line = [command, ...arguments_].join(" ");
      expect(environment).toBe(dependencies.environment);
      commands.push(line);
      return options.exitCodes?.[line] ?? 0;
    },
    randomSecret: () => `${SECRET_PREFIX}${++secrets}`,
    log: (line) => lines.push(line),
  };
  return { files, commands, lines, dependencies };
};

const MIGRATE = "bun run db:migrate";
const SEED = "bun run db:seed -- --confirm-environment=development";
const BINDINGS = "bun scripts/dev-bindings.ts";
const COMPOSE_UP =
  "docker compose -f infra/docker/postgres.compose.yml up --detach --wait";

describe("fillLocalEnvironment", () => {
  it("fills only empty or absent generated values and keeps everything else", () => {
    const secrets = ["first", "second", "third"];
    const result = fillLocalEnvironment(
      "# keep\nBETTER_AUTH_SECRET=\nBETTER_AUTH_SECRET=\nCONTACT_THROTTLE_SECRET=kept\nAPP_NAME=\n",
      () => secrets.shift() ?? "unused"
    );
    expect(result.content).toBe(
      `# keep\nBETTER_AUTH_SECRET=first\nBETTER_AUTH_SECRET=\nCONTACT_THROTTLE_SECRET=kept\nAPP_NAME=\nDATABASE_URL=${LOCAL_DATABASE_URL}\n`
    );
    return expect(result.filled).toEqual([
      "BETTER_AUTH_SECRET",
      "DATABASE_URL",
    ]);
  });

  return it("never sets DATABASE_URL for Hyperdrive and appends to files without a trailing newline", () => {
    const result = fillLocalEnvironment(
      "DATABASE_PROVIDER=hyperdrive\nDATABASE_URL=",
      () => "secret"
    );
    expect(result.content).toBe(
      "DATABASE_PROVIDER=hyperdrive\nDATABASE_URL=\nBETTER_AUTH_SECRET=secret\nCONTACT_THROTTLE_SECRET=secret\n"
    );
    return expect(result.filled).not.toContain("DATABASE_URL");
  });
});

describe("bun run setup", () => {
  it("bootstraps a fresh clone without Docker and never prints secrets", async () => {
    const run = fixture();

    await expect(runSetup([], run.dependencies)).resolves.toBe(0);

    expect(run.commands).toEqual([
      "pnpm install --frozen-lockfile",
      MIGRATE,
      SEED,
      BINDINGS,
    ]);
    const env = run.files.get(".env");
    expect(env?.mode).toBe(0o600);
    expect(env?.content).toContain(`BETTER_AUTH_SECRET=${SECRET_PREFIX}1\n`);
    expect(env?.content).toContain(
      `CONTACT_THROTTLE_SECRET=${SECRET_PREFIX}2\n`
    );
    expect(env?.content).toContain(`DATABASE_URL=${LOCAL_DATABASE_URL}\n`);
    const output = run.lines.join("\n");
    expect(output).not.toContain(SECRET_PREFIX);
    expect(output).toContain("Docker Compose is not available");
    expect(output).toContain("infra/docker/postgres.compose.yml");
    return expect(run.lines.at(-1)).toMatch(/bun run dev/);
  });

  it("is idempotent: keeps a complete private .env and starts Postgres with Docker", async () => {
    const existing =
      "APP_ENV=development\nDATABASE_URL=postgresql://mine/db\nBETTER_AUTH_SECRET=mine\nCONTACT_THROTTLE_SECRET=mine\n";
    const run = fixture({
      files: { ".env": existing },
      capture: { "docker compose version": { exitCode: 0, stdout: "v2" } },
    });

    await expect(runSetup(["--"], run.dependencies)).resolves.toBe(0);

    expect(run.files.get(".env")?.content).toBe(existing);
    expect(run.commands).toContain(COMPOSE_UP);
    expect(run.lines).toContain("✓ .env kept");
    return expect(run.lines).toContain(
      "✓ PostgreSQL is running (docker compose)"
    );
  });

  it("fills empty secrets in an existing .env and tightens its mode", async () => {
    const run = fixture({
      files: { ".env": "BETTER_AUTH_SECRET=\n" },
      modes: { ".env": 0o644 },
    });
    await expect(runSetup([], run.dependencies)).resolves.toBe(0);
    expect(run.files.get(".env")).toEqual({
      content: `BETTER_AUTH_SECRET=${SECRET_PREFIX}1\nCONTACT_THROTTLE_SECRET=${SECRET_PREFIX}2\nDATABASE_URL=${LOCAL_DATABASE_URL}\n`,
      mode: 0o600,
    });
    expect(run.lines).toContain(
      "✓ .env kept; filled empty BETTER_AUTH_SECRET, CONTACT_THROTTLE_SECRET, DATABASE_URL"
    );

    const loose = fixture({
      files: {
        ".env":
          "BETTER_AUTH_SECRET=a\nCONTACT_THROTTLE_SECRET=b\nDATABASE_URL=c\n",
      },
      modes: { ".env": 0o644 },
    });
    await expect(runSetup([], loose.dependencies)).resolves.toBe(0);
    return expect(loose.files.get(".env")?.mode).toBe(0o600);
  });

  it("continues past a failed compose start and reports database and binding failures", async () => {
    const failedMigration = fixture({
      capture: { "docker compose version": { exitCode: 0, stdout: "v2" } },
      exitCodes: { [COMPOSE_UP]: 1, [MIGRATE]: 1, [BINDINGS]: 1 },
    });
    await expect(runSetup([], failedMigration.dependencies)).resolves.toBe(1);
    expect(failedMigration.commands).not.toContain(SEED);
    expect(failedMigration.commands).toContain(BINDINGS);
    expect(failedMigration.lines).toEqual(
      expect.arrayContaining([
        "! docker compose could not start PostgreSQL",
        "✗ migrations failed; is PostgreSQL reachable at DATABASE_URL?",
        "✗ apps/web/.dev.vars was not written",
      ])
    );

    const failedSeed = fixture({ exitCodes: { [SEED]: 1 } });
    await expect(runSetup([], failedSeed.dependencies)).resolves.toBe(1);
    return expect(failedSeed.lines).toContain(
      "✗ seeding failed; APP_ENV in .env must be development"
    );
  });

  it("stops early on toolchain drift, a failed install, or a missing template", async () => {
    const drift = fixture({
      bunVersion: "1.2.0",
      capture: {
        "node --version": { exitCode: 0, stdout: "v22.13.1\n" },
        "pnpm --version": { exitCode: 127, stdout: "" },
      },
    });
    await expect(runSetup([], drift.dependencies)).resolves.toBe(1);
    expect(drift.commands).toEqual([]);
    expect(drift.lines).toEqual([
      "✗ node 22.13.1 does not match mise.toml 24.21.0",
      "✗ bun 1.2.0 does not match mise.toml 1.4.2",
      "✗ pnpm missing does not match mise.toml 11.16.0",
      "Run `mise install` (and activate mise in your shell), then re-run.",
    ]);

    const unparsable = fixture({
      bunVersion: "",
      capture: { "node --version": { exitCode: 1, stdout: "v24.21.0" } },
    });
    await expect(runSetup([], unparsable.dependencies)).resolves.toBe(1);
    expect(unparsable.lines[0]).toBe(
      "✗ node missing does not match mise.toml 24.21.0"
    );

    const noMise = fixture();
    noMise.files.delete("mise.toml");
    await expect(runSetup([], noMise.dependencies)).resolves.toBe(1);
    expect(noMise.lines[0]).toBe("✗ mise.toml is missing or malformed");

    const install = fixture({
      exitCodes: { "pnpm install --frozen-lockfile": 1 },
    });
    await expect(runSetup([], install.dependencies)).resolves.toBe(1);
    expect(install.commands).toEqual(["pnpm install --frozen-lockfile"]);

    const noTemplate = fixture();
    noTemplate.files.delete(".env.example");
    await expect(runSetup([], noTemplate.dependencies)).resolves.toBe(1);
    return expect(noTemplate.lines).toContain("✗ .env.example is missing");
  });

  it("checks without changing anything", async () => {
    const missing = fixture();
    await expect(runSetup(["--check"], missing.dependencies)).resolves.toBe(1);
    expect(missing.commands).toEqual([]);
    expect(missing.files.has(".env")).toBe(false);
    expect(missing.lines).toEqual([
      "✓ toolchain matches mise.toml",
      "✗ dependencies are not installed",
      "✗ .env is missing",
      "✗ apps/web/.dev.vars is missing",
      "Run bun run setup to fix these.",
    ]);

    const incomplete = fixture({
      files: {
        ".env":
          "BETTER_AUTH_SECRET=\nCONTACT_THROTTLE_SECRET=x\nDATABASE_URL=y\n",
      },
      modes: { ".env": 0o644 },
    });
    await expect(runSetup(["--check"], incomplete.dependencies)).resolves.toBe(
      1
    );
    expect(incomplete.files.get(".env")?.mode).toBe(0o644);
    expect(incomplete.lines).toEqual(
      expect.arrayContaining([
        "✗ .env has empty BETTER_AUTH_SECRET",
        "✗ .env is not mode 0600",
      ])
    );

    const complete = fixture({
      files: {
        ".env":
          "BETTER_AUTH_SECRET=a\nCONTACT_THROTTLE_SECRET=b\nDATABASE_URL=c\n",
        "node_modules/.modules.yaml": "",
        "apps/web/.dev.vars": "",
      },
    });
    await expect(runSetup(["--check"], complete.dependencies)).resolves.toBe(0);
    expect(complete.commands).toEqual([]);
    return expect(complete.lines.at(-1)).toBe("✓ setup is complete");
  });

  return it("rejects unknown arguments", async () => {
    for (const arguments_ of [["--force"], ["--check", "extra"]]) {
      const run = fixture();
      await expect(runSetup(arguments_, run.dependencies)).resolves.toBe(2);
      expect(run.lines).toEqual(["Usage: bun run setup [-- --check]"]);
    }
  });
});
