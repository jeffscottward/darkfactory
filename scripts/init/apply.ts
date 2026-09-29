import {
  describePlan,
  INIT_USAGE,
  type InitIdentity,
  type InitPlan,
  parseInitArguments,
  planInit,
  projectSlugOf,
  TEMPLATE_REPOSITORY,
  TEMPLATE_ROOT_COMMIT,
  TEMPLATE_SLUG,
  type TrackedFile,
  WORKERS_PLACEHOLDER,
} from "./plan.ts";

// `bun run init`: validates, plans, applies the plan and runs the post-steps.
export type CommandResult = Readonly<{
  exitCode: number;
  stdout: string;
  stderr: string;
}>;

export type InitDependencies = Readonly<{
  /** Captures a command's output in the repository root. */
  capture: (
    command: string,
    arguments_: readonly string[]
  ) => Promise<CommandResult>;
  /** Streams a command to the terminal in the repository root; resolves its exit code. */
  run: (command: string, arguments_: readonly string[]) => Promise<number>;
  files: Readonly<{
    read: (path: string) => Promise<Uint8Array>;
    write: (path: string, content: string) => Promise<void>;
    /** Moves a file, creating parents and pruning emptied directories. */
    move: (from: string, to: string) => Promise<void>;
    /** Deletes a file and prunes emptied directories. */
    remove: (path: string) => Promise<void>;
  }>;
  year: number;
  log: (line: string) => void;
  error: (line: string) => void;
}>;

// Regular (100644) and executable (100755) blobs; symlinks and submodules are skipped.
const REGULAR_FILE = /^100(?:644|755) [0-9a-f]+ \d\t([\s\S]+)$/u;

/** Parses `git ls-files -s -z` into regular-file paths. */
export const regularFilesOf = (listing: string): readonly string[] =>
  listing
    .split("\0")
    .map((entry) => REGULAR_FILE.exec(entry)?.[1])
    .filter((path) => path !== undefined);

const postSteps = (
  identity: InitIdentity
): readonly (readonly [string, readonly string[]])[] => [
  // Not frozen: the lockfile's workspace importers change with the scope.
  ["pnpm", ["install", "--no-frozen-lockfile"]],
  ["bun", ["run", "docs:generate"]],
  ["bun", ["run", "openapi:generate"]],
  [
    "pnpm",
    ["--filter", `${identity.scope}/auth`, "run", "auth:schema:generate"],
  ],
  // Renamed strings change line lengths; let the formatter re-wrap them.
  ["bun", ["run", "format"]],
  ["git", ["add", "--update"]],
];

// Undefined when the checkout is clean, otherwise the refusal message.
const cleanTree = async (
  dependencies: InitDependencies
): Promise<string | undefined> => {
  const status = await dependencies.capture("git", [
    "status",
    "--porcelain",
    "--untracked-files=no",
  ]);
  if (status.exitCode !== 0) {
    return "bun run init must run inside the project's git checkout.";
  }
  return status.stdout.trim() === ""
    ? undefined
    : "Tracked files have uncommitted changes; commit or stash them before bun run init.";
};

const readTrackedFiles = async (
  dependencies: InitDependencies
): Promise<readonly TrackedFile[] | string> => {
  const listing = await dependencies.capture("git", ["ls-files", "-s", "-z"]);
  if (listing.exitCode !== 0) {
    return `git ls-files failed: ${listing.stderr.trim()}`;
  }
  const files: TrackedFile[] = [];
  for (const path of regularFilesOf(listing.stdout)) {
    files.push({ path, bytes: await dependencies.files.read(path) });
  }
  return files;
};

const runPostSteps = async (
  identity: InitIdentity,
  dependencies: InitDependencies
): Promise<boolean> => {
  for (const [command, stepArguments] of postSteps(identity)) {
    dependencies.log(`$ ${[command, ...stepArguments].join(" ")}`);
    const exitCode = await dependencies.run(command, stepArguments);
    if (exitCode !== 0) {
      dependencies.error(
        `${command} ${stepArguments.join(" ")} failed with exit code ${exitCode}. The rename is applied; fix the failure and re-run the remaining post-steps by hand.`
      );
      return false;
    }
  }
  return true;
};

const applyPlan = async (
  plan: InitPlan,
  dependencies: InitDependencies
): Promise<void> => {
  for (const edit of plan.edits) {
    await dependencies.files.write(edit.path, edit.content);
  }
  for (const rename of plan.renames) {
    await dependencies.files.move(rename.from, rename.to);
  }
  for (const path of plan.deletions) await dependencies.files.remove(path);
};

/** Runs git and returns its trimmed stdout; throws with stderr on failure. */
const git = async (
  dependencies: InitDependencies,
  arguments_: readonly string[]
): Promise<string> => {
  const result = await dependencies.capture("git", arguments_);
  if (result.exitCode !== 0) {
    throw new Error(
      `git ${arguments_.join(" ")} failed: ${result.stderr.trim()}`
    );
  }
  return result.stdout.trim();
};

type FreshHistory = Readonly<{
  /** Gets the new root commit: HEAD's branch, or main for a detached HEAD. */
  branch: string;
  /** `for-each-ref` filters that together match every ref to the old history. */
  filters: readonly string[];
  /** Every ref but `branch` that reaches the old history; all are deleted. */
  refs: readonly string[];
}>;

type History = Readonly<{
  /**
   * HEAD may carry the template's commits: the template's root commit is
   * present, or the checkout is shallow and may have cut it off.
   */
  template: boolean;
  /** Set with --fresh-history: what replaceHistory drops. */
  fresh: FreshHistory | undefined;
}>;

/** Refs matched by any of the `for-each-ref` filters, without duplicates. */
const refsMatching = async (
  dependencies: InitDependencies,
  filters: readonly string[]
): Promise<readonly string[]> => {
  const refs = new Set<string>();
  for (const filter of filters) {
    const listing = await git(dependencies, [
      "for-each-ref",
      "--format=%(refname)",
      filter,
    ]);
    for (const ref of listing.split("\n")) if (ref !== "") refs.add(ref);
  }
  return [...refs];
};

/**
 * Checks, before anything is written, that --fresh-history can drop every
 * ref to the old history without losing local work.
 */
const prepareFreshHistory = async (
  dependencies: InitDependencies,
  rooted: boolean
): Promise<FreshHistory> => {
  const head = await git(dependencies, ["rev-parse", "--verify", "HEAD"]);
  const symbolic = await dependencies.capture("git", [
    "symbolic-ref",
    "--quiet",
    "HEAD",
  ]);
  const branch =
    symbolic.exitCode === 0 ? symbolic.stdout.trim() : "refs/heads/main";
  await git(dependencies, ["var", "GIT_AUTHOR_IDENT"]);
  // Refs above and below HEAD, and (when present) beside it via the root.
  const filters = [
    `--contains=${head}`,
    `--merged=${head}`,
    ...(rooted ? [`--contains=${TEMPLATE_ROOT_COMMIT}`] : []),
  ];
  const refs = (await refsMatching(dependencies, filters)).filter(
    (ref) => ref !== branch
  );
  const local = refs.filter((ref) => !/^refs\/(?:remotes|tags)\//u.test(ref));
  if (local.length > 0) {
    throw new Error(
      `These refs also carry the template history; delete them first: ${local.join(", ")}`
    );
  }
  return { branch, filters, refs };
};

/** Throws, before anything is written, when --fresh-history cannot run. */
const inspectHistory = async (
  dependencies: InitDependencies,
  freshHistory: boolean
): Promise<History> => {
  // An unborn or unreadable HEAD has no history to leak.
  const roots = await dependencies.capture("git", [
    "rev-list",
    "--max-parents=0",
    "HEAD",
  ]);
  const rooted = roots.stdout.split("\n").includes(TEMPLATE_ROOT_COMMIT);
  const shallow = await dependencies.capture("git", [
    "rev-parse",
    "--is-shallow-repository",
  ]);
  const template = rooted || shallow.stdout.trim() === "true";
  if (!freshHistory) return { template, fresh: undefined };
  if (!template) {
    throw new Error("this checkout has no template history to replace.");
  }
  return { template, fresh: await prepareFreshHistory(dependencies, rooted) };
};

/**
 * Commits the staged tree as a new root commit on the branch, removes every
 * remote (the template; `gh repo create` adds the new origin) and deletes the
 * other refs to the old history, then proves none is left.
 */
const replaceHistory = async (
  identity: InitIdentity,
  fresh: FreshHistory,
  dependencies: InitDependencies
): Promise<void> => {
  const tree = await git(dependencies, ["write-tree"]);
  const commit = await git(dependencies, [
    "commit-tree",
    tree,
    "-m",
    `chore: initialize ${identity.name}`,
  ]);
  await git(dependencies, ["update-ref", fresh.branch, commit]);
  await git(dependencies, ["symbolic-ref", "HEAD", fresh.branch]);
  const remotes = (await git(dependencies, ["remote"]))
    .split("\n")
    .filter((remote) => remote !== "");
  for (const remote of remotes) {
    await git(dependencies, ["remote", "remove", remote]);
  }
  // Refs of a removed remote are already gone; deleting a missing ref is a no-op.
  for (const ref of fresh.refs) {
    await git(dependencies, ["update-ref", "-d", ref]);
  }
  const left = await refsMatching(dependencies, fresh.filters);
  if (left.length > 0) {
    throw new Error(
      `The old history is still reachable from: ${left.join(", ")}`
    );
  }
  dependencies.log(
    `Replaced the template history with root commit ${commit.slice(0, 12)} on ${fresh.branch.replace("refs/heads/", "")}; removed ${remotes.length} remote(s) and ${fresh.refs.length} other ref(s).`
  );
};

const UNREPLACED =
  "The template history is still in place: do not push this checkout.";

/** Post-steps, then --fresh-history; false after reporting a failure. */
const finish = async (
  identity: InitIdentity,
  skipInstall: boolean,
  history: History,
  dependencies: InitDependencies
): Promise<boolean> => {
  if (skipInstall) {
    dependencies.log(
      "Skipped post-steps (--skip-install): pnpm install, docs:generate, openapi:generate, auth:schema:generate, format."
    );
  } else if (!(await runPostSteps(identity, dependencies))) {
    if (history.fresh !== undefined) dependencies.error(UNREPLACED);
    return false;
  }
  if (history.fresh === undefined) return true;
  try {
    await replaceHistory(identity, history.fresh, dependencies);
    return true;
  } catch (error) {
    dependencies.error((error as Error).message);
    dependencies.error(UNREPLACED);
    return false;
  }
};

/** Never suggests pushing a checkout that still carries the template's history. */
const nextSteps = (
  identity: InitIdentity,
  history: History
): readonly string[] => {
  const publish = `gh repo create ${identity.repo} --private --source=. --remote=origin --push`;
  const commit = "git commit -m 'chore: initialize project'";
  let publishing = [commit, `git push   (no remote yet? ${publish})`];
  if (history.fresh !== undefined) publishing = [publish];
  else if (history.template) {
    publishing = [
      commit,
      `Do not push this checkout: its Git history comes from the template (a shallow clone counts). To publish, create the repository with \`gh repo create ${identity.repo} --template ${TEMPLATE_REPOSITORY} --private --clone\` and run init there, or run init with --fresh-history in a fresh clone.`,
    ];
  }
  const steps = [
    "bun run setup",
    `bun run dev   (https://${identity.slug}.localhost)`,
    ...publishing,
    ...(identity.workersSubdomain === undefined
      ? [
          `Replace ${WORKERS_PLACEHOLDER} in apps/web/wrangler.jsonc with your workers.dev subdomain before deploying staging.`,
        ]
      : []),
  ];
  return [
    "",
    history.fresh === undefined
      ? `Initialized ${identity.name}. Changes are staged; review them with: git diff --cached --stat`
      : `Initialized ${identity.name} as a single root commit, with no template history.`,
    "Next steps:",
    ...steps.map((step, index) => `  ${index + 1}. ${step}`),
  ];
};

export const runInit = async (
  arguments_: readonly string[],
  dependencies: InitDependencies
): Promise<number> => {
  const parsed = parseInitArguments(arguments_, dependencies.year);
  if (parsed.kind === "help") {
    dependencies.log(INIT_USAGE);
    return 0;
  }
  if (parsed.kind === "error") {
    dependencies.error(parsed.message);
    dependencies.error(INIT_USAGE);
    return 2;
  }
  const {
    identity,
    dryRun,
    force,
    skipInstall,
    withoutOperator,
    freshHistory,
  } = parsed.options;

  const refusal = await cleanTree(dependencies);
  if (refusal !== undefined) {
    dependencies.error(refusal);
    return 1;
  }
  let history: History;
  try {
    history = await inspectHistory(dependencies, freshHistory);
  } catch (error) {
    dependencies.error(`--fresh-history: ${(error as Error).message}`);
    return 1;
  }
  const files = await readTrackedFiles(dependencies);
  if (typeof files === "string") {
    dependencies.error(files);
    return 1;
  }
  const capabilities =
    files.find((file) => file.path === "capabilities.yaml")?.bytes ??
    new Uint8Array();
  const slug = projectSlugOf(new TextDecoder().decode(capabilities));
  if (slug !== TEMPLATE_SLUG && !force) {
    dependencies.error(
      `This project is already initialized (capabilities.yaml project.slug is ${slug ?? "missing"}); pass --force to re-run.`
    );
    return 1;
  }
  let plan: InitPlan;
  try {
    plan = planInit(identity, files, { withoutOperator });
  } catch (error) {
    dependencies.error((error as Error).message);
    return 1;
  }
  for (const line of describePlan(plan)) dependencies.log(line);
  if (dryRun) {
    dependencies.log("Dry run: nothing was written.");
    return 0;
  }

  await applyPlan(plan, dependencies);
  const touched = [
    ...plan.edits.map((edit) => edit.path),
    ...plan.renames.flatMap((rename) => [rename.from, rename.to]),
    ...plan.deletions,
  ];
  const staged = await dependencies.capture("git", [
    "add",
    "--all",
    "--",
    ...new Set(touched),
  ]);
  if (staged.exitCode !== 0) {
    dependencies.error(`git add failed: ${staged.stderr.trim()}`);
    return 1;
  }

  if (!(await finish(identity, skipInstall, history, dependencies))) return 1;
  for (const line of nextSteps(identity, history)) dependencies.log(line);
  return 0;
};
