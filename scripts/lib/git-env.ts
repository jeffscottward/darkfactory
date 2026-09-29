/**
 * Git exports these variables to hooks so that Git commands inside the hook
 * operate on the invoking repository regardless of the working directory.
 * They leak into every child process: a pre-push run once executed the init
 * test's `git add`/`git commit` against a temporary clone, but the inherited
 * `GIT_DIR`/`GIT_INDEX_FILE` redirected them into the real worktree, leaving a
 * stray "chore: initialize project" commit on the branch being pushed.
 *
 * Any process that runs Git for a directory other than the invoking repository
 * (or that runs arbitrary verification lanes which might) must drop them.
 * Unrelated settings such as `GIT_SSH_COMMAND` or `GIT_ASKPASS` are kept.
 */
export const GIT_REPOSITORY_ENVIRONMENT_KEYS: readonly string[] = Object.freeze(
  [
    "GIT_DIR",
    "GIT_WORK_TREE",
    "GIT_INDEX_FILE",
    "GIT_OBJECT_DIRECTORY",
    "GIT_ALTERNATE_OBJECT_DIRECTORIES",
    "GIT_COMMON_DIR",
    "GIT_PREFIX",
    "GIT_NAMESPACE",
    "GIT_QUARANTINE_PATH",
  ]
);

/** Returns a copy of `env` without Git's repository-locating variables. */
export const withoutGitRepositoryEnvironment = (
  env: NodeJS.ProcessEnv = process.env
): NodeJS.ProcessEnv => {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) => !GIT_REPOSITORY_ENVIRONMENT_KEYS.includes(key)
    )
  );
};
