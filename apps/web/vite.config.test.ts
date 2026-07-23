import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
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
      "civet --config civet.typecheck.json --typecheck"
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
  it("keeps Civet before Tailwind, Vinext, and Cloudflare", () => {
    const plugins = Array.isArray(viteConfig.plugins) ? viteConfig.plugins : [];
    expect(
      plugins.map((plugin) => (plugin && "name" in plugin ? plugin.name : null))
    ).toEqual([
      "test-civet",
      "test-tailwind",
      "test-vinext",
      "test-cloudflare",
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

  it("prebundles client libraries without optimizing Vinext's Link shim", () => {
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for Vite environment index-signature keys.
    expect(viteConfig.environments?.["client"]?.optimizeDeps).toEqual({
      exclude: ["next/link"],
      include: [
        "@darkfactory/state > zustand/vanilla",
        "@darkfactory/ui > radix-ui",
        "@darkfactory/ui > sonner",
        "lucide-react",
        "next/router",
      ],
    });
  });

  it("prebundles node-postgres for Worker-compatible CommonJS interop", () => {
    // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for Vite environment index-signature keys.
    expect(viteConfig.environments?.["rsc"]?.optimizeDeps).toEqual({
      include: ["@darkfactory/db > pg"],
    });
  });

  it("keeps Worker dev-var files out of source control", async () => {
    const rootGitignore = await readFile(
      new URL("../../.gitignore", import.meta.url),
      "utf8"
    );
    expect(rootGitignore.split(LINE_BREAK_PATTERN)).toContain(".dev.vars*");
  });
});
