import { readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import "./vite.config";

const pluginMocks = vi.hoisted(() => ({
  civet: vi.fn(() => ({ name: "test-civet" })),
  cloudflare: vi.fn(() => ({ name: "test-cloudflare" })),
  vinext: vi.fn(() => ({ name: "test-vinext" })),
}));

vi.mock("@danielx/civet/vite", () => ({ default: pluginMocks.civet }));
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
