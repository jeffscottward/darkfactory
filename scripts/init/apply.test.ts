import { describe, expect, it } from "vitest";
import {
  type CommandResult,
  type InitDependencies,
  regularFilesOf,
  runInit,
} from "./apply.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ARGUMENTS = [
  "--name",
  "Acme Labs",
  "--slug",
  "acme-labs",
  "--scope",
  "@acme",
  "--domain",
  "acme.dev",
];
const TEMPLATE_CAPABILITIES =
  "project:\n  name: DarkFactory\n  slug: darkfactory\n";

type Harness = Readonly<{
  dependencies: InitDependencies;
  files: Map<string, Uint8Array>;
  commands: string[];
  output: string[];
  errors: string[];
}>;

const ok = (stdout = ""): CommandResult => ({
  exitCode: 0,
  stdout,
  stderr: "",
});

const harness = (
  initial: Readonly<Record<string, string>>,
  overrides: Readonly<{
    status?: CommandResult;
    listing?: CommandResult;
    add?: CommandResult;
    runExit?: (command: string, arguments_: readonly string[]) => number;
  }> = {}
): Harness => {
  const files = new Map<string, Uint8Array>(
    Object.entries(initial).map(([path, text]) => [path, encoder.encode(text)])
  );
  const commands: string[] = [];
  const output: string[] = [];
  const errors: string[] = [];
  const listing = () =>
    ok(
      [...files.keys()]
        .map((path) => `100644 ${"0".repeat(40)} 0\t${path}\0`)
        .join("")
    );
  const dependencies: InitDependencies = {
    capture: async (command, arguments_) => {
      commands.push([command, ...arguments_].join(" "));
      if (arguments_[0] === "status") return overrides.status ?? ok();
      if (arguments_[0] === "ls-files") return overrides.listing ?? listing();
      return overrides.add ?? ok();
    },
    run: async (command, arguments_) => {
      commands.push([command, ...arguments_].join(" "));
      return overrides.runExit?.(command, arguments_) ?? 0;
    },
    files: {
      read: async (path) => files.get(path) as Uint8Array,
      write: async (path, content) => {
        files.set(path, encoder.encode(content));
      },
      move: async (from, to) => {
        files.set(to, files.get(from) as Uint8Array);
        files.delete(from);
      },
      remove: async (path) => {
        files.delete(path);
      },
    },
    year: 2031,
    log: (line) => output.push(line),
    error: (line) => errors.push(line),
  };
  return { dependencies, files, commands, output, errors };
};

const TEMPLATE = {
  "capabilities.yaml": TEMPLATE_CAPABILITIES,
  "README.md": "# DarkFactory\n",
  "docs/specs/DARKFACTORY_SPEC.md": "spec\n",
  ".bestpractices.json": "{}\n",
};

describe("regularFilesOf", () => {
  it("keeps regular and executable blobs and skips symlinks and submodules", () => {
    const sha = "a".repeat(40);
    expect(
      regularFilesOf(
        [
          `100644 ${sha} 0\tREADME.md`,
          `100755 ${sha} 0\tbin/run`,
          `120000 ${sha} 0\tCLAUDE.md`,
          `160000 ${sha} 0\tvendor`,
          "",
        ].join("\0")
      )
    ).toEqual(["README.md", "bin/run"]);
  });
});

describe("runInit", () => {
  it("prints usage for --help", async () => {
    const run = harness(TEMPLATE);
    expect(await runInit(["--help"], run.dependencies)).toBe(0);
    expect(run.output[0]).toMatch(/^Usage: bun run init/u);
    expect(run.commands).toEqual([]);
  });

  it("rejects invalid arguments with usage and exit code 2", async () => {
    const run = harness(TEMPLATE);
    expect(await runInit(["--slug", "Bad"], run.dependencies)).toBe(2);
    expect(run.errors[0]).toBe(
      "--name, --slug, --scope and --domain are required"
    );
    expect(run.errors[1]).toMatch(/^Usage:/u);
  });

  it("refuses outside a git checkout", async () => {
    const run = harness(TEMPLATE, {
      status: { exitCode: 128, stdout: "", stderr: "not a git repository" },
    });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors).toEqual([
      "bun run init must run inside the project's git checkout.",
    ]);
  });

  it("refuses when tracked files are dirty", async () => {
    const run = harness(TEMPLATE, { status: ok(" M README.md\n") });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors[0]).toMatch(/^Tracked files have uncommitted changes/u);
    expect(decoder.decode(run.files.get("README.md"))).toBe("# DarkFactory\n");
  });

  it("reports a failing git ls-files", async () => {
    const run = harness(TEMPLATE, {
      listing: { exitCode: 1, stdout: "", stderr: " boom \n" },
    });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors).toEqual(["git ls-files failed: boom"]);
  });

  it("refuses an initialized project unless forced", async () => {
    const initialized = {
      ...TEMPLATE,
      "capabilities.yaml": "project:\n  slug: other\n",
    };
    const refused = harness(initialized);
    expect(await runInit(ARGUMENTS, refused.dependencies)).toBe(1);
    expect(refused.errors[0]).toBe(
      "This project is already initialized (capabilities.yaml project.slug is other); pass --force to re-run."
    );

    const missing = harness({ "README.md": "x\n" });
    expect(await runInit(ARGUMENTS, missing.dependencies)).toBe(1);
    expect(missing.errors[0]).toContain("project.slug is missing");

    const forced = harness(initialized);
    expect(
      await runInit(
        [...ARGUMENTS, "--force", "--skip-install"],
        forced.dependencies
      )
    ).toBe(0);
    expect(decoder.decode(forced.files.get("capabilities.yaml"))).toBe(
      "project:\n  slug: acme-labs\n"
    );
  });

  it("reports an impossible plan without writing", async () => {
    const run = harness({
      ...TEMPLATE,
      "darkfactory.txt": "",
      "acme-labs.txt": "",
    });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors).toEqual([
      "Rename target already exists: darkfactory.txt -> acme-labs.txt",
    ]);
    expect(decoder.decode(run.files.get("README.md"))).toBe("# DarkFactory\n");
  });

  it("prints the plan and writes nothing on --dry-run", async () => {
    const run = harness(TEMPLATE);
    expect(await runInit([...ARGUMENTS, "--dry-run"], run.dependencies)).toBe(
      0
    );
    expect(run.output).toEqual([
      "Edit 2 files (3 replacements), rename 1, delete 1.",
      "  edit    README.md (1)",
      "  edit    capabilities.yaml (2)",
      "  rename  docs/specs/DARKFACTORY_SPEC.md -> docs/specs/ACME_LABS_SPEC.md",
      "  delete  .bestpractices.json",
      "Dry run: nothing was written.",
    ]);
    expect([...run.files.keys()]).toEqual(Object.keys(TEMPLATE));
    expect(run.commands).toEqual([
      "git status --porcelain --untracked-files=no",
      "git ls-files -s -z",
    ]);
  });

  it("applies and stages the plan, then runs every post-step", async () => {
    const run = harness(TEMPLATE);
    expect(
      await runInit(
        [...ARGUMENTS, "--workers-subdomain", "acme"],
        run.dependencies
      )
    ).toBe(0);
    expect(
      Object.fromEntries(
        [...run.files].map(([path, bytes]) => [path, decoder.decode(bytes)])
      )
    ).toEqual({
      "capabilities.yaml": "project:\n  name: Acme Labs\n  slug: acme-labs\n",
      "README.md": "# Acme Labs\n",
      "docs/specs/ACME_LABS_SPEC.md": "spec\n",
    });
    expect(run.commands.slice(2)).toEqual([
      "git add --all -- README.md capabilities.yaml docs/specs/DARKFACTORY_SPEC.md docs/specs/ACME_LABS_SPEC.md .bestpractices.json",
      "pnpm install --no-frozen-lockfile",
      "bun run docs:generate",
      "bun run api:openapi:generate",
      "pnpm --filter @acme/auth run auth:schema:generate",
      "bun run format",
      "git add --update",
    ]);
    expect(run.output).toContain("$ pnpm install --no-frozen-lockfile");
    expect(run.output).toContain("  1. bun run setup");
    expect(run.output).toContain(
      "       gh repo create acme/acme-labs --private --source=. --remote=origin --push"
    );
    expect(run.output.join("\n")).not.toContain("workers-subdomain.invalid");
  });

  it("skips post-steps with --skip-install and flags the staging placeholder", async () => {
    const run = harness(TEMPLATE);
    expect(
      await runInit([...ARGUMENTS, "--skip-install"], run.dependencies)
    ).toBe(0);
    expect(run.commands.some((command) => command.startsWith("pnpm"))).toBe(
      false
    );
    expect(run.output).toContain(
      "Skipped post-steps (--skip-install): pnpm install, docs:generate, api:openapi:generate, auth:schema:generate, format."
    );
    expect(run.output.at(-1)).toContain("workers-subdomain.invalid");
  });

  it("stops at the first failing post-step", async () => {
    const run = harness(TEMPLATE, {
      runExit: (_command, arguments_) =>
        arguments_.includes("docs:generate") ? 3 : 0,
    });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors).toEqual([
      "bun run docs:generate failed with exit code 3. The rename is applied; fix the failure and re-run the remaining post-steps by hand.",
    ]);
    expect(run.commands.at(-1)).toBe("bun run docs:generate");
  });

  it("reports a failing git add", async () => {
    const run = harness(TEMPLATE, {
      add: { exitCode: 1, stdout: "", stderr: "index.lock exists\n" },
    });
    expect(await runInit(ARGUMENTS, run.dependencies)).toBe(1);
    expect(run.errors).toEqual(["git add failed: index.lock exists"]);
  });
});
