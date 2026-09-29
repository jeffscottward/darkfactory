import { readFileSync } from "node:fs";
import { loadCapabilityManifest } from "@darkfactory/config/server/capabilities";
import { describe, expect, it } from "vitest";
import { runDoctorCli } from "./cli.ts";
import {
  type DoctorDependencies,
  type DoctorFileSystem,
  probesFor,
  runDoctor,
} from "./doctor.ts";

// The real manifest is the fixture, so the doctor is tested against the same
// file and parser (packages/config/src/server/capabilities-loader.ts) it uses.
const MANIFEST = readFileSync(
  new URL("../../capabilities.yaml", import.meta.url),
  "utf8"
);
const WITHOUT_GRAPH_OR_HTTPS = MANIFEST.replace(
  "    provider: graphify\n    enabled: true",
  "    provider: graphify\n    enabled: false"
).replace("  https:\n    enabled: true", "  https:\n    enabled: false");

const TEST_CWD = "/workspace/darkfactory";
const PINNED_BUN_VERSION = "1.3.14";
const PINNED_MANIFESTS: Readonly<Record<string, string>> = {
  "node_modules/typescript/package.json": "7.0.2",
  "node_modules/turbo/package.json": "2.11.5",
  "node_modules/vitest/package.json": "5.0.2",
  "node_modules/@playwright/test/package.json": "1.63.0",
  "apps/web/node_modules/vinext/package.json": "1.0.0-beta.3",
  "apps/web/node_modules/@vinext/cloudflare/package.json": "1.0.0-beta.3",
  "apps/web/node_modules/vite/package.json": "8.3.1",
};

const files = (
  overrides: Readonly<Record<string, string | false>> = {}
): DoctorFileSystem => ({
  exists: async (path) => overrides[path] !== false,
  readText: async (path) => {
    const value = overrides[path];
    if (value === false) throw new Error(`missing ${path}`);
    if (typeof value === "string") return value;
    if (path === ".bun-version") return `${PINNED_BUN_VERSION}\n`;
    if (path === "capabilities.yaml") return MANIFEST;
    if (path === "apps/web/wrangler.jsonc")
      return `{ "name": "darkfactory-web", "main": "vinext/server/fetch-handler" }`;
    if (path in PINNED_MANIFESTS)
      return JSON.stringify({ version: PINNED_MANIFESTS[path] });
    return "{}";
  },
});

const healthyDependencies = (
  overrides: Partial<DoctorDependencies> = {}
): DoctorDependencies => ({
  bunVersion: PINNED_BUN_VERSION,
  workingDirectory: TEST_CWD,
  environmentHas: (name) =>
    new Set([
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "GROQ_API_KEY",
      "GROQ_MODEL",
    ]).has(name),
  files: files(),
  probeHttps: async () => ({ ok: true, status: 200 }),
  process: {
    run: async (command, arguments_) => {
      if (command === "node" && arguments_.join(" ") === "--version") {
        return { exitCode: 0, stdout: "v24.21.0\n", stderr: "" };
      }
      if (command === "bun" && arguments_.join(" ") === "--version") {
        return { exitCode: 0, stdout: `${PINNED_BUN_VERSION}\n`, stderr: "" };
      }
      if (command === "pnpm" && arguments_.join(" ") === "--version") {
        return { exitCode: 0, stdout: "11.16.0\n", stderr: "" };
      }
      if (command === "uv") {
        return { exitCode: 0, stdout: "uv 0.11.32\n", stderr: "" };
      }
      if (command === "graphify") {
        return { exitCode: 0, stdout: "graphify 0.9.2\n", stderr: "" };
      }
      if (command === "bunx" && arguments_.includes("portless")) {
        return { exitCode: 0, stdout: "0.15.6\n", stderr: "" };
      }
      if (
        command === "docker" &&
        arguments_[0] === "compose" &&
        arguments_.includes("ps")
      ) {
        return {
          exitCode: 0,
          stdout: '[{"Service":"postgres","State":"running"}]',
          stderr: "",
        };
      }
      if (command === "portless" && arguments_[0] === "list") {
        return {
          exitCode: 0,
          stdout: "https://darkfactory.localhost -> localhost:4775\n",
          stderr: "",
        };
      }
      if (command === "portless" && arguments_[0] === "get") {
        return {
          exitCode: 0,
          stdout: "https://darkfactory.localhost\n",
          stderr: "",
        };
      }
      return { exitCode: 0, stdout: "1.0.0\n", stderr: "" };
    },
  },
  ...overrides,
});

describe("manifest probes", () => {
  it("derives Bun, Docker, Postgres, portless, and Graphify from the manifest", () => {
    expect([...probesFor(loadCapabilityManifest(MANIFEST))]).toEqual([
      "bun",
      "docker",
      "postgres",
      "portless",
      "graphify",
    ]);
    return expect([
      ...probesFor(loadCapabilityManifest(WITHOUT_GRAPH_OR_HTTPS)),
    ]).toEqual(["bun", "docker", "postgres"]);
  });

  return it("skips the probes, required capabilities, and disabled entries the manifest turns off or on", async () => {
    const report = await runDoctor(
      healthyDependencies({
        files: files({
          "capabilities.yaml": WITHOUT_GRAPH_OR_HTTPS.replace(
            "    provider: uptime-kuma\n    enabled: false",
            "    provider: uptime-kuma\n    enabled: true"
          ),
        }),
      })
    );
    const names = report.checks.map(({ name }) => name);

    expect(report.ok).toBe(true);
    expect(report.capabilities.disabled).not.toContain("uptime");
    expect(report.capabilities.disabled).toContain("storage");
    expect(names).toEqual(
      expect.arrayContaining(["Bun", "Docker", "Postgres"])
    );
    for (const skipped of [
      "portless",
      "portless route",
      "portless trust",
      "Graphify",
    ]) {
      expect(names).not.toContain(skipped);
    }
    return expect(report.capabilities.required).toEqual([
      "postgres",
      "cloudflare",
    ]);
  });
});

describe("doctor", () => {
  it("passes a healthy fixture and reports names and status without secret values", async () => {
    const secret = "never-print-this-secret";
    const report = await runDoctor(
      healthyDependencies({
        environmentHas: (name) =>
          name === "DATABASE_URL" ||
          name === "BETTER_AUTH_SECRET" ||
          name === secret,
      })
    );
    const rendered = JSON.stringify(report);

    expect(report.ok).toBe(true);
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "Node", status: "pass" }),
        expect.objectContaining({ name: "Bun", status: "pass" }),
        expect.objectContaining({ name: "pnpm", status: "pass" }),
        expect.objectContaining({ name: "Docker", status: "pass" }),
        expect.objectContaining({ name: "Postgres", status: "pass" }),
        expect.objectContaining({ name: "Cloudflare config", status: "pass" }),
        expect.objectContaining({ name: "portless route", status: "pass" }),
        expect.objectContaining({ name: "portless trust", status: "pass" }),
        expect.objectContaining({ name: "Graphify", status: "pass" }),
        expect.objectContaining({ name: "uv", status: "pass" }),
      ])
    );
    expect(rendered).not.toContain(secret);
    return expect(rendered).not.toContain("postgresql://");
  });

  it("aggregates checks and capability classifications in deterministic order", async () => {
    const report = await runDoctor(healthyDependencies());
    const disabled = [
      "context_graphs.data",
      "docs",
      "error_tracking",
      "jobs",
      "postgres_extensions.pg_cron",
      "postgres_extensions.pg_trgm",
      "postgres_extensions.pgvector",
      "postgres_extensions.postgis",
      "postgres_extensions.timescaledb",
      "storage",
      "uptime",
    ];

    expect(report.checks.map(({ name }) => name)).toEqual([
      "Capabilities manifest",
      "Node",
      "pnpm",
      "Pinned toolchain",
      "Vinext configuration",
      "Cloudflare tooling",
      "Cloudflare config",
      "DATABASE_URL",
      "BETTER_AUTH_SECRET",
      "AI provider",
      "Email provider",
      "Analytics provider",
      "Telemetry exporter",
      "Bun",
      "Docker",
      "Postgres",
      "portless",
      "portless route",
      "portless trust",
      "Graphify",
      "uv",
      "TypeScript",
      "Turbo",
      "Vitest",
      "Playwright",
      "mkcert fallback",
      "Capability tanstack_devtools",
      ...disabled.map((name) => `Capability ${name}`),
    ]);
    expect(
      report.checks.slice(-disabled.length - 1, -disabled.length + 1)
    ).toEqual([
      {
        name: "Capability tanstack_devtools",
        status: "optional",
        detail: "tanstack_devtools is development-scoped",
      },
      {
        name: "Capability context_graphs.data",
        status: "disabled",
        detail: "context_graphs.data is disabled",
      },
    ]);
    return expect(report.capabilities).toEqual({
      required: ["postgres", "cloudflare", "graphify", "portless"],
      optional: ["tanstack_devtools"],
      disabled,
    });
  });

  it.each([
    ["22.13.1", "fail"],
    ["24.20.99", "fail"],
    ["24.21.0-beta.1", "pass"],
    ["25.0.0", "pass"],
    ["not-semver", "fail"],
  ] as const)(
    "maps Node boundary version %s to %s",
    async (nodeVersion, status) => {
      const base = healthyDependencies();
      const report = await runDoctor(
        healthyDependencies({
          process: {
            run: (command, arguments_, options) => {
              return command === "node"
                ? Promise.resolve({
                    exitCode: 0,
                    stdout: `v${nodeVersion}\n`,
                    stderr: "",
                  })
                : base.process.run(command, arguments_, options);
            },
          },
        })
      );
      return expect(
        report.checks.find(({ name }) => name === "Node")
      ).toMatchObject({ status });
    }
  );

  it.each([
    ["1.3.13", "fail"],
    [PINNED_BUN_VERSION, "pass"],
    ["1.3.15", "fail"],
    ["not-semver", "fail"],
  ] as const)("maps Bun exact version %s to %s", async (bunVersion, status) => {
    const base = healthyDependencies();
    const report = await runDoctor(
      healthyDependencies({
        process: {
          run: (command, arguments_, options) => {
            return command === "bun"
              ? Promise.resolve({
                  exitCode: 0,
                  stdout: `${bunVersion}\n`,
                  stderr: "",
                })
              : base.process.run(command, arguments_, options);
          },
        },
      })
    );
    return expect(
      report.checks.find(({ name }) => name === "Bun")
    ).toMatchObject({ status });
  });
  it.each([
    ["missing", false],
    ["malformed", "not-semver\n"],
  ] as const)("fails when the Bun pin is %s", async (_name, pin) => {
    const report = await runDoctor(
      healthyDependencies({
        files: files({ ".bun-version": pin }),
      })
    );
    return expect(
      report.checks.find(({ name }) => name === "Bun")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringContaining(".bun-version"),
    });
  });

  it("fails when the executing Bun differs from the PATH-resolved pinned Bun", async () => {
    const report = await runDoctor(
      healthyDependencies({
        bunVersion: "1.3.13",
      })
    );
    return expect(
      report.checks.find(({ name }) => name === "Bun")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringContaining("Executing Bun"),
    });
  });

  it("distinguishes custom tool compatibility, invalid Node grammar, and default nonempty output", async () => {
    const base = healthyDependencies();
    const report = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            if (command === "node") {
              return { exitCode: 0, stdout: "not-a-semver\n", stderr: "" };
            }
            if (command === "pnpm" && arguments_.join(" ") === "--version") {
              return { exitCode: 0, stdout: "11.15.0\n", stderr: "" };
            }
            if (command === "pnpm" && arguments_.includes("vinext")) {
              return { exitCode: 0, stdout: "", stderr: "" };
            }
            if (command === "graphify") {
              return { exitCode: 0, stdout: "   \n", stderr: "" };
            }
            return base.process.run(command, arguments_, options);
          },
        },
      })
    );

    expect(report.checks.find(({ name }) => name === "Node")).toMatchObject({
      status: "fail",
    });
    expect(report.checks.find(({ name }) => name === "pnpm")).toMatchObject({
      status: "fail",
    });
    expect(
      report.checks.find(({ name }) => name === "Vinext configuration")
    ).toMatchObject({
      status: "pass",
    });
    return expect(
      report.checks.find(({ name }) => name === "Graphify")
    ).toMatchObject({
      status: "fail",
    });
  });

  it("fails pinned compatibility drift", async () => {
    const drift = await runDoctor(
      healthyDependencies({
        files: files({
          "node_modules/vitest/package.json": JSON.stringify({
            version: "4.0.0",
          }),
        }),
      })
    );
    return expect(drift.checks).toContainEqual(
      expect.objectContaining({
        name: "Pinned toolchain",
        status: "fail",
      })
    );
  });

  it("fails truthfully when required prerequisites are missing", async () => {
    const dependencies = healthyDependencies({
      process: {
        run: async () => ({ exitCode: 127, stdout: "", stderr: "missing" }),
      },
      probeHttps: async () => ({ ok: false, error: "untrusted" }),
    });

    const report = await runDoctor(dependencies);

    expect(report.ok).toBe(false);
    return expect(
      report.checks.filter(({ status }) => status === "fail").length
    ).toBeGreaterThan(4);
  });

  it("turns malformed config and tool failures into bounded failed checks", async () => {
    const malformed = await runDoctor(
      healthyDependencies({
        files: files({ "capabilities.yaml": "capabilities: [" }),
      })
    );
    expect(malformed.ok).toBe(false);
    expect(malformed.checks).toContainEqual(
      expect.objectContaining({ name: "Capabilities manifest", status: "fail" })
    );

    const failedTool = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command) => {
            return command === "graphify"
              ? {
                  exitCode: 1,
                  stdout: "",
                  stderr: "tool exploded with token=secret",
                }
              : { exitCode: 0, stdout: "11.16.0", stderr: "" };
          },
        },
      })
    );
    const graphify = failedTool.checks.find(({ name }) => name === "Graphify");
    expect(graphify).toMatchObject({ status: "fail" });
    return expect(JSON.stringify(failedTool)).not.toContain("token=secret");
  });

  it("bounds or catches command failures while preserving safe command options", async () => {
    const base = healthyDependencies();
    const calls: Readonly<{
      command: string;
      arguments_: readonly string[];
      options: unknown;
    }>[] = [];
    const oversized = "x".repeat(1_048_577);
    const report = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            calls.push({ command, arguments_: [...arguments_], options });
            if (command === "graphify")
              throw new Error("private command failure");
            if (command === "bunx" && arguments_.includes("portless")) {
              return { exitCode: 0, stdout: oversized, stderr: "" };
            }
            if (command === "bunx" && arguments_.includes("playwright")) {
              return { exitCode: 0, stdout: "version", stderr: oversized };
            }
            return base.process.run(command, arguments_, options);
          },
        },
      })
    );

    for (const name of ["portless", "Graphify", "Playwright"]) {
      expect(
        report.checks.find((candidate) => candidate.name === name)
      ).toMatchObject({
        status: "fail",
      });
    }
    expect(JSON.stringify(report)).not.toContain("private command failure");
    return expect(
      calls.find(({ command, arguments_ }) => {
        return command === "portless" && arguments_[0] === "list";
      })?.options
    ).toEqual({
      timeoutMs: 10_000,
      maxOutputBytes: 1_048_576,
    });
  });

  it("short-circuits Docker daemon inspection and rejects empty daemon versions", async () => {
    const base = healthyDependencies();
    const commands: string[] = [];
    const unavailableCli = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            if (command === "docker") commands.push(arguments_.join(" "));
            if (command === "docker" && arguments_[0] === "--version") {
              return { exitCode: 1, stdout: "", stderr: "missing" };
            }
            return base.process.run(command, arguments_, options);
          },
        },
      })
    );
    expect(
      unavailableCli.checks.find(({ name }) => name === "Docker")
    ).toMatchObject({
      status: "fail",
    });
    expect(commands).not.toContain("info --format {{.ServerVersion}}");

    const emptyDaemon = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            if (command === "docker" && arguments_[0] === "info") {
              return { exitCode: 0, stdout: " \n", stderr: "" };
            }
            return base.process.run(command, arguments_, options);
          },
        },
      })
    );
    return expect(
      emptyDaemon.checks.find(({ name }) => name === "Docker")
    ).toMatchObject({
      status: "fail",
    });
  });

  it("maps Compose configuration, status, singleton, and malformed process output", async () => {
    const base = healthyDependencies();
    let inspectedProcesses = false;
    const invalidConfig = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            if (command === "docker" && arguments_.includes("config")) {
              return { exitCode: 1, stdout: "", stderr: "invalid" };
            }
            if (command === "docker" && arguments_.includes("ps"))
              inspectedProcesses = true;
            return base.process.run(command, arguments_, options);
          },
        },
      })
    );
    expect(
      invalidConfig.checks.find(({ name }) => name === "Postgres")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/configuration/i),
    });
    expect(inspectedProcesses).toBe(false);

    const failedStatus = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            return command === "docker" && arguments_.includes("ps")
              ? { exitCode: 1, stdout: "", stderr: "unavailable" }
              : base.process.run(command, arguments_, options);
          },
        },
      })
    );
    expect(
      failedStatus.checks.find(({ name }) => name === "Postgres")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/inspection failed/i),
    });

    const singleton = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            return command === "docker" && arguments_.includes("ps")
              ? {
                  exitCode: 0,
                  stdout: '{"Name":"postgres","State":"healthy"}',
                  stderr: "",
                }
              : base.process.run(command, arguments_, options);
          },
        },
      })
    );
    expect(
      singleton.checks.find(({ name }) => name === "Postgres")
    ).toMatchObject({
      status: "pass",
    });

    for (const [stdout, detail] of [
      ["", /not running/i],
      ["42", /malformed/i],
      ["{", /malformed/i],
      ["x".repeat(1_048_577), /inspection failed/i],
    ] as const) {
      const report = await runDoctor(
        healthyDependencies({
          process: {
            run: async (command, arguments_, options) => {
              return command === "docker" && arguments_.includes("ps")
                ? { exitCode: 0, stdout, stderr: "" }
                : base.process.run(command, arguments_, options);
            },
          },
        })
      );
      expect(
        report.checks.find(({ name }) => name === "Postgres")
      ).toMatchObject({
        status: "fail",
        detail: expect.stringMatching(detail),
      });
    }
  });

  it("filters non-object Compose entries before selecting a healthy Postgres service", async () => {
    const base = healthyDependencies();
    const report = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            return command === "docker" && arguments_.includes("ps")
              ? {
                  exitCode: 0,
                  stdout: JSON.stringify([
                    null,
                    42,
                    "ignored",
                    {
                      Name: "postgres",
                      State: "healthy",
                    },
                  ]),
                  stderr: "",
                }
              : base.process.run(command, arguments_, options);
          },
        },
      })
    );

    return expect(
      report.checks.find(({ name }) => name === "Postgres")
    ).toMatchObject({
      status: "pass",
    });
  });

  it("maps missing configuration, partial environment groups, and rejected trust probes", async () => {
    const report = await runDoctor(
      healthyDependencies({
        environmentHas: (name) =>
          name === "DATABASE_URL" || name === "GROQ_API_KEY",
        files: files({ "apps/web/wrangler.jsonc": false }),
        probeHttps: async () => {
          throw new Error("certificate rejected");
        },
      })
    );

    expect(
      report.checks.find(({ name }) => name === "Cloudflare config")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/missing or malformed/i),
    });
    expect(
      report.checks.find(({ name }) => name === "DATABASE_URL")
    ).toMatchObject({
      status: "pass",
    });
    expect(
      report.checks.find(({ name }) => name === "BETTER_AUTH_SECRET")
    ).toMatchObject({
      status: "fail",
    });
    expect(
      report.checks.find(({ name }) => name === "AI provider")
    ).toMatchObject({
      status: "optional",
      detail: "GROQ_API_KEY, GROQ_MODEL not fully configured",
    });
    return expect(
      report.checks.find(({ name }) => name === "portless trust")
    ).toMatchObject({
      status: "fail",
    });
  });

  it("rejects malformed and oversized configuration artifacts and passes complete provider groups", async () => {
    const malformed = await runDoctor(
      healthyDependencies({
        files: files({
          "apps/web/wrangler.jsonc": JSON.stringify({
            name: "wrong-web",
            main: "wrong-handler",
          }),
          "node_modules/vitest/package.json": "x".repeat(262_145),
        }),
        environmentHas: (name) =>
          new Set([
            "DATABASE_URL",
            "BETTER_AUTH_SECRET",
            "GROQ_API_KEY",
            "GROQ_MODEL",
            "RESEND_API_KEY",
            "POSTHOG_KEY",
            "POSTHOG_HOST",
            "OTEL_EXPORTER_OTLP_ENDPOINT",
          ]).has(name),
      })
    );

    expect(
      malformed.checks.find(({ name }) => name === "Cloudflare config")
    ).toMatchObject({
      status: "fail",
      detail: expect.stringMatching(/malformed/i),
    });
    expect(
      malformed.checks.find(({ name }) => name === "Pinned toolchain")
    ).toMatchObject({
      status: "fail",
    });
    for (const name of [
      "AI provider",
      "Email provider",
      "Analytics provider",
      "Telemetry exporter",
    ]) {
      expect(
        malformed.checks.find((candidate) => candidate.name === name)
      ).toMatchObject({
        status: "pass",
      });
    }

    const oversizedCloudflare = await runDoctor(
      healthyDependencies({
        files: files({ "apps/web/wrangler.jsonc": "x".repeat(262_145) }),
      })
    );
    return expect(
      oversizedCloudflare.checks.find(({ name }) => {
        return name === "Cloudflare config";
      })
    ).toMatchObject({ status: "fail" });
  });

  it("parses commented wrangler.jsonc and rejects invalid JSONC", async () => {
    const cloudflareStatus = async (source: string) =>
      (
        await runDoctor(
          healthyDependencies({
            files: files({ "apps/web/wrangler.jsonc": source }),
          })
        )
      ).checks.find(({ name }) => name === "Cloudflare config")?.status;

    expect(
      await cloudflareStatus(`{
  // Optional: "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<id>" }],
  "name": "darkfactory-web",
  /* entry */ "main": "vinext/server/fetch-handler",
}`)
    ).toBe("pass");
    return expect(await cloudflareStatus("{ name: ")).toBe("fail");
  });

  it("uses empty capability classifications after a manifest failure", async () => {
    const report = await runDoctor(
      healthyDependencies({
        files: files({ "capabilities.yaml": "capabilities: [" }),
      })
    );

    expect(report.capabilities).toEqual({
      required: [],
      optional: [],
      disabled: [],
    });
    return expect(
      report.checks.some(({ name }) => name.startsWith("Capability "))
    ).toBe(false);
  });

  it("checks mkcert only when the fallback is explicitly selected", async () => {
    const calls: Array<readonly [string, readonly string[]]> = [];
    const base = healthyDependencies();
    const dependencies = healthyDependencies({
      process: {
        run: async (command, arguments_) => {
          calls.push([command, [...arguments_]]);
          return base.process.run(command, arguments_);
        },
      },
    });

    await runDoctor(dependencies);
    expect(calls.some(([command]) => command === "mkcert")).toBe(false);

    await runDoctor(dependencies, { certificateFallback: true });
    return expect(calls).toContainEqual(["mkcert", ["-version"]]);
  });

  it("reports a failed explicitly selected certificate fallback", async () => {
    const base = healthyDependencies();
    const report = await runDoctor(
      healthyDependencies({
        process: {
          run: async (command, arguments_, options) => {
            return command === "mkcert"
              ? { exitCode: 1, stdout: "", stderr: "not installed" }
              : base.process.run(command, arguments_, options);
          },
        },
      }),
      { certificateFallback: true }
    );

    return expect(
      report.checks.find(({ name }) => name === "mkcert fallback")
    ).toEqual({
      name: "mkcert fallback",
      status: "fail",
      detail: "mkcert fallback is unavailable or incompatible",
    });
  });

  it("returns CLI exit codes for healthy, missing, and malformed fixtures", async () => {
    const output: string[] = [];
    await expect(
      runDoctorCli([], {
        doctor: healthyDependencies(),
        writeOutput: (value) => output.push(value),
        writeError: () => undefined,
      })
    ).resolves.toBe(0);
    const base = healthyDependencies();
    await expect(
      runDoctorCli([], {
        doctor: healthyDependencies({
          process: {
            run: (command, arguments_, options) => {
              return command === "node"
                ? Promise.resolve({
                    exitCode: 0,
                    stdout: "v18.0.0\n",
                    stderr: "",
                  })
                : base.process.run(command, arguments_, options);
            },
          },
        }),
        writeOutput: (value) => output.push(value),
        writeError: () => undefined,
      })
    ).resolves.toBe(1);
    return await expect(
      runDoctorCli(["--unknown"], {
        doctor: healthyDependencies(),
        writeOutput: (value) => output.push(value),
        writeError: () => undefined,
      })
    ).resolves.toBe(2);
  });

  return it("renders JSON and certificate-fallback CLI modes and catches dispatch failures", async () => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    const dependencies = {
      doctor: healthyDependencies(),
      writeOutput: (value: string) => stdout.push(value),
      writeError: (value: string) => stderr.push(value),
    };

    await expect(runDoctorCli(["--json"], dependencies)).resolves.toBe(0);
    expect(JSON.parse(stdout[0]!)).toMatchObject({ ok: true });

    await expect(runDoctorCli(["--cert-fallback"], dependencies)).resolves.toBe(
      0
    );
    expect(stdout.join("")).toContain("mkcert fallback");

    await expect(runDoctorCli(["--json", "extra"], dependencies)).resolves.toBe(
      2
    );
    await expect(
      runDoctorCli([], {
        ...dependencies,
        doctor: healthyDependencies({
          environmentHas: () => {
            throw new Error("private environment failure");
          },
        }),
      })
    ).resolves.toBe(1);
    expect(stderr.join("")).toContain("Doctor failed unexpectedly");
    return expect(stderr.join("")).not.toContain("private environment failure");
  });
});
