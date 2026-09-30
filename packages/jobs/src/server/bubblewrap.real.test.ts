// Real bubblewrap runs. They execute only where unprivileged user namespaces
// work (the Linux dev hosts) and are skipped elsewhere; the mocked tests in
// bubblewrap.test.ts and omp.test.ts keep full coverage on every host.
import { execFile, execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUBBLEWRAP_EXECUTABLE,
  BUBBLEWRAP_PROBE_ARGUMENTS,
  bubblewrapGitArguments,
  bubblewrapOmpArguments,
} from "./bubblewrap.ts";

const execFileAsync = promisify(execFile);

const usable = (() => {
  if (process.platform !== "linux") return false;
  try {
    execFileSync(BUBBLEWRAP_EXECUTABLE, [...BUBBLEWRAP_PROBE_ARGUMENTS], {
      stdio: "ignore",
      timeout: 10_000,
    });
    return true;
  } catch {
    return false;
  }
})();

const installedOmp = (process.env["PATH"] ?? "")
  .split(delimiter)
  .map((directory) => join(directory, "omp"))
  .find((candidate) => {
    try {
      execFileSync(candidate, ["--version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });

// Each probe reports "ok" or an error code; no file content is read back.
const PROBES = String.raw`
const fs = require("node:fs"), net = require("node:net");
const input = JSON.parse(process.argv[1]);
const attempt = (action) => { try { action(); return "ok"; } catch (e) { return e.code ?? String(e); } };
const connect = (port) => new Promise((done) => {
  const socket = net.connect({ host: "127.0.0.1", port }, () => { socket.destroy(); done("ok"); });
  socket.on("error", (e) => done(e.code));
});
(async () => {
  let status = "";
  try { status = fs.readFileSync("/proc/self/status", "utf8"); } catch {}
  console.log(JSON.stringify({
    readScope: attempt(() => fs.readFileSync(input.scope + "/in.txt")),
    writeScope: attempt(() => fs.writeFileSync(input.scope + "/new.txt", "x")),
    readOther: attempt(() => fs.readFileSync(input.repository + "/other/out.txt")),
    readGitFile: attempt(() => fs.readFileSync(input.repository + "/.git")),
    listRepository: attempt(() => fs.readdirSync(input.repository)) === "ok"
      ? fs.readdirSync(input.repository).sort().join(",") : "denied",
    writeRepository: attempt(() => fs.writeFileSync(input.repository + "/escape.txt", "x")),
    writeTracker: attempt(() => fs.writeFileSync(input.tracker + "/map.md", "x")),
    writeSession: attempt(() => fs.writeFileSync(input.session + "/ok.txt", "x")),
    writeTmp: attempt(() => fs.writeFileSync("/tmp/escape.txt", "x")),
    homeSsh: attempt(() => fs.readdirSync(input.home + "/.ssh")),
    passwd: attempt(() => fs.readFileSync("/etc/passwd")),
    capabilities: status === "" ? "no-proc" : /CapEff:\s*0+\n/.test(status) ? "none" : "present",
    processes: status === "" ? "no-proc" : String(fs.readdirSync("/proc").filter((n) => /^\d+$/.test(n)).length),
    network: await connect(input.port),
  }));
})();
`;

let root = "";
let repository = "";
let scope = "";
let tracker = "";
let session = "";
let server: Server;
let port = 0;

const node = process.execPath;
const probeIn = async (
  sandbox: readonly string[],
  cwd: string
): Promise<Record<string, string>> => {
  const input = JSON.stringify({
    repository,
    scope,
    tracker,
    session,
    home: process.env["HOME"] ?? "/root",
    port,
  });
  const { stdout } = await execFileAsync(
    BUBBLEWRAP_EXECUTABLE,
    [...sandbox, "--", node, "-e", PROBES, input],
    {
      cwd,
      encoding: "utf8",
      env: { HOME: session, PATH: "/usr/bin", TMPDIR: session },
      timeout: 20_000,
    }
  );
  return JSON.parse(stdout) as Record<string, string>;
};

const ompPolicy = (writableScopes: boolean, executable = node) =>
  bubblewrapOmpArguments({
    cwd: repository,
    sessionDirectory: session,
    executable,
    scopePaths: [scope],
    writableScopes,
    wayfinderTrackerDirectory: tracker,
  });

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "df-bwrap-")));
  repository = join(root, "repository");
  scope = join(repository, "scope");
  tracker = join(repository, ".scratch", "run-1");
  session = join(root, "session");
  await mkdir(scope, { recursive: true });
  await mkdir(tracker, { recursive: true });
  await mkdir(join(repository, "other"));
  await mkdir(session);
  await writeFile(join(scope, "in.txt"), "in scope");
  await writeFile(join(repository, "other", "out.txt"), "outside scope");
  await writeFile(join(repository, ".git"), "gitdir: /elsewhere");
  server = createServer((socket) => socket.end());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  port = typeof address === "object" && address !== null ? address.port : 0;
});

afterEach(async () => {
  server.close();
  await once(server, "close");
  await rm(root, { recursive: true, force: true });
});

describe.runIf(usable)("bubblewrap sandbox on this host", () => {
  it("confines a planning run to its read-only scope, tracker and session", async () =>
    expect(await probeIn(await ompPolicy(false), repository)).toEqual({
      readScope: "ok",
      writeScope: "EROFS",
      readOther: "ENOENT",
      readGitFile: "ENOENT",
      listRepository: ".scratch,scope",
      writeRepository: "EROFS",
      writeTracker: "ok",
      writeSession: "ok",
      writeTmp: "EROFS",
      homeSsh: "ENOENT",
      passwd: "ENOENT",
      capabilities: "none",
      processes: expect.stringMatching(/^[1-3]$/u),
      network: "ok",
    }));

  it("lets an implementation run write inside its scope and nowhere else", async () => {
    expect(await probeIn(await ompPolicy(true), repository)).toMatchObject({
      writeScope: "ok",
      writeRepository: "EROFS",
      readOther: "ENOENT",
      writeTmp: "EROFS",
    });
    return expect(await readFile(join(scope, "new.txt"), "utf8")).toBe("x");
  });

  it("gives git no network and writes only where granted", async () => {
    const worktrees = join(root, "worktrees");
    const source = join(root, "source");
    await mkdir(worktrees);
    await mkdir(source);
    const gitEnvironment = {
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_NOSYSTEM: "1",
      HOME: root,
      LC_ALL: "C",
      PATH: "/usr/bin:/bin",
    };
    const hostGit = (...arguments_: string[]) =>
      execFileSync("/usr/bin/git", ["-C", source, ...arguments_], {
        env: gitEnvironment,
      });
    hostGit("init", "-q", "-b", "main");
    await writeFile(join(source, "file.txt"), "tracked");
    hostGit("add", "file.txt");
    hostGit(
      "-c",
      "user.name=Sandbox Test",
      "-c",
      "user.email=sandbox@example.invalid",
      "commit",
      "-q",
      "-m",
      "seed"
    );
    const sandbox = await bubblewrapGitArguments({
      cwd: source,
      gitExecutable: "/usr/bin/git",
      readablePaths: [source, worktrees],
      writablePaths: [join(source, ".git"), worktrees],
    });
    const sandboxedGit = (...arguments_: string[]) =>
      execFileAsync(
        BUBBLEWRAP_EXECUTABLE,
        [...sandbox, "--", "/usr/bin/git", ...arguments_],
        { cwd: source, env: gitEnvironment }
      ).then(
        () => "ok",
        () => "denied"
      );
    expect(
      await sandboxedGit(
        "worktree",
        "add",
        "--detach",
        join(worktrees, "checkout"),
        "HEAD"
      )
    ).toBe("ok");
    expect(
      await readFile(join(worktrees, "checkout", "file.txt"), "utf8")
    ).toBe("tracked");
    expect(
      await sandboxedGit(
        "worktree",
        "add",
        "--detach",
        join(root, "outside"),
        "HEAD"
      )
    ).toBe("denied");
    const network = await probeIn(
      await bubblewrapGitArguments({
        cwd: session,
        gitExecutable: node,
        readablePaths: [scope],
        writablePaths: [session],
      }),
      session
    );
    // A private network namespace: bwrap brings up its own loopback, so the
    // host listener that the agent sandbox reaches ("ok") is not there.
    return expect(network).toMatchObject({
      network: "ECONNREFUSED",
      capabilities: "no-proc",
      readScope: "ok",
      writeScope: "EROFS",
      writeSession: "ok",
      readOther: "ENOENT",
    });
  });

  it("stops the sandboxed process when its process group is terminated", async () => {
    const marker = `df-bwrap-marker-${process.pid}-${root.length}`;
    const child = spawn(
      BUBBLEWRAP_EXECUTABLE,
      [
        ...(await ompPolicy(false)),
        "--",
        node,
        "-e",
        'process.stdout.write("ready\\n"); setInterval(() => {}, 1000);',
        marker,
      ],
      { detached: true, stdio: ["ignore", "pipe", "ignore"] }
    );
    await once(child.stdout, "data");
    const exited = once(child, "exit");
    process.kill(-(child.pid ?? 0), "SIGTERM");
    await exited;
    // Exit of the namespace's init kills every process left inside it.
    const survivors: string[] = [];
    for (const entry of await readdir("/proc")) {
      if (!/^\d+$/u.test(entry)) continue;
      const commandLine = await readFile(
        `/proc/${entry}/cmdline`,
        "utf8"
      ).catch(() => "");
      if (commandLine.includes(marker)) survivors.push(entry);
    }
    return expect(survivors).toEqual([]);
  });

  it.runIf(installedOmp !== undefined)(
    "starts the installed OMP binary inside the agent sandbox",
    async () => {
      const executable = await realpath(installedOmp ?? "");
      const { stdout } = await execFileAsync(
        BUBBLEWRAP_EXECUTABLE,
        [
          ...(await ompPolicy(false, executable)),
          "--",
          executable,
          "--version",
        ],
        {
          cwd: repository,
          env: { HOME: session, PATH: "/usr/bin", TMPDIR: session },
          encoding: "utf8",
        }
      );
      return expect(stdout).toMatch(/^omp\/\d+\.\d+\.\d+/u);
    }
  );
});
