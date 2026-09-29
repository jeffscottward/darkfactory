import { describe, expect, it } from "vitest";
import {
  type CommandResult,
  type InitDependencies,
  regularFilesOf,
  runInit,
} from "./apply.ts";
import { TEMPLATE_ROOT_COMMIT } from "./plan.ts";

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
    git?: (arguments_: readonly string[]) => CommandResult | undefined;
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
      return overrides.git?.(arguments_) ?? overrides.add ?? ok();
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
      "git rev-list --max-parents=0 HEAD",
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
    expect(run.commands.slice(3)).toEqual([
      "git add --all -- README.md capabilities.yaml docs/specs/DARKFACTORY_SPEC.md docs/specs/ACME_LABS_SPEC.md .bestpractices.json",
      "pnpm install --no-frozen-lockfile",
      "bun run docs:generate",
      "bun run openapi:generate",
      "pnpm --filter @acme/auth run auth:schema:generate",
      "bun run format",
      "git add --update",
    ]);
    expect(run.output).toContain("$ pnpm install --no-frozen-lockfile");
    expect(run.output).toContain("  1. bun run setup");
    expect(run.output.slice(-2)).toEqual([
      "  3. git commit -m 'chore: initialize project'",
      "  4. git push   (no remote yet? gh repo create acme/acme-labs --private --source=. --remote=origin --push)",
    ]);
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
      "Skipped post-steps (--skip-install): pnpm install, docs:generate, openapi:generate, auth:schema:generate, format."
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

const fail = (stderr: string): CommandResult => ({
  exitCode: 1,
  stdout: "",
  stderr,
});

// A plain clone of the template: HEAD reaches its root commit.
const cloneGit =
  (overrides: Readonly<Record<string, CommandResult>> = {}) =>
  (arguments_: readonly string[]): CommandResult | undefined => {
    const key = arguments_.join(" ");
    if (overrides[key] !== undefined) return overrides[key];
    if (key === "rev-list --max-parents=0 HEAD") {
      return ok(`${TEMPLATE_ROOT_COMMIT}\n`);
    }
    if (key === "symbolic-ref --quiet HEAD") return ok("refs/heads/main\n");
    if (key === "write-tree") return ok("a1b2c3\n");
    if (key.startsWith("commit-tree a1b2c3")) {
      return ok("0123456789abcdef0123\n");
    }
    if (key === "remote") return ok("origin\nupstream\n");
    return undefined;
  };

const TEMPLATE_REFS = `for-each-ref --format=%(refname) --contains=${TEMPLATE_ROOT_COMMIT}`;

describe("runInit history", () => {
  it("never suggests pushing a checkout that carries the template history", async () => {
    const run = harness(TEMPLATE, { git: cloneGit() });
    expect(
      await runInit([...ARGUMENTS, "--skip-install"], run.dependencies)
    ).toBe(0);
    const steps = run.output.slice(-3).join("\n");
    expect(steps).toContain(
      "  4. Do not push this checkout: it still carries the template's Git history. To publish, create the repository with `gh repo create acme/acme-labs --template jeffscottward/darkfactory --private --clone` and run init there, or run init with --fresh-history in a fresh clone."
    );
    expect(run.output.join("\n")).not.toMatch(/--push|git push/u);
  });

  it("refuses --fresh-history without template history, before writing", async () => {
    const run = harness(TEMPLATE);
    expect(
      await runInit([...ARGUMENTS, "--fresh-history"], run.dependencies)
    ).toBe(1);
    expect(run.errors).toEqual([
      "--fresh-history: this checkout has no template history to replace.",
    ]);
    expect(decoder.decode(run.files.get("README.md"))).toBe("# DarkFactory\n");
  });

  it.each([
    [
      "a detached HEAD",
      { "symbolic-ref --quiet HEAD": fail("fatal: not a symbolic ref\n") },
      "--fresh-history: git symbolic-ref --quiet HEAD failed: fatal: not a symbolic ref",
    ],
    [
      "a missing Git identity",
      { "var GIT_AUTHOR_IDENT": fail("Author identity unknown\n") },
      "--fresh-history: git var GIT_AUTHOR_IDENT failed: Author identity unknown",
    ],
    [
      "local refs that would keep the template history",
      {
        [TEMPLATE_REFS]: ok(
          "refs/heads/main\nrefs/heads/spike\nrefs/stash\nrefs/tags/v0.1.0\n"
        ),
      },
      "--fresh-history: These refs also carry the template history; delete them first: refs/heads/spike, refs/stash",
    ],
  ])("refuses --fresh-history with %s", async (_case, overrides, message) => {
    const run = harness(TEMPLATE, { git: cloneGit(overrides) });
    expect(
      await runInit([...ARGUMENTS, "--fresh-history"], run.dependencies)
    ).toBe(1);
    expect(run.errors).toEqual([message]);
    expect(run.commands).not.toContain("git ls-files -s -z");
  });

  it("replaces the history with one root commit and drops template refs", async () => {
    let lists = 0;
    const git = cloneGit();
    const run = harness(TEMPLATE, {
      git: (arguments_) => {
        if (arguments_.join(" ") !== TEMPLATE_REFS) return git(arguments_);
        lists += 1;
        return ok(
          lists === 1
            ? "refs/heads/main\nrefs/remotes/origin/HEAD\nrefs/remotes/origin/main\nrefs/remotes/stale/x\nrefs/tags/v0.1.0\n"
            : ""
        );
      },
    });
    expect(
      await runInit(
        [...ARGUMENTS, "--fresh-history", "--workers-subdomain", "acme"],
        run.dependencies
      )
    ).toBe(0);
    expect(
      run.commands.filter((command) => /^git (?!add)/u.test(command)).slice(6)
    ).toEqual([
      "git write-tree",
      "git commit-tree a1b2c3 -m chore: initialize Acme Labs",
      "git update-ref refs/heads/main 0123456789abcdef0123",
      "git remote",
      "git remote remove origin",
      "git update-ref -d refs/remotes/stale/x",
      "git update-ref -d refs/tags/v0.1.0",
      `git ${TEMPLATE_REFS}`,
    ]);
    expect(run.output.slice(-7)).toEqual([
      "Replaced the template history with root commit 0123456789ab; removed 1 remote(s) and 4 ref(s) to it.",
      "",
      "Initialized Acme Labs as a single root commit, with no template history.",
      "Next steps:",
      "  1. bun run setup",
      "  2. bun run dev   (https://acme-labs.localhost)",
      "  3. gh repo create acme/acme-labs --private --source=. --remote=origin --push",
    ]);
  });

  it("keeps the rename but warns when the history cannot be replaced", async () => {
    const failing = harness(TEMPLATE, {
      git: cloneGit({ "write-tree": fail("index is broken\n") }),
    });
    expect(
      await runInit(
        [...ARGUMENTS, "--fresh-history", "--skip-install"],
        failing.dependencies
      )
    ).toBe(1);
    expect(failing.errors).toEqual([
      "git write-tree failed: index is broken",
      "The template history is still in place: do not push this checkout.",
    ]);
  });

  it("reports template refs that survive the cleanup", async () => {
    let lists = 0;
    const git = cloneGit();
    const run = harness(TEMPLATE, {
      git: (arguments_) => {
        if (arguments_.join(" ") !== TEMPLATE_REFS) return git(arguments_);
        lists += 1;
        return ok(lists === 1 ? "refs/heads/main\n" : "refs/remotes/x/y\n");
      },
    });
    expect(
      await runInit(
        [...ARGUMENTS, "--fresh-history", "--skip-install"],
        run.dependencies
      )
    ).toBe(1);
    expect(run.errors).toEqual([
      "Template history is still reachable from: refs/remotes/x/y",
      "The template history is still in place: do not push this checkout.",
    ]);
  });

  it("does not replace the history after a failed post-step", async () => {
    const run = harness(TEMPLATE, {
      git: cloneGit(),
      runExit: (command) => (command === "pnpm" ? 1 : 0),
    });
    expect(
      await runInit([...ARGUMENTS, "--fresh-history"], run.dependencies)
    ).toBe(1);
    expect(run.errors.at(-1)).toBe(
      "The template history is still in place: do not push this checkout."
    );
    expect(run.commands).not.toContain("git write-tree");
  });

  it("drops the agent-SDLC plane with --without-operator", async () => {
    const run = harness({
      ...TEMPLATE,
      "packages/jobs/package.json":
        '{ "name": "@darkfactory/jobs", "brick": "agent-sdlc" }\n',
    });
    expect(
      await runInit(
        [...ARGUMENTS, "--without-operator", "--dry-run"],
        run.dependencies
      )
    ).toBe(0);
    expect(run.output).toContain("  delete  packages/jobs/package.json");
  });
});
