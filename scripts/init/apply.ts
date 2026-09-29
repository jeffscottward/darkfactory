import {
  describePlan,
  INIT_USAGE,
  type InitIdentity,
  type InitPlan,
  parseInitArguments,
  planInit,
  projectSlugOf,
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
  ["bun", ["run", "api:openapi:generate"]],
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

const nextSteps = (identity: InitIdentity): readonly string[] => [
  "",
  `Initialized ${identity.name}. Changes are staged; review them with: git diff --cached --stat`,
  "Next steps:",
  "  1. bun run setup",
  `  2. bun run dev   (https://${identity.slug}.localhost)`,
  "  3. git commit -m 'chore: initialize project'",
  `  4. Create the GitHub repository ${identity.repo} and push:`,
  "       git remote rename origin template",
  `       gh repo create ${identity.repo} --private --source=. --remote=origin --push`,
  ...(identity.workersSubdomain === undefined
    ? [
        `  5. Replace ${WORKERS_PLACEHOLDER} in apps/web/wrangler.jsonc with your workers.dev subdomain before deploying staging.`,
      ]
    : []),
];

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
  const { identity, dryRun, force, skipInstall } = parsed.options;

  const refusal = await cleanTree(dependencies);
  if (refusal !== undefined) {
    dependencies.error(refusal);
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
    plan = planInit(identity, files);
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

  if (skipInstall) {
    dependencies.log(
      "Skipped post-steps (--skip-install): pnpm install, docs:generate, api:openapi:generate, auth:schema:generate, format."
    );
  } else if (!(await runPostSteps(identity, dependencies))) {
    return 1;
  }
  for (const line of nextSteps(identity)) dependencies.log(line);
  return 0;
};
