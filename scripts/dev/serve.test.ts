import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { runDevServer, type ServeDependencies } from "./serve.ts";
import { DEVELOPMENT_TARGETS, isCanonicalRouteOutput } from "./targets.ts";

const fixture = (
  environment: Readonly<Record<string, string | undefined>>,
  exitCode: number | null = 0
) => {
  const errors: string[] = [];
  const handlers = new Map<NodeJS.Signals, () => void>();
  const kill = vi.fn();
  const spawn = vi.fn(() => ({ kill, exited: Promise.resolve(exitCode) }));
  const dependencies: ServeDependencies = {
    environment,
    spawn,
    onSignal: (signal, handler) => handlers.set(signal, handler),
    writeError: (value) => errors.push(value),
  };
  return { dependencies, errors, handlers, kill, spawn };
};

describe("foreground development server", () => {
  it("forwards the portless port and host to the target app's dev script", async () => {
    const run = fixture({ PORT: "4123", HOST: "127.0.0.1" }, 0);

    await expect(runDevServer(["web"], run.dependencies)).resolves.toBe(0);

    expect(run.spawn).toHaveBeenCalledWith("pnpm", [
      "--filter",
      "@darkfactory/web",
      "run",
      "dev",
      "--port",
      "4123",
      "--hostname",
      "127.0.0.1",
    ]);
    run.handlers.get("SIGTERM")?.();
    run.handlers.get("SIGINT")?.();
    expect(run.kill.mock.calls).toEqual([["SIGTERM"], ["SIGINT"]]);
    return expect(run.errors).toEqual([]);
  });

  it("serves the operator app, defaults the host, and maps signal exits to failure", async () => {
    const run = fixture({ PORT: "4999" }, null);

    await expect(runDevServer(["operator"], run.dependencies)).resolves.toBe(1);

    return expect(run.spawn).toHaveBeenCalledWith("pnpm", [
      "--filter",
      "@darkfactory/operator-app",
      "run",
      "dev",
      "--port",
      "4999",
      "--hostname",
      "127.0.0.1",
    ]);
  });

  return it("rejects unknown targets and a missing or malformed portless port", async () => {
    for (const [arguments_, environment, message] of [
      [[], { PORT: "4000" }, /Usage/],
      [["admin"], { PORT: "4000" }, /Usage/],
      [["web", "extra"], { PORT: "4000" }, /Usage/],
      [["web"], {}, /PORT is missing/],
      [["web"], { PORT: "4000; rm -rf /" }, /PORT is missing/],
    ] as const) {
      const run = fixture(environment);
      await expect(runDevServer(arguments_, run.dependencies)).resolves.toBe(2);
      expect(run.spawn).not.toHaveBeenCalled();
      expect(run.errors.join("")).toMatch(message);
    }
  });
});

describe("development targets", () => {
  it("accepts only the exact canonical HTTPS origin in portless output", () => {
    const web = DEVELOPMENT_TARGETS.web;
    expect(
      isCanonicalRouteOutput({
        exitCode: 0,
        stdout: "darkfactory  https://darkfactory.localhost -> 127.0.0.1:4123",
      })
    ).toBe(true);
    expect(
      isCanonicalRouteOutput(
        {
          exitCode: 0,
          stdout: "https://operator.darkfactory.localhost\n",
        },
        DEVELOPMENT_TARGETS.operator
      )
    ).toBe(true);
    for (const stdout of [
      "not-a-url",
      "http://darkfactory.localhost",
      "https://other.localhost",
      "https://darkfactory.localhost:1355",
      "https://darkfactory.localhost/path",
      "https://darkfactory.localhost/?query",
      "https://darkfactory.localhost/#hash",
      "https://user@darkfactory.localhost",
      "https://user:secret@darkfactory.localhost",
    ]) {
      expect(isCanonicalRouteOutput({ exitCode: 0, stdout }, web)).toBe(false);
    }
    return expect(
      isCanonicalRouteOutput({ exitCode: 1, stdout: web.canonicalUrl }, web)
    ).toBe(false);
  });

  return it("wires the root dev scripts through bindings, portless, and this adapter", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8")
    ) as { scripts: Record<string, string> };
    for (const [script, target] of [
      ["dev", "web"],
      ["operator:dev", "operator"],
    ] as const) {
      expect(manifest.scripts[script]).toBe(
        `bun scripts/dev-bindings.ts${target === "operator" ? " operator" : ""} && portless ${DEVELOPMENT_TARGETS[target].routeName} bun scripts/dev.ts ${target}`
      );
    }
  });
});
