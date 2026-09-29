import { glob, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { parseMiseToolchain } from "../lib/toolchain.ts";

// mise.toml is the one toolchain pin. CI and containers still read these
// copies, so each must equal it.
const read = (path: string): Promise<string> =>
  readFile(new URL(`../../${path}`, import.meta.url), "utf8");

const pins = parseMiseToolchain(await read("mise.toml"));
const root = fileURLToPath(new URL("../../", import.meta.url));

// Images live inside their brick, so removing a brick removes its image;
// `init --without-operator` leaves a project with none.
const brickDockerfiles = async (): Promise<readonly string[]> => {
  const paths: string[] = [];
  for await (const path of glob("{apps,packages}/**/Dockerfile", {
    cwd: root,
    exclude: (entry) => entry.endsWith("node_modules"),
  })) {
    paths.push(path);
  }
  return paths;
};

// Resolves each FROM as OpenSSF Scorecard does: ARG defaults are substituted
// and references to earlier stages are skipped.
const unpinnedBases = (dockerfile: string): readonly string[] => {
  const defaults = new Map<string, string>();
  const stages = new Set<string>();
  const unpinned: string[] = [];
  for (const line of dockerfile.split("\n")) {
    const [instruction = "", ...operands] = line.trim().split(/\s+/u);
    if (instruction.toUpperCase() === "ARG") {
      const [name = "", value] = (operands[0] ?? "").split("=");
      if (value !== undefined) defaults.set(name, value);
    } else if (instruction.toUpperCase() === "FROM") {
      const [image = "", as, stage] = operands.filter(
        (operand) => !operand.startsWith("--")
      );
      const resolved = image.replace(
        /\$\{(\w+)\}/gu,
        (_match, name: string) => defaults.get(name) ?? ""
      );
      if (!(stages.has(resolved) || /@sha256:[a-f0-9]{64}$/u.test(resolved))) {
        unpinned.push(resolved || image);
      }
      if (as?.toUpperCase() === "AS" && stage !== undefined) stages.add(stage);
    }
  }
  return unpinned;
};

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
    for (const path of await brickDockerfiles()) {
      const dockerfile = await read(path);
      expect(dockerfile).toContain(`FROM node:${pins.node}-`);
      // pnpm comes from its registry tarball, verified by checksum.
      expect(dockerfile).toMatch(
        new RegExp(
          `^ADD --checksum=sha256:[a-f0-9]{64} https://registry\\.npmjs\\.org/pnpm/-/pnpm-${pins.pnpm.replaceAll(".", "\\.")}\\.tgz `,
          "mu"
        )
      );
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

describe("brick images", () => {
  it("pins every base image by digest", async () => {
    for (const path of await brickDockerfiles()) {
      const dockerfile = await read(path);
      expect(unpinnedBases(dockerfile), path).toEqual([]);
      // A default Bun base names its tag, so a Bun bump flags a re-pin.
      if (dockerfile.includes("oven/bun@")) {
        expect(dockerfile, path).toContain(`oven/bun:${pins.bun} `);
      }
    }
    return expect(
      unpinnedBases(
        "ARG BASE=oven/bun:1\nFROM node:24 AS deps\nFROM deps\nFROM ${BASE}\n"
      )
    ).toEqual(["node:24", "oven/bun:1"]);
  });

  return it("sends each image only the files its allowlist names", async () => {
    for (const path of await brickDockerfiles()) {
      // A Dockerfile-specific ignore file overrides the root .dockerignore.
      const ignorePath = `${path}.dockerignore`;
      const [first, ...inclusions] = (await read(ignorePath))
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && !line.startsWith("#"));
      expect(first, ignorePath).toBe("*");
      for (const pattern of inclusions) {
        expect(pattern, ignorePath).toMatch(/^!/u);
        // Re-including a directory would send its whole subtree, including
        // local secrets (.dev.vars, .env) and host node_modules.
        const matches: string[] = [];
        for await (const match of glob(pattern.slice(1), { cwd: root })) {
          matches.push(match);
        }
        expect(matches.length, `${ignorePath}: ${pattern}`).toBeGreaterThan(0);
        for (const match of matches) {
          expect((await stat(join(root, match))).isFile(), match).toBe(true);
        }
      }
    }
  });
});
