// What: the Linux filesystem sandbox (bubblewrap) for OMP runs and git. It
// mirrors the macOS sandbox-exec profiles in omp.ts#sandboxProfileFor and
// omp.ts#gitSandboxProfileFor: an empty read-only root, system libraries
// read-only, and only the listed paths bound in.
// Used by: packages/jobs/src/server/omp.ts (ompSandboxCommand, gitSandboxCommand).
// See: docs/operator.md#platform-support

import { lstat, realpath } from "node:fs/promises";
import { posix } from "node:path";

export const BUBBLEWRAP_EXECUTABLE = "/usr/bin/bwrap";

// Linux counterparts of the macOS read-only system paths: shared libraries
// (the ELF loader lives under /usr/lib*), shared data and TLS trust stores.
const SYSTEM_READ_DIRECTORIES = Object.freeze([
  "/usr/lib",
  "/usr/lib32",
  "/usr/lib64",
  "/usr/libx32",
  "/usr/share",
  "/etc/ssl",
  "/etc/ca-certificates",
  "/etc/pki",
] as const);
// Merged-/usr systems link these to /usr/lib*; older layouts keep directories.
const ROOT_LIBRARY_PATHS = Object.freeze([
  "/lib",
  "/lib32",
  "/lib64",
  "/libx32",
] as const);
const SYSTEM_READ_FILES = Object.freeze([
  "/etc/hosts",
  "/etc/resolv.conf",
] as const);
const DEVICE_FILES = Object.freeze([
  "/dev/null",
  "/dev/random",
  "/dev/urandom",
] as const);
// No capabilities, no inherited namespaces, and the sandbox dies with its parent.
const ISOLATION = Object.freeze([
  "--unshare-all",
  "--die-with-parent",
  "--cap-drop",
  "ALL",
] as const);

const isSystemReadPath = (path: string): boolean =>
  SYSTEM_READ_DIRECTORIES.some(
    (directory) => path === directory || path.startsWith(`${directory}/`)
  );

const systemMountArguments = async (): Promise<string[]> => {
  const mounts: string[] = [];
  for (const path of [...SYSTEM_READ_DIRECTORIES, ...ROOT_LIBRARY_PATHS]) {
    try {
      const metadata = await lstat(path);
      if (metadata.isDirectory()) {
        mounts.push("--ro-bind", path, path);
      } else if (metadata.isSymbolicLink()) {
        const target = await realpath(path);
        if (isSystemReadPath(target)) mounts.push("--symlink", target, path);
      }
    } catch {
      // Absent on this distribution, or a dangling link: nothing to expose.
    }
  }
  for (const path of SYSTEM_READ_FILES)
    mounts.push("--ro-bind-try", path, path);
  for (const path of DEVICE_FILES) mounts.push("--dev-bind", path, path);
  return mounts;
};

// Shallow paths first, so a nested bind is mounted over its parent.
const byDepth = (paths: readonly string[]): string[] =>
  [...new Set(paths)].sort(
    (left, right) =>
      left.split(posix.sep).length - right.split(posix.sep).length ||
      left.localeCompare(right)
  );

export type BubblewrapOmpPolicy = Readonly<{
  cwd: string;
  sessionDirectory: string;
  executable: string;
  scopePaths: readonly string[];
  writableScopes: boolean;
  wayfinderTrackerDirectory?: string | undefined;
}>;

// The OMP agent: network like the macOS profile's network-outbound, the
// executable, the scope paths (writable only for implementation runs), the
// Wayfinder tracker and the session directory. The repository root shows only
// the scope paths. /proc is private to the sandbox's PID namespace; Linux
// executables need it to find themselves.
export const bubblewrapOmpArguments = async (
  policy: BubblewrapOmpPolicy
): Promise<readonly string[]> => {
  const scopeBind = policy.writableScopes ? "--bind" : "--ro-bind-try";
  return Object.freeze([
    ...ISOLATION,
    "--share-net",
    ...(await systemMountArguments()),
    "--proc",
    "/proc",
    "--ro-bind",
    policy.executable,
    policy.executable,
    "--dir",
    policy.cwd,
    ...byDepth(policy.scopePaths).flatMap((path) => [scopeBind, path, path]),
    ...(policy.wayfinderTrackerDirectory === undefined
      ? []
      : [
          "--bind",
          policy.wayfinderTrackerDirectory,
          policy.wayfinderTrackerDirectory,
        ]),
    "--bind",
    policy.sessionDirectory,
    policy.sessionDirectory,
    "--remount-ro",
    "/",
    "--chdir",
    policy.cwd,
  ]);
};

export type BubblewrapGitPolicy = Readonly<{
  cwd: string;
  gitExecutable: string;
  readablePaths: readonly string[];
  writablePaths: readonly string[];
}>;

// git: no network, like the macOS git profile. Writable binds are mounted after
// readable ones, so a writable subtree stays writable inside a readable one.
export const bubblewrapGitArguments = async (
  policy: BubblewrapGitPolicy
): Promise<readonly string[]> =>
  Object.freeze([
    ...ISOLATION,
    ...(await systemMountArguments()),
    "--ro-bind",
    policy.gitExecutable,
    policy.gitExecutable,
    ...byDepth(policy.readablePaths).flatMap((path) => [
      "--ro-bind",
      path,
      path,
    ]),
    ...byDepth(policy.writablePaths).flatMap((path) => ["--bind", path, path]),
    "--remount-ro",
    "/",
    "--chdir",
    policy.cwd,
  ]);

// Proves unprivileged namespaces and mounts work here (they fail, for example,
// where AppArmor restricts user namespaces), using the same isolation flags.
export const BUBBLEWRAP_PROBE_ARGUMENTS = Object.freeze([
  ...ISOLATION,
  "--ro-bind",
  "/",
  "/",
  "--",
  BUBBLEWRAP_EXECUTABLE,
  "--version",
] as const);
