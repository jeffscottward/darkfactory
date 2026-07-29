import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import viteConfig from "./vite.config";

const LINE_BREAK_PATTERN = /\r?\n/u;

const pluginMocks = vi.hoisted(() => ({
  civet: vi.fn(() => ({ name: "test-civet" })),
  tailwind: vi.fn(() => ({ name: "test-tailwind" })),
  cloudflare: vi.fn(() => ({ name: "test-cloudflare" })),
  vinext: vi.fn(() => ({ name: "test-vinext" })),
}));

vi.mock("@danielx/civet/vite", () => ({ default: pluginMocks.civet }));
vi.mock("@tailwindcss/vite", () => ({ default: pluginMocks.tailwind }));
vi.mock("@cloudflare/vite-plugin", () => ({
  cloudflare: pluginMocks.cloudflare,
}));
vi.mock("vinext", () => ({ default: pluginMocks.vinext }));

describe("Civet build type-check isolation", () => {
  it("disables Civet diagnostics only for Vite transforms", () => {
    expect(pluginMocks.civet).toHaveBeenCalledWith({
      ts: "esbuild",
      typecheck: false,
    });
  });

  it("keeps the package typecheck on its strict dedicated config", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("./package.json", import.meta.url), "utf8")
    ) as { scripts: { typecheck: string } };
    const typecheckConfigPath = fileURLToPath(
      new URL("./civet.typecheck.json", import.meta.url)
    );
    const typecheckConfig = JSON.parse(
      await readFile(typecheckConfigPath, "utf8")
    ) as {
      tsConfig: Record<string, unknown>;
    };
    const parsedTypecheckConfig = ts.parseJsonConfigFileContent(
      typecheckConfig.tsConfig,
      ts.sys,
      dirname(typecheckConfigPath),
      undefined,
      typecheckConfigPath
    );

    expect(packageJson.scripts.typecheck).toBe(
      "bunx --bun --no-install civet --config civet.typecheck.json --typecheck"
    );
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for this index-signature key.
    expect(typecheckConfig.tsConfig["extends"]).toBe(
      "../../tsconfig.base.json"
    );
    expect(parsedTypecheckConfig.errors).toEqual([]);
    expect(parsedTypecheckConfig.options.strict).toBe(true);
    expect(parsedTypecheckConfig.options.forceConsistentCasingInFileNames).toBe(
      true
    );
    expect(parsedTypecheckConfig.options.noCheck).not.toBe(true);
  });
});

describe("Vite application plugin contract", () => {
  it("keeps the environment policy after Civet, Tailwind, Vinext, and Cloudflare", () => {
    const plugins = Array.isArray(viteConfig.plugins) ? viteConfig.plugins : [];
    expect(
      plugins.map((plugin) => (plugin && "name" in plugin ? plugin.name : null))
    ).toEqual([
      "test-civet",
      "test-tailwind",
      "test-vinext",
      "test-cloudflare",
      "darkfactory:environment-optimizer-policy",
    ]);
  });

  it("deduplicates React runtime entry points across Vinext environments", () => {
    expect(viteConfig.resolve?.dedupe).toEqual([
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ]);
  });

  it("preserves Vinext route discovery and Cloudflare Worker environments", () => {
    expect(pluginMocks.vinext).toHaveBeenCalledWith({
      nextConfig: {
        pageExtensions: ["civet", "tsx", "ts", "jsx", "js"],
      },
    });
    expect(pluginMocks.cloudflare).toHaveBeenCalledWith({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    });
  });

  it("runs the environment policy last and isolates known and unknown environments", () => {
    expect(viteConfig.environments).toBeUndefined();
    const plugins = Array.isArray(viteConfig.plugins) ? viteConfig.plugins : [];
    const policy = plugins.at(-1);
    expect(policy && "enforce" in policy ? policy.enforce : undefined).toBe(
      "post"
    );
    const hook =
      policy && "configEnvironment" in policy
        ? (policy.configEnvironment as {
            handler: (
              name: string,
              environment: {
                optimizeDeps?: {
                  exclude?: string[];
                  include?: string[];
                  noDiscovery?: boolean;
                };
              }
            ) => void;
            order: string;
          })
        : undefined;
    expect(hook?.order).toBe("post");
    const rscEnvironment = {
      optimizeDeps: {
        exclude: ["vinext", "vinext"],
        include: ["@darkfactory/api > zod", "@darkfactory/api > zod"],
        noDiscovery: false,
      },
    };
    hook?.handler("rsc", rscEnvironment);
    expect(rscEnvironment.optimizeDeps.noDiscovery).toBe(true);
    expect(rscEnvironment.optimizeDeps.include).toContain(
      "@darkfactory/auth > better-auth"
    );
    expect(rscEnvironment.optimizeDeps.include).toContain(
      "@darkfactory/api > zod"
    );
    expect(
      rscEnvironment.optimizeDeps.include.filter(
        (entry) => entry === "@darkfactory/api > zod"
      )
    ).toHaveLength(1);

    expect(
      rscEnvironment.optimizeDeps.include.some((entry) =>
        [
          "react",
          "react-dom",
          "react/jsx-runtime",
          "react/jsx-dev-runtime",
        ].includes(entry)
      )
    ).toBe(false);
    const clientEnvironment = {
      optimizeDeps: {
        exclude: ["next/link", "next/link"],
        include: ["react", "react"],
        noDiscovery: false,
      },
    };
    hook?.handler("client", clientEnvironment);
    expect(clientEnvironment.optimizeDeps.noDiscovery).toBe(false);
    expect(clientEnvironment.optimizeDeps.include).toContain(
      "@tanstack/react-form"
    );
    expect(clientEnvironment.optimizeDeps.exclude).toContain("lucide-react");
    expect(new Set(clientEnvironment.optimizeDeps.include).size).toBe(
      clientEnvironment.optimizeDeps.include.length
    );
    expect(new Set(clientEnvironment.optimizeDeps.exclude).size).toBe(
      clientEnvironment.optimizeDeps.exclude.length
    );

    const unknownEnvironment = {
      optimizeDeps: {
        exclude: ["custom-exclude"],
        include: ["custom-include"],
      },
    };
    hook?.handler("custom", unknownEnvironment);
    expect(unknownEnvironment).toEqual({
      optimizeDeps: {
        exclude: ["custom-exclude"],
        include: ["custom-include"],
      },
    });
  });

  it("binds production preview to the same validated Portless endpoint", () => {
    expect(viteConfig.preview).toEqual({
      host: "127.0.0.1",
      strictPort: true,
    });
  });

  it("pretransforms the protected portal client boundary during dev startup", () => {
    expect(viteConfig.server?.warmup?.clientFiles).toEqual([
      "./src/components/portal-shell.civet",
    ]);
  });

  it("publishes one-shot preview request boundaries for the owned E2E child", async () => {
    vi.stubEnv("APP_ENV", "test");
    vi.stubEnv("E2E_RUN_ID", "production_browser_child");
    pluginMocks.cloudflare.mockClear();
    vi.resetModules();

    try {
      const e2eConfig = (await import("./vite.config")).default;
      const plugins = Array.isArray(e2eConfig.plugins) ? e2eConfig.plugins : [];
      const names = plugins.map((plugin) =>
        plugin && "name" in plugin ? plugin.name : null
      );
      const diagnostics = plugins.find(
        (plugin) =>
          plugin &&
          "name" in plugin &&
          plugin.name === "darkfactory:e2e-preview-diagnostics"
      ) as Plugin | undefined;
      expect(names.indexOf("darkfactory:e2e-preview-diagnostics")).toBeLessThan(
        names.indexOf("test-cloudflare")
      );
      expect(diagnostics).toBeDefined();
      expect(typeof diagnostics?.configurePreviewServer).toBe("function");

      const use = vi.fn();
      const write = vi.spyOn(process.stderr, "write").mockReturnValue(true);
      const configurePreviewServer = diagnostics?.configurePreviewServer;
      if (typeof configurePreviewServer !== "function") {
        throw new Error("E2E preview diagnostics hook is unavailable");
      }
      await configurePreviewServer.call(
        {} as never,
        {
          middlewares: { use },
        } as never
      );
      const middleware = use.mock.calls[0]?.[0] as
        | ((request: object, response: EventEmitter, next: () => void) => void)
        | undefined;
      if (middleware === undefined) {
        throw new Error("E2E preview diagnostics middleware is unavailable");
      }
      const response = new EventEmitter();
      const next = vi.fn();

      middleware({}, response, next);
      middleware({}, response, next);
      response.emit("finish");
      response.emit("finish");

      expect(next).toHaveBeenCalledTimes(2);
      expect(write).toHaveBeenCalledWith(
        "DARKFACTORY_E2E_VITE_REQUEST_RECEIVED\n"
      );
      expect(write).toHaveBeenCalledWith(
        "DARKFACTORY_E2E_VITE_RESPONSE_FINISHED\n"
      );
      expect(write).toHaveBeenCalledTimes(2);
      write.mockRestore();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("keeps Worker dev-var files out of source control", async () => {
    const rootGitignore = await readFile(
      new URL("../../.gitignore", import.meta.url),
      "utf8"
    );
    expect(rootGitignore.split(LINE_BREAK_PATTERN)).toContain(".dev.vars*");
  });
});

describe("production Worker runtime configuration", () => {
  it("bounds CPU and persists complete invocation logs without traces", async () => {
    const source = await readFile(
      new URL("./wrangler.jsonc", import.meta.url),
      "utf8"
    );
    const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", source);

    expect(parsed.error).toBeUndefined();
    const config = parsed.config as {
      limits?: unknown;
      observability?: unknown;
    };
    expect({
      limits: config.limits,
      observability: config.observability,
    }).toEqual({
      limits: {
        cpu_ms: 500,
      },
      observability: {
        enabled: true,
        logs: {
          enabled: true,
          head_sampling_rate: 1,
          invocation_logs: true,
          persist: true,
        },
        traces: {
          enabled: false,
        },
      },
    });
  });

  it("keeps the production database URL secret-bound under the PlanetScale provider contract", async () => {
    const source = await readFile(
      new URL("./wrangler.jsonc", import.meta.url),
      "utf8"
    );
    const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", source);

    expect(parsed.error).toBeUndefined();
    type WranglerVars = Readonly<
      Record<string, unknown> & { DATABASE_PROVIDER?: unknown }
    >;
    const config = parsed.config as {
      vars?: WranglerVars;
      env?: {
        staging?: {
          vars?: WranglerVars;
        };
      };
    };
    expect(config.vars?.DATABASE_PROVIDER).toBe("planetscale");
    expect(config.vars).not.toHaveProperty("DATABASE_URL");
    expect(config.env?.staging?.vars?.DATABASE_PROVIDER).toBe("planetscale");
    expect(config.env?.staging?.vars).not.toHaveProperty("DATABASE_URL");
  });

  it("keeps staging off the production custom domain", async () => {
    const source = await readFile(
      new URL("./wrangler.jsonc", import.meta.url),
      "utf8"
    );
    const parsed = ts.parseConfigFileTextToJson("wrangler.jsonc", source);

    expect(parsed.error).toBeUndefined();
    const config = parsed.config as {
      env?: {
        staging?: {
          routes?: unknown;
        };
      };
    };
    expect(config.env?.staging?.routes).toEqual([]);
  });
});
