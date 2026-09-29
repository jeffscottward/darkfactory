import { spawnSync } from "node:child_process";
import { readFileSync, readSync } from "node:fs";
import { extname } from "node:path";
import { inspectBunRuntime } from "../ci/bun-runtime.ts";
import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";

const BIOME_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".json",
  ".jsonc",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

const MARKDOWN_EXTENSIONS = new Set([".markdown", ".md"]);

const STAGED_PATH_ARGUMENTS = [
  "diff",
  "--cached",
  "--name-only",
  "--diff-filter=ACMR",
  "-z",
];

interface HookSpawnResult {
  error?: Error;
  signal?: NodeJS.Signals | null;
  status: number | null;
}

function formatCommand(executable: string, arguments_: readonly string[]) {
  return [executable, ...arguments_]
    .map((argument) => JSON.stringify(argument))
    .join(" ");
}

function failureExitCode(
  executable: string,
  arguments_: readonly string[],
  result: HookSpawnResult
) {
  const exitCode =
    Number.isInteger(result.status) && (result.status as number) > 0
      ? (result.status as number)
      : 1;
  console.error(
    `[hook] failed (${exitCode}): ${formatCommand(executable, arguments_)}`
  );

  if (result.error) {
    console.error(result.error.message);
  }

  if (result.signal) {
    console.error(`[hook] terminated by ${result.signal}`);
  }

  return exitCode;
}

function readStagedPaths() {
  const result = spawnSync("git", STAGED_PATH_ARGUMENTS, {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
  });

  if (result.status !== 0) {
    return {
      exitCode: failureExitCode("git", STAGED_PATH_ARGUMENTS, result),
      paths: [],
    };
  }

  return {
    exitCode: 0,
    paths: result.stdout.split("\0").filter(Boolean),
  };
}

function selectBiomePaths(paths: readonly string[]) {
  return paths.filter((path) => {
    return BIOME_EXTENSIONS.has(extname(path).toLowerCase());
  });
}

function selectMarkdownPaths(paths: readonly string[]) {
  return paths.filter((path) => {
    return MARKDOWN_EXTENSIONS.has(extname(path).toLowerCase());
  });
}

type BunScriptRunner = (
  scripts: readonly string[],
  paths?: readonly string[]
) => number;

function runBunScripts(
  scripts: readonly string[],
  paths: readonly string[] = [],
  env?: NodeJS.ProcessEnv
) {
  const safePaths = paths.map((path) => `./${path}`);

  for (const script of scripts) {
    const arguments_ =
      safePaths.length === 0
        ? ["run", script]
        : ["run", script, "--", ...safePaths];
    const result = spawnSync("bun", arguments_, {
      ...(env === undefined ? {} : { env }),
      shell: false,
      stdio: "inherit",
    });

    if (result.error || result.signal || result.status !== 0) {
      return failureExitCode("bun", arguments_, result);
    }
  }

  return 0;
}

function warnBunRuntime(): void {
  const warn = (detail: string): void => {
    console.error(
      `[hook] WARNING: Bun runtime differs from the pinned toolchain (${detail}); continuing, but local results may differ from CI`
    );
  };
  try {
    const pathResolved = spawnSync("bun", ["--version"], {
      encoding: "utf8",
      shell: false,
      stdio: ["ignore", "pipe", "inherit"],
      timeout: 10_000,
    });
    if (
      pathResolved.error ||
      pathResolved.signal ||
      pathResolved.status !== 0
    ) {
      warn(
        `PATH bun --version failed: ${pathResolved.error?.message ?? pathResolved.signal ?? `exit ${pathResolved.status}`}`
      );
      return;
    }
    const inspection = inspectBunRuntime(
      readFileSync(".bun-version", "utf8"),
      (globalThis as typeof globalThis & { Bun?: { version?: string } }).Bun
        ?.version ?? "",
      { exitCode: pathResolved.status, stdout: pathResolved.stdout }
    );
    if (!inspection.ok) {
      warn(inspection.detail);
    }
  } catch (error) {
    warn(error instanceof Error ? error.message : String(error));
  }
}

export function runPreCommit() {
  const staged = readStagedPaths();

  if (staged.exitCode !== 0) {
    return staged.exitCode;
  }

  const biomePaths = selectBiomePaths(staged.paths);
  const markdownPaths = selectMarkdownPaths(staged.paths);

  if (biomePaths.length === 0 && markdownPaths.length === 0) {
    return 0;
  }

  if (biomePaths.length > 0) {
    const biomeExitCode = runBunScripts(
      ["format:staged", "lint:staged"],
      biomePaths
    );

    if (biomeExitCode !== 0) {
      return biomeExitCode;
    }
  }

  if (markdownPaths.length > 0) {
    return runBunScripts(["lint:markdown:staged"], markdownPaths);
  }

  return 0;
}

export const PRE_PUSH_SCRIPTS: readonly string[] = Object.freeze([
  "verify:prepush",
]);

const MAX_PUSH_INPUT_BYTES = 64 * 1024;
const MAX_PUSH_REFS = 256;
const OBJECT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ZERO_ID = /^0+$/;

interface PushDependencies {
  readInput?: () => string;
  runScripts?: BunScriptRunner;
}

// Verification lanes spawn Git for other repositories (for example the init
// test's temporary clone); Git's hook-exported GIT_DIR/GIT_INDEX_FILE would
// redirect those commands into this worktree. The hook's own Git checks keep
// the inherited environment because they target the pushing repository.
const runPrePushScripts: BunScriptRunner = (scripts) =>
  runBunScripts(scripts, [], withoutGitRepositoryEnvironment(process.env));

function readPushInput(): string {
  const buffer = Buffer.alloc(MAX_PUSH_INPUT_BYTES + 1);
  let length = 0;
  while (length < buffer.length) {
    const count = readSync(0, buffer, length, buffer.length - length, null);
    if (count === 0) {
      return buffer.toString("utf8", 0, length);
    }
    length += count;
  }
  throw new Error("pre-push STDIN exceeds 64 KiB");
}

function parsePushInput(input: string) {
  if (Buffer.byteLength(input, "utf8") > MAX_PUSH_INPUT_BYTES) {
    throw new Error("pre-push STDIN exceeds 64 KiB");
  }
  // Git sends no lines when no ref will be updated: "Everything up-to-date",
  // or refs it already rejected (stale lease, non-fast-forward).
  if (input === "") {
    return [];
  }
  const lines = input.endsWith("\n")
    ? input.slice(0, -1).split("\n")
    : input.split("\n");
  if (lines.length > MAX_PUSH_REFS) {
    throw new Error("pre-push exceeds 256 ref updates");
  }
  const destinations = new Set<string>();
  let objectIdLength = 0;
  return lines.map((line) => {
    const fields = line.trim().split(/[ \t]+/);
    if (fields.length !== 4 || /[\0-\x08\x0b-\x1f\x7f]/.test(line)) {
      throw new Error("expected four fields per pre-push STDIN line");
    }
    const [localRef, localId, remoteRef, remoteId] = fields as [
      string,
      string,
      string,
      string,
    ];
    if (
      !(OBJECT_ID.test(localId) && OBJECT_ID.test(remoteId)) ||
      localId.length !== remoteId.length
    ) {
      throw new Error(
        "pre-push object IDs must be full, matching SHA-1 or SHA-256 IDs"
      );
    }
    if (objectIdLength !== 0 && objectIdLength !== localId.length) {
      throw new Error("pre-push cannot mix object ID formats");
    }
    objectIdLength = localId.length;
    if (
      !/^refs\/(?:heads|tags)\/.+/.test(remoteRef) ||
      destinations.has(remoteRef)
    ) {
      throw new Error("pre-push requires distinct branch or tag destinations");
    }
    destinations.add(remoteRef);
    const deletion = ZERO_ID.test(localId);
    if (
      deletion
        ? localRef !== "(delete)" || ZERO_ID.test(remoteId)
        : localRef === "(delete)" || localRef.startsWith("-")
    ) {
      throw new Error("inconsistent pre-push source or deletion record");
    }
    return { localId, remoteRef, deletion };
  });
}

function runPushGit(arguments_: string[]) {
  const result = spawnSync("git", ["--no-replace-objects", ...arguments_], {
    encoding: "utf8",
    shell: false,
    stdio: ["ignore", "pipe", "inherit"],
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  });
  if (result.error || result.signal || result.status !== 0) {
    return { exitCode: failureExitCode("git", arguments_, result), stdout: "" };
  }
  return { exitCode: 0, stdout: result.stdout };
}

function readPushCommit(revision: string) {
  const result = runPushGit([
    "rev-parse",
    "--verify",
    "--end-of-options",
    `${revision}^{commit}`,
  ]);
  if (result.exitCode === 0 && !OBJECT_ID.test(result.stdout.trim())) {
    throw new Error("git did not resolve a full commit ID");
  }
  return { exitCode: result.exitCode, commit: result.stdout.trim() };
}

function checkPushCheckout(expectedHead: string) {
  const current = readPushCommit("HEAD");
  if (current.exitCode !== 0) {
    return current.exitCode;
  }
  if (current.commit !== expectedHead) {
    throw new Error(
      "HEAD changed during pre-push; retry from the pushed commit"
    );
  }
  // Untracked and ignored files cannot reach the pushed commit, so only tracked changes block.
  const status = runPushGit([
    "status",
    "--porcelain=v1",
    "-z",
    "--untracked-files=no",
    "--ignore-submodules=none",
  ]);
  if (status.exitCode !== 0) {
    return status.exitCode;
  }
  if (status.stdout.length > 0) {
    throw new Error(
      "pre-push requires committed tracked files: commit or stash staged and unstaged changes to tracked files"
    );
  }
  return 0;
}

export function runPrePush(
  argv: readonly string[] = process.argv.slice(2),
  dependencies: PushDependencies = {}
): number {
  try {
    if (
      argv.length !== 2 ||
      argv.some(
        (value) => value.trim().length === 0 || /[\0-\x1f\x7f]/.test(value)
      )
    ) {
      throw new Error(
        "pre-push requires exactly Git's remote name and destination URL arguments"
      );
    }
    const updates = parsePushInput((dependencies.readInput ?? readPushInput)());
    if (updates.length === 0) {
      console.error("[hook] no ref updates to verify; git reports the result");
      return 0;
    }
    for (const update of updates) {
      const checked = runPushGit(["check-ref-format", update.remoteRef]);
      if (checked.exitCode !== 0) {
        return checked.exitCode;
      }
    }
    const sources = updates.filter((update) => !update.deletion);
    if (sources.length === 0) {
      console.error(
        "[hook] deletion-only push: no source to verify; local CI not run"
      );
      return 0;
    }
    const head = readPushCommit("HEAD");
    if (head.exitCode !== 0) {
      return head.exitCode;
    }
    for (const source of sources) {
      const pushed = readPushCommit(source.localId);
      if (pushed.exitCode !== 0) {
        return pushed.exitCode;
      }
      if (pushed.commit !== head.commit) {
        throw new Error(
          "every pushed source must resolve to current HEAD; check out and verify each different commit separately"
        );
      }
    }
    const checkoutStatus = checkPushCheckout(head.commit);
    if (checkoutStatus !== 0) {
      return checkoutStatus;
    }
    warnBunRuntime();
    for (const script of PRE_PUSH_SCRIPTS) {
      const status = (dependencies.runScripts ?? runPrePushScripts)([script]);
      if (status !== 0) {
        console.error(`[hook] mandatory local lane failed: ${script}`);
        return Number.isInteger(status) && status > 0 ? status : 1;
      }
    }
    return checkPushCheckout(head.commit);
  } catch (error) {
    console.error(
      `[hook] pre-push blocked: ${error instanceof Error ? error.message : String(error)}`
    );
    return 1;
  }
}
