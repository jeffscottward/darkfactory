import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript-api";
import { describe, expect, it, vi } from "vitest";
import viteConfig from "./vite.config";

const LINE_BREAK_PATTERN = /\r?\n/u;

const pluginMocks = vi.hoisted(() => ({
  tailwind: vi.fn(() => ({ name: "test-tailwind" })),
  cloudflare: vi.fn(() => ({ name: "test-cloudflare" })),
  vinext: vi.fn(() => ({ name: "test-vinext" })),
}));

vi.mock("@tailwindcss/vite", () => ({ default: pluginMocks.tailwind }));
vi.mock("@cloudflare/vite-plugin", () => ({
  cloudflare: pluginMocks.cloudflare,
}));
vi.mock("vinext", () => ({ default: pluginMocks.vinext }));

// Vitest 5 clears mock state before every test, so keep the calls made while
// vite.config was imported.
const importCalls = {
  cloudflare: [...pluginMocks.cloudflare.mock.calls],
  vinext: [...pluginMocks.vinext.mock.calls],
};

describe("TypeScript package typecheck", () => {
  it("keeps the package typecheck on its strict dedicated config", async () => {
    const packageJson = JSON.parse(
      await readFile(new URL("./package.json", import.meta.url), "utf8")
    ) as { scripts: { typecheck: string } };
    const typecheckConfigPath = fileURLToPath(
      new URL("./tsconfig.json", import.meta.url)
    );
    const parsedTypecheckConfig = ts.getParsedCommandLineOfConfigFile(
      typecheckConfigPath,
      undefined,
      {
        ...ts.sys,
        onUnRecoverableConfigFileDiagnostic: () => undefined,
      }
    );

    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit -p tsconfig.json");
    expect(parsedTypecheckConfig?.errors).toEqual([]);
    expect(parsedTypecheckConfig?.options.strict).toBe(true);
    expect(
      parsedTypecheckConfig?.options.forceConsistentCasingInFileNames
    ).toBe(true);
    expect(parsedTypecheckConfig?.options.noCheck).not.toBe(true);
  });
});

describe("Vite application plugin contract", () => {
  it("keeps the environment policy after Tailwind, Vinext, and Cloudflare", () => {
    const plugins = Array.isArray(viteConfig.plugins) ? viteConfig.plugins : [];
    expect(
      plugins.map((plugin) => (plugin && "name" in plugin ? plugin.name : null))
    ).toEqual([
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
    expect(importCalls.vinext).toContainEqual([
      {
        nextConfig: {
          pageExtensions: ["tsx", "ts", "jsx", "js"],
        },
      },
    ]);
    expect(importCalls.cloudflare).toContainEqual([
      {
        viteEnvironment: {
          name: "rsc",
          childEnvironments: ["ssr"],
        },
      },
    ]);
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
                build?: { sourcemap?: boolean };
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
    expect(rscEnvironment).toMatchObject({ build: { sourcemap: true } });
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
    expect(clientEnvironment).toMatchObject({ build: { sourcemap: false } });
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
      "./src/components/portal-shell.tsx",
    ]);
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
