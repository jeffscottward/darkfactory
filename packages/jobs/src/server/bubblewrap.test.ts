import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUBBLEWRAP_EXECUTABLE,
  BUBBLEWRAP_PROBE_ARGUMENTS,
  bubblewrapFilteredProbeArguments,
  bubblewrapGitArguments,
  bubblewrapOmpArguments,
  PROCESS_FILTER_PROBE_OUTPUT,
} from "./bubblewrap.ts";

// A simulated host layout that reaches every branch of the system mounts:
// directories, links into /usr/lib, links elsewhere, dangling links, files and
// absent paths.
type Entry =
  | Readonly<{ kind: "directory" | "file" }>
  | Readonly<{ kind: "link"; target: string | null }>;

const layout = vi.hoisted(() => new Map<string, Entry>());

vi.mock("node:fs/promises", () => ({
  lstat: async (path: string) => {
    const entry = layout.get(path);
    if (entry === undefined) {
      throw Object.assign(new Error("absent"), { code: "ENOENT" });
    }
    return {
      isDirectory: () => entry.kind === "directory",
      isSymbolicLink: () => entry.kind === "link",
    };
  },
  realpath: async (path: string) => {
    const entry = layout.get(path);
    if (entry?.kind !== "link" || entry.target === null) {
      throw Object.assign(new Error("dangling"), { code: "ENOENT" });
    }
    return entry.target;
  },
}));

const SYSTEM_MOUNTS = [
  "--ro-bind",
  "/usr/lib",
  "/usr/lib",
  "--symlink",
  "/usr/lib",
  "/usr/lib64",
  "--ro-bind",
  "/usr/share",
  "/usr/share",
  "--ro-bind",
  "/etc/ssl",
  "/etc/ssl",
  "--symlink",
  "/usr/lib",
  "/lib64",
  "--ro-bind",
  "/libx32",
  "/libx32",
  "--ro-bind-try",
  "/etc/hosts",
  "/etc/hosts",
  "--ro-bind-try",
  "/etc/resolv.conf",
  "/etc/resolv.conf",
  "--dev-bind",
  "/dev/null",
  "/dev/null",
  "--dev-bind",
  "/dev/random",
  "/dev/random",
  "--dev-bind",
  "/dev/urandom",
  "/dev/urandom",
];
const ISOLATION = ["--unshare-all", "--die-with-parent", "--cap-drop", "ALL"];

beforeEach(() => {
  layout.clear();
  layout.set("/usr/lib", { kind: "directory" });
  layout.set("/usr/lib64", { kind: "link", target: "/usr/lib" });
  layout.set("/usr/libx32", { kind: "link", target: "/opt/elsewhere" });
  layout.set("/usr/share", { kind: "directory" });
  layout.set("/etc/ssl", { kind: "directory" });
  layout.set("/etc/ca-certificates", { kind: "file" });
  layout.set("/etc/pki", { kind: "link", target: null });
  layout.set("/lib64", { kind: "link", target: "/usr/lib" });
  layout.set("/libx32", { kind: "directory" });
});

describe("bubblewrap sandbox arguments", () => {
  it("gives the agent no network, its executable, read-only scopes and its session", async () =>
    expect(
      await bubblewrapOmpArguments({
        cwd: "/w/repo",
        sessionDirectory: "/tmp/session",
        executable: "/opt/omp/omp",
        scopePaths: [
          "/w/repo/packages/jobs/src",
          "/w/repo/apps",
          "/w/repo/apps",
        ],
        writableScopes: false,
      })
    ).toEqual([
      ...ISOLATION,
      ...SYSTEM_MOUNTS,
      "--proc",
      "/proc",
      "--ro-bind",
      "/opt/omp/omp",
      "/opt/omp/omp",
      "--dir",
      "/w/repo",
      "--ro-bind-try",
      "/w/repo/apps",
      "/w/repo/apps",
      "--ro-bind-try",
      "/w/repo/packages/jobs/src",
      "/w/repo/packages/jobs/src",
      "--bind",
      "/tmp/session",
      "/tmp/session",
      "--remount-ro",
      "/",
      "--chdir",
      "/w/repo",
    ]));

  it("makes scopes writable for implementation and binds the Wayfinder tracker", async () => {
    const policy = await bubblewrapOmpArguments({
      cwd: "/w/repo",
      sessionDirectory: "/tmp/session",
      executable: "/opt/omp/omp",
      scopePaths: ["/w/repo/apps"],
      writableScopes: true,
      wayfinderTrackerDirectory: "/w/repo/.scratch/run-1",
    });
    return expect(policy.slice(policy.indexOf("--dir"), -4)).toEqual([
      "--dir",
      "/w/repo",
      "--bind",
      "/w/repo/apps",
      "/w/repo/apps",
      "--bind",
      "/w/repo/.scratch/run-1",
      "/w/repo/.scratch/run-1",
      "--bind",
      "/tmp/session",
      "/tmp/session",
    ]);
  });

  it("gives git no network and mounts writable paths after readable ones", async () =>
    expect(
      await bubblewrapGitArguments({
        cwd: "/w/repo",
        gitExecutable: "/usr/bin/git",
        readablePaths: ["/w/worktrees", "/w/repo"],
        writablePaths: ["/w/repo/.git", "/w/worktrees"],
      })
    ).toEqual([
      ...ISOLATION,
      ...SYSTEM_MOUNTS,
      "--ro-bind",
      "/usr/bin/git",
      "/usr/bin/git",
      "--ro-bind",
      "/w/repo",
      "/w/repo",
      "--ro-bind",
      "/w/worktrees",
      "/w/worktrees",
      "--bind",
      "/w/worktrees",
      "/w/worktrees",
      "--bind",
      "/w/repo/.git",
      "/w/repo/.git",
      "--remount-ro",
      "/",
      "--chdir",
      "/w/repo",
    ]));

  it("probes namespaces, then the process filter on stdin, with the same isolation", () => {
    expect(BUBBLEWRAP_EXECUTABLE).toBe("/usr/bin/bwrap");
    expect(BUBBLEWRAP_PROBE_ARGUMENTS).toEqual([
      ...ISOLATION,
      "--ro-bind",
      "/",
      "/",
      "--",
      "/usr/bin/bwrap",
      "--version",
    ]);
    // The runtime tries to start itself again; under the filter that must fail.
    expect(PROCESS_FILTER_PROBE_OUTPUT).toBe("EPERM");
    return expect(bubblewrapFilteredProbeArguments("/opt/bun/bin/bun")).toEqual(
      [
        ...ISOLATION,
        "--ro-bind",
        "/",
        "/",
        "--dev",
        "/dev",
        "--seccomp",
        "0",
        "--",
        "/opt/bun/bin/bun",
        "-e",
        "process.stdout.write(require('node:child_process').spawnSync(process.execPath, ['--version']).error?.code ?? 'none')",
      ]
    );
  });
});
