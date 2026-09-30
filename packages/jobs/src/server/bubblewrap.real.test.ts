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
import { createServer as createHttpServer } from "node:http";
import { type AddressInfo, createServer, type Server } from "node:net";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import type { Writable } from "node:stream";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  BUBBLEWRAP_EXECUTABLE,
  BUBBLEWRAP_PROBE_ARGUMENTS,
  bubblewrapFilteredProbeArguments,
  bubblewrapGitArguments,
  bubblewrapOmpArguments,
  PROCESS_FILTER_PROBE_OUTPUT,
} from "./bubblewrap.ts";
import {
  OMP_MODEL_RELAY_API_KEY,
  OMP_MODEL_RELAY_SANDBOX_ARGUMENTS,
  OMP_SANDBOX_MODEL_PORT,
  openOmpModelRelay,
} from "./model-relay.ts";
import {
  processFilterArguments,
  processFilterFor,
  sendProcessFilter,
} from "./seccomp.ts";

const execFileAsync = promisify(execFile);

// Runs a command in bwrap with the process filter on `fd` (0 is stdin), as
// the worker does, and reports its exit code and output.
const runFiltered = async (
  sandbox: readonly string[],
  fd: 0 | 3,
  command: readonly string[],
  options: Readonly<{ cwd: string; env: NodeJS.ProcessEnv }>
): Promise<Readonly<{ code: number | null; stdout: string }>> => {
  const child = spawn(
    BUBBLEWRAP_EXECUTABLE,
    [...sandbox, ...processFilterArguments(fd), "--", ...command],
    {
      ...options,
      stdio:
        fd === 0
          ? ["pipe", "pipe", "ignore"]
          : ["ignore", "pipe", "ignore", "pipe"],
    }
  );
  sendProcessFilter(
    child.stdio[fd] as Writable,
    processFilterFor(process.arch)
  );
  let stdout = "";
  child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
  const [code] = (await once(child, "close")) as [number | null];
  return { code, stdout };
};

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
      // No network: the host's loopback port is out of reach.
      network: "ECONNREFUSED",
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
    // Every other git operation runs under the process filter on stdin: git
    // still works (it reopens the closed stdin on /dev/null), but it cannot
    // start a program, here /usr/bin/git through a "!" alias.
    const filteredGit = async (...arguments_: string[]) =>
      (
        await runFiltered(sandbox, 0, ["/usr/bin/git", ...arguments_], {
          cwd: source,
          env: gitEnvironment,
        })
      ).code === 0
        ? "ok"
        : "denied";
    const alias = ["-c", "alias.probe=!/usr/bin/git", "probe", "--version"];
    expect({
      status: await filteredGit("status", "--porcelain"),
      head: await filteredGit("rev-parse", "HEAD"),
      aliasFiltered: await filteredGit(...alias),
      aliasUnfiltered: await sandboxedGit(...alias),
    }).toEqual({
      status: "ok",
      head: "ok",
      aliasFiltered: "denied",
      aliasUnfiltered: "ok",
    });
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

  it("lets the agent run threads but start no other process", async () => {
    // Node starts a worker thread and tries to start node itself.
    const script = `
const { Worker } = require("node:worker_threads");
const started = require("node:child_process").spawnSync(process.execPath, ["--version"]);
const worker = new Worker("require('node:worker_threads').parentPort.postMessage('ran')", { eval: true });
worker.once("message", (thread) => {
  console.log(JSON.stringify({ process: started.error?.code ?? "started", thread }));
  void worker.terminate();
});
`;
    const options = {
      cwd: repository,
      env: { HOME: session, PATH: "/usr/bin", TMPDIR: session },
    };
    const filtered = await runFiltered(
      await ompPolicy(false),
      3,
      [node, "-e", script],
      options
    );
    const { stdout } = await execFileAsync(
      BUBBLEWRAP_EXECUTABLE,
      [...(await ompPolicy(false)), "--", node, "-e", script],
      { ...options, encoding: "utf8" }
    );
    return expect({
      filtered: { code: filtered.code, ...JSON.parse(filtered.stdout) },
      unfiltered: JSON.parse(stdout),
    }).toEqual({
      filtered: { code: 0, process: "EPERM", thread: "ran" },
      unfiltered: { process: "started", thread: "ran" },
    });
  });

  it("passes the process filter probe, which fails open without the filter", async () => {
    const probe = async (filtered: boolean) => {
      const arguments_ = bubblewrapFilteredProbeArguments(process.execPath);
      const separator = arguments_.indexOf("--");
      const child = spawn(
        BUBBLEWRAP_EXECUTABLE,
        filtered
          ? [...arguments_]
          : [
              ...arguments_.slice(0, separator - 2),
              ...arguments_.slice(separator),
            ],
        { stdio: ["pipe", "pipe", "ignore"] }
      );
      if (filtered) {
        sendProcessFilter(child.stdin, processFilterFor(process.arch));
      } else child.stdin.end();
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      const [code] = (await once(child, "close")) as [number | null];
      return { code, stdout };
    };
    // Without the filter, the process starts and only its exec fails.
    return expect({
      filtered: await probe(true),
      unfiltered: await probe(false),
    }).toEqual({
      filtered: { code: 0, stdout: PROCESS_FILTER_PROBE_OUTPUT },
      unfiltered: { code: 0, stdout: "ENOENT" },
    });
  });

  it.runIf(installedOmp !== undefined)(
    "starts the installed OMP binary inside the agent sandbox, under the process filter",
    async () => {
      const executable = await realpath(installedOmp ?? "");
      const { code, stdout } = await runFiltered(
        await ompPolicy(false, executable),
        3,
        [executable, "--version"],
        {
          cwd: repository,
          env: { HOME: session, PATH: "/usr/bin", TMPDIR: session },
        }
      );
      return expect({ code, stdout }).toEqual({
        code: 0,
        stdout: expect.stringMatching(/^omp\/\d+\.\d+\.\d+/u),
      });
    }
  );

  it("reaches only its own model, through the relay, with no other network", async () => {
    const allowed = "openrouter/google/gemini-3.8-flash";
    const token = "real-relay-test-token-0123456789";
    const seen: string[] = [];
    const gateway = createHttpServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) body += String(chunk);
      seen.push(`${request.headers.authorization} ${body}`);
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end("data: ok\n\n");
    });
    gateway.listen(0, "127.0.0.1");
    await once(gateway, "listening");
    const gatewayPort = (gateway.address() as AddressInfo).port;
    const relay = await openOmpModelRelay({
      route: {
        gatewayUrl: `http://127.0.0.1:${gatewayPort}`,
        token,
        modelId: allowed,
      },
    });
    // OMP's view from inside the sandbox: its model endpoint, the host's
    // gateway port, and the internet.
    const script = `
const net = require("node:net");
const post = (modelId) => fetch("http://127.0.0.1:${OMP_SANDBOX_MODEL_PORT}/v1/pi/stream", {
  method: "POST",
  headers: { "content-type": "application/json", authorization: "Bearer ${OMP_MODEL_RELAY_API_KEY}" },
  body: JSON.stringify({ modelId, context: { messages: [] } }),
}).then(async (r) => r.status + " " + (await r.text()).trim(), (e) => "error " + (e.cause?.code ?? e.message));
const connect = (host, port) => new Promise((done) => {
  const socket = net.connect({ host, port }, () => { socket.destroy(); done("ok"); });
  socket.on("error", (e) => done(e.code));
});
(async () => console.log(JSON.stringify({
  allowed: await post(${JSON.stringify(allowed)}),
  other: await post("anthropic/claude-opus-5-5"),
  gatewayPort: await connect("127.0.0.1", ${gatewayPort}),
  internet: await connect("1.1.1.1", 443),
})))();
`;
    try {
      // The worker's layout: relay on fds 3 and 4, process filter on fd 5,
      // sent before the relay waits for bwrap to report its process.
      const filterFd: number = 5;
      const child = spawn(
        BUBBLEWRAP_EXECUTABLE,
        [
          ...(await ompPolicy(false)),
          ...OMP_MODEL_RELAY_SANDBOX_ARGUMENTS,
          ...processFilterArguments(filterFd),
          "--",
          node,
          "-e",
          script,
        ],
        {
          cwd: repository,
          env: { HOME: session, PATH: "/usr/bin", TMPDIR: session },
          stdio: ["ignore", "pipe", "ignore", "pipe", "pipe", "pipe"],
        }
      );
      sendProcessFilter(
        child.stdio[filterFd] as Writable,
        processFilterFor(process.arch)
      );
      let stdout = "";
      child.stdout?.on("data", (chunk) => (stdout += String(chunk)));
      const closed = once(child, "close");
      await relay.attach(child);
      await closed;
      expect(JSON.parse(stdout)).toEqual({
        allowed: "200 data: ok",
        other: expect.stringMatching(/^403 /u),
        gatewayPort: "ECONNREFUSED",
        internet: "ENETUNREACH",
      });
      // The gateway saw one request: the allowed model, with its own bearer.
      return expect(seen).toEqual([
        `Bearer ${token} ${JSON.stringify({ modelId: allowed, context: { messages: [] } })}`,
      ]);
    } finally {
      await relay.close();
      gateway.close();
    }
  });
});
