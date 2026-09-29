import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, matchesGlob, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import vitestConfig from "../../vitest.config.ts";

type Manifest = Readonly<{ scripts?: Readonly<Record<string, string>> }>;
type VitestRun = Readonly<{ cwd: string; arguments_: readonly string[] }>;
type ListedFile = Readonly<{ file: string; projectName: string }>;

const root = fileURLToPath(new URL("../../", import.meta.url));
const execFileAsync = promisify(execFile);
const vitestBin = join(root, "node_modules/vitest/vitest.mjs");
const listDirectory = await mkdtemp(
  join(tmpdir(), "darkfactory-test-invariants-")
);
let listCount = 0;

afterAll(() => rm(listDirectory, { recursive: true, force: true }));

// Every coverage exclusion is reviewed here. Editing vitest.config.ts alone fails this test.
const COVERAGE_EXCLUDE_ALLOWLIST = [
  // Tests are the measuring instrument, not measured source.
  "**/*.{test,spec}.{civet,js,jsx,ts,tsx,mjs,cjs,mts,cts}",
  // Ambient declarations contain no executable code.
  "**/*.d.ts",
  // Generator output; freshness checks own these bytes.
  "**/generated/**",
  "apps/web/src/features/generated-navigation.ts",
] as const;

const SOURCE_ROOT = /^(?:apps\/[^/]+\/src\/|packages\/[^/]+\/src\/|scripts\/)/u;
const SOURCE_EXTENSION = /\.(?:civet|js|jsx|ts|tsx|mjs|cjs|mts|cts)$/u;
const TEST_FILE = /\.(?:test|spec)\.[^./]+$/u;
const LOCAL_PROJECTS = [
  "unit",
  "contract",
  "operations",
  "e2e-helpers",
] as const;

const git = async (...arguments_: string[]): Promise<string[]> => {
  return (
    await execFileAsync("git", arguments_, {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    })
  ).stdout
    .split("\0")
    .filter(Boolean);
};

const trackedFiles = git("ls-files", "-z").then((files) => new Set(files));

const readManifest = async (directory: string): Promise<Manifest> => {
  return JSON.parse(
    await readFile(join(directory, "package.json"), "utf8")
  ) as Manifest;
};

const matchesAny = (file: string, patterns: readonly string[]): boolean => {
  return patterns.some((pattern) => matchesGlob(file, pattern));
};

const workspaceDirectories = async (): Promise<string[]> => {
  return (
    await git(
      "ls-files",
      "-z",
      "--",
      "apps/*/package.json",
      "packages/*/package.json"
    )
  ).map((file) => join(root, file.replace(/\/package\.json$/u, "")));
};

// Expands `bun run` chains into the Vitest invocations a composite script really executes.
const expandVitestRuns = async (
  script: string,
  cwd = root
): Promise<VitestRun[]> => {
  const command = (await readManifest(cwd)).scripts?.[script];
  if (command === undefined) {
    throw new Error(
      `missing script ${script} in ${relative(root, cwd) || "root"}`
    );
  }
  const runs: VitestRun[] = [];
  for (const step of command.split(" && ")) {
    const tokens = step
      .trim()
      .split(/\s+/u)
      .map((token) => token.replace(/^"(.*)"$/u, "$1"));
    if (tokens.length === 3 && tokens[0] === "bun" && tokens[1] === "run") {
      runs.push(...(await expandVitestRuns(tokens[2]!, cwd)));
    } else if (tokens.slice(0, 4).join(" ") === "corepack pnpm exec vitest") {
      runs.push({ cwd, arguments_: tokens.slice(4) });
    } else if (tokens.slice(0, 4).join(" ") === "bunx --no-install turbo run") {
      const task = tokens[4]!;
      const passThrough = tokens.includes("--")
        ? tokens.slice(tokens.indexOf("--") + 1)
        : [];
      // Turbo forwards flags only; a forwarded path filter would silently narrow every package.
      expect(passThrough.every((token) => token.startsWith("--"))).toBe(true);
      for (const directory of await workspaceDirectories()) {
        if ((await readManifest(directory)).scripts?.[task] !== undefined) {
          runs.push(...(await expandVitestRuns(task, directory)));
        }
      }
    } else if (step.includes("vitest") || step.includes("turbo")) {
      throw new Error(`unrecognized test runner step: ${step}`);
    }
  }
  return runs;
};

const listFiles = async (run: VitestRun): Promise<string[]> => {
  const [subcommand, ...rest] = run.arguments_;
  expect(subcommand).toBe("run");
  listCount += 1;
  const output = join(listDirectory, `list-${listCount}.json`);
  const arguments_ = rest.filter((argument) => argument !== "--coverage");
  await execFileAsync(
    process.execPath,
    [vitestBin, "list", ...arguments_, "--filesOnly", `--json=${output}`],
    {
      cwd: run.cwd,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
    }
  );
  const listed = JSON.parse(await readFile(output, "utf8")) as ListedFile[];
  const tracked = await trackedFiles;
  // Untracked or ignored local files never count; only committed tests reach CI.
  return listed
    .map(({ file }) => relative(root, file))
    .filter((file) => tracked.has(file));
};

const allTestFiles = async (): Promise<ListedFile[]> => {
  const output = join(listDirectory, "all.json");
  await execFileAsync(
    process.execPath,
    [
      vitestBin,
      "list",
      "--config",
      "vitest.config.ts",
      "--filesOnly",
      `--json=${output}`,
    ],
    {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 60_000,
    }
  );
  const tracked = await trackedFiles;
  return (JSON.parse(await readFile(output, "utf8")) as ListedFile[])
    .map(({ file, projectName }) => ({
      file: relative(root, file),
      projectName,
    }))
    .filter(({ file }) => tracked.has(file));
};

const executionCounts = async (
  script: string
): Promise<Map<string, number>> => {
  const counts = new Map<string, number>();
  for (const files of await Promise.all(
    (await expandVitestRuns(script)).map(listFiles)
  )) {
    for (const file of files) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  return counts;
};

describe("coverage measures every authored source file", () => {
  it("pins coverage exclusions to the reviewed allowlist", () => {
    expect(vitestConfig.test?.coverage?.exclude).toEqual([
      ...COVERAGE_EXCLUDE_ALLOWLIST,
    ]);
    return expect(vitestConfig.test?.coverage?.thresholds).toEqual({
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    });
  });

  return it("includes every tracked non-test source file outside the allowlist", async () => {
    const include = vitestConfig.test?.coverage?.include ?? [];
    const exclude = vitestConfig.test?.coverage?.exclude ?? [];
    const tracked = [...(await trackedFiles)];
    const sources = tracked.filter(
      (file) => SOURCE_ROOT.test(file) && SOURCE_EXTENSION.test(file)
    );
    const unmeasured = sources.filter((file) => {
      return (
        !TEST_FILE.test(file) &&
        (!matchesAny(file, include) || matchesAny(file, exclude))
      );
    });
    const allowlisted = unmeasured.filter((file) =>
      matchesAny(file, COVERAGE_EXCLUDE_ALLOWLIST.slice(1))
    );
    expect(unmeasured).toEqual(allowlisted);
    for (const pattern of COVERAGE_EXCLUDE_ALLOWLIST) {
      expect(
        tracked.some((file) => matchesGlob(file, pattern)),
        `stale exclusion ${pattern}`
      ).toBe(true);
    }
  });
});

describe(
  "every Vitest test file runs in the gates",
  { timeout: 120_000 },
  () => {
    it("assigns each test file to exactly one Vitest project", async () => {
      const files = await allTestFiles();
      const owners = new Map<string, string[]>();
      for (const { file, projectName } of files) {
        owners.set(file, [...(owners.get(file) ?? []), projectName]);
      }
      expect([...owners].filter(([, projects]) => projects.length > 1)).toEqual(
        []
      );
      // A tracked test outside every project would silently never run; only Playwright specs may.
      const orphans = [...(await trackedFiles)].filter(
        (file) => TEST_FILE.test(file) && !owners.has(file)
      );
      return expect(
        orphans.filter((file) => !matchesGlob(file, "tests/e2e/*.spec.ts"))
      ).toEqual([]);
    });

    it("runs every test file exactly once in the full verify lifecycle", async () => {
      const [files, counts] = await Promise.all([
        allTestFiles(),
        executionCounts("verify"),
      ]);
      const expected = new Map(files.map(({ file }) => [file, 1]));
      return expect(Object.fromEntries(counts)).toEqual(
        Object.fromEntries(expected)
      );
    });

    return it.each([
      "verify:prepush",
      "verify:core",
    ])("runs every unit, contract, operations, and e2e-helpers file in %s", async (script) => {
      const [files, counts] = await Promise.all([
        allTestFiles(),
        executionCounts(script),
      ]);
      const local = files.filter(({ projectName }) =>
        LOCAL_PROJECTS.some((name) => name === projectName)
      );
      expect(local.length).toBeGreaterThan(0);
      return expect(
        local.filter(({ file }) => !counts.has(file)).map(({ file }) => file)
      ).toEqual([]);
    });
  }
);
