import { glob, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseMiseToolchain } from "../lib/toolchain.ts";

// mise.toml is the one toolchain pin. CI and containers still read these
// copies, so each must equal it.
const read = (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const pins = parseMiseToolchain(await read("mise.toml"));

type Step = Readonly<{ uses?: string; with?: Record<string, unknown> }>;

describe("toolchain pins", () => {
  it("keeps .nvmrc, .bun-version, and package.json equal to mise.toml", async () => {
    const manifest = JSON.parse(await read("package.json")) as Readonly<{
      packageManager: string;
      engines: Readonly<Record<string, string>>;
    }>;
    expect((await read(".nvmrc")).trim()).toBe(pins.node);
    expect((await read(".bun-version")).trim()).toBe(pins.bun);
    expect(manifest.packageManager).toBe(`pnpm@${pins.pnpm}`);
    return expect(manifest.engines).toEqual({
      bun: pins.bun,
      node: `>=${pins.node}`,
      pnpm: pins.pnpm,
    });
  });

  it("installs the pinned pnpm in CI and in every brick's Dockerfile", async () => {
    const workflow = parse(await read(".github/workflows/ci.yml")) as Readonly<{
      jobs: Record<string, Readonly<{ steps?: readonly Step[] }>>;
    }>;
    const pnpmSetups = Object.values(workflow.jobs)
      .flatMap((job) => job.steps ?? [])
      .filter((step) => step.uses?.startsWith("pnpm/action-setup@"));
    expect(pnpmSetups.length).toBeGreaterThan(0);
    for (const step of pnpmSetups) {
      expect(String(step.with?.["version"])).toBe(pins.pnpm);
    }
    // Images live inside their brick, so removing a brick removes its image.
    for await (const path of glob("{apps,packages}/**/Dockerfile", {
      cwd: fileURLToPath(new URL("../../", import.meta.url)),
      exclude: (entry) => entry.endsWith("node_modules"),
    })) {
      const dockerfile = await read(path);
      expect(dockerfile).toContain(`FROM node:${pins.node}-`);
      expect(dockerfile).toContain(`pnpm@${pins.pnpm}`);
    }
  });

  return it("parses only exact pins from the [tools] table", () => {
    expect(
      parseMiseToolchain(
        '# header\n[env]\nnode = "1.0.0"\n[tools]\nnode = "24.1.2" # lts\nbun = "1.2.3"\npnpm = "9.8.7"\nuv = "0.1.0"\n'
      )
    ).toEqual({ node: "24.1.2", bun: "1.2.3", pnpm: "9.8.7" });
    for (const malformed of [
      "",
      '[env]\nnode = "24.1.2"\nbun = "1.2.3"\npnpm = "9.8.7"\n',
      '[tools]\nnode = "24"\nbun = "1.2.3"\npnpm = "9.8.7"\n',
      '[tools]\nnode = "24.1.2"\npnpm = "9.8.7"\n',
      '[tools]\nnode = "24.1.2"\nbun = "1.2.3"\n',
    ]) {
      expect(() => parseMiseToolchain(malformed)).toThrow(
        "mise.toml must pin exact node, bun, and pnpm versions"
      );
    }
  });
});
