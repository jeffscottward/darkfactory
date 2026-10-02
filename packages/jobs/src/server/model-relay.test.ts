import type { ChildProcess } from "node:child_process";
import { EventEmitter, once } from "node:events";
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import {
  createServer as createHttpServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import {
  type AddressInfo,
  connect,
  createServer as createNetServer,
} from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_OMP_IMPLEMENT_MODEL,
  DEFAULT_OMP_PLAN_MODEL,
  NSENTER_EXECUTABLE,
  OMP_MODEL_RELAY_API_KEY,
  OMP_SANDBOX_MODEL_PORT,
  OmpModelRelayError,
  ompModelForEffect,
  ompModelsConfigFor,
  openOmpModelRelay,
  parseOmpModelGatewayUrl,
  parseOmpModelId,
  readOmpModelGatewayToken,
  requireOmpModelGateway,
  runOmpModelRelayInboundMain,
  startOmpModelRelay,
  startOmpModelRelayInbound,
} from "./model-relay.ts";

const TOKEN = "gateway-token-0123456789abcdef";
const MODEL = DEFAULT_OMP_PLAN_MODEL;

let directory = "";

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "df-model-relay-"));
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

const portOf = (server: Server | ReturnType<typeof createNetServer>): number =>
  (server.address() as AddressInfo).port;

type Recorded = Readonly<{
  method: string | undefined;
  url: string | undefined;
  authorization: string | undefined;
  body: string;
}>;

// A stand-in for `omp auth-gateway`; `respond` decides each answer.
const startGateway = async (
  respond: (
    request: IncomingMessage,
    response: ServerResponse,
    body: string
  ) => void | Promise<void> = (_request, response) => {
    response.writeHead(200, { "content-type": "text/event-stream" });
    response.write("data: one\n\n");
    response.end("data: [DONE]\n\n");
  }
) => {
  const requests: Recorded[] = [];
  const server = createHttpServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization,
      body,
    });
    await respond(request, response, body);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return {
    url: `http://127.0.0.1:${portOf(server)}`,
    requests,
    server,
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
  };
};

const closedPortUrl = async (): Promise<string> => {
  const server = createNetServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = portOf(server);
  server.close();
  await once(server, "close");
  return `http://127.0.0.1:${port}`;
};

type Reply = Readonly<{
  status: number | undefined;
  contentType: string | undefined;
  body: string;
}>;

// One HTTP request over the relay's unix socket, as OMP would send through the
// inbound relay.
const viaSocket = (
  socketPath: string,
  input: Readonly<{
    method?: string;
    path?: string;
    body?: string | Buffer;
    headers?: Record<string, string>;
  }> = {}
): Promise<Reply> =>
  new Promise((resolve, reject) => {
    const request = httpRequest(
      {
        socketPath,
        method: input.method ?? "POST",
        path: input.path ?? "/v1/pi/stream",
        headers: { "content-type": "application/json", ...input.headers },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.once("end", () =>
          resolve({
            status: response.statusCode,
            contentType: response.headers["content-type"],
            body: Buffer.concat(chunks).toString("utf8"),
          })
        );
        response.once("error", reject);
      }
    );
    request.once("error", reject);
    request.end(input.body);
  });

const modelBody = (fields: Record<string, unknown> = {}): string =>
  JSON.stringify({
    modelId: MODEL,
    context: { messages: [] },
    stream: true,
    ...fields,
  });

const route = (gatewayUrl: string) =>
  Object.freeze({ gatewayUrl, token: TOKEN, modelId: MODEL });

describe("model ids and gateway settings", () => {
  it("accepts provider/model ids and loopback http gateways only", () => {
    for (const id of [
      DEFAULT_OMP_IMPLEMENT_MODEL,
      DEFAULT_OMP_PLAN_MODEL,
      "openrouter/google/gemini-3.8-flash:batch",
    ]) {
      expect(parseOmpModelId(id)).toBe(id);
    }
    for (const id of [
      "opus",
      "Anthropic/claude",
      "openrouter/~google/gemini-flash-latest",
      "openrouter/../escape",
      "openrouter/google/",
      `anthropic/${"a".repeat(260)}`,
    ]) {
      expect(() => parseOmpModelId(id)).toThrow("OMP model id is invalid");
    }
    expect(parseOmpModelGatewayUrl("http://127.0.0.1:4010")).toBe(
      "http://127.0.0.1:4010"
    );
    expect(parseOmpModelGatewayUrl("http://localhost:4010/")).toBe(
      "http://localhost:4010"
    );
    expect(parseOmpModelGatewayUrl("http://[::1]:4010")).toBe(
      "http://[::1]:4010"
    );
    for (const url of [
      "not a url",
      "https://127.0.0.1:4010",
      "http://gateway.example:4010",
      "http://user:secret@127.0.0.1:4010",
      "http://127.0.0.1:4010/v1",
      "http://127.0.0.1:4010/?x=1",
      "http://127.0.0.1:4010/#x",
    ]) {
      expect(() => parseOmpModelGatewayUrl(url)).toThrow(
        "OMP model gateway URL is invalid"
      );
    }
  });

  it("gives code writing the implementation model and routes one provider", () => {
    const gateway = {
      url: "http://127.0.0.1:4010",
      tokenFile: "/token",
      implementModel: DEFAULT_OMP_IMPLEMENT_MODEL,
      planModel: DEFAULT_OMP_PLAN_MODEL,
    };
    expect(ompModelForEffect(gateway, "implement")).toBe(
      DEFAULT_OMP_IMPLEMENT_MODEL
    );
    expect(ompModelForEffect(gateway, "plan")).toBe(DEFAULT_OMP_PLAN_MODEL);
    expect(ompModelForEffect(gateway, "verify")).toBe(DEFAULT_OMP_PLAN_MODEL);
    return expect(JSON.parse(ompModelsConfigFor(MODEL))).toEqual({
      providers: {
        openrouter: {
          baseUrl: `http://127.0.0.1:${OMP_SANDBOX_MODEL_PORT}`,
          transport: "pi-native",
          apiKey: OMP_MODEL_RELAY_API_KEY,
        },
      },
    });
  });
});

describe("gateway token", () => {
  it("reads only a private regular file of this user", async () => {
    const tokenFile = join(directory, "token");
    await writeFile(tokenFile, `${TOKEN}\n`, { mode: 0o600 });
    expect(await readOmpModelGatewayToken(tokenFile)).toBe(TOKEN);

    const link = join(directory, "link");
    await symlink(tokenFile, link);
    const readable = join(directory, "readable");
    await writeFile(readable, TOKEN);
    // chmod, not the write mode: the host umask would mask group bits.
    await chmod(readable, 0o640);
    const empty = join(directory, "empty");
    await writeFile(empty, "", { mode: 0o600 });
    const large = join(directory, "large");
    await writeFile(large, "x".repeat(4097), { mode: 0o600 });
    const spaced = join(directory, "spaced");
    await writeFile(spaced, "token with spaces inside", { mode: 0o600 });
    const short = join(directory, "short");
    await writeFile(short, "short", { mode: 0o600 });
    const folder = join(directory, "folder");
    await mkdir(folder);
    for (const [path, uid] of [
      [link, undefined],
      [readable, undefined],
      [empty, undefined],
      [large, undefined],
      [spaced, undefined],
      [short, undefined],
      [folder, undefined],
      [join(directory, "missing"), undefined],
      [tokenFile, (process.getuid?.() ?? 0) + 1],
    ] as const) {
      await expect(readOmpModelGatewayToken(path, uid)).rejects.toThrow(
        new OmpModelRelayError("OMP model gateway token is unavailable")
      );
    }
  });
});

describe("gateway check", () => {
  it("requires a healthy gateway that accepts the bearer and serves the model", async () => {
    let health = 200;
    let models = 200;
    let list: unknown = { data: [{ id: "anthropic/other" }, { id: MODEL }] };
    const gateway = await startGateway((request, response) => {
      if (request.url === "/healthz") {
        response.writeHead(health).end();
        return;
      }
      response.writeHead(models, { "content-type": "application/json" });
      response.end(JSON.stringify(list));
    });
    try {
      await requireOmpModelGateway({ route: route(gateway.url) });
      expect(gateway.requests.at(-1)).toMatchObject({
        url: "/v1/models",
        authorization: `Bearer ${TOKEN}`,
      });
      const fetchImpl = vi.fn(fetch);
      await requireOmpModelGateway({
        route: route(gateway.url),
        fetchImpl,
        timeoutMs: 2000,
      });
      expect(fetchImpl).toHaveBeenCalledTimes(2);

      for (const served of [
        { data: [{ id: "anthropic/other" }] },
        { data: ["openrouter/google/gemini-3.8-flash", null, {}] },
      ]) {
        list = served;
        await expect(
          requireOmpModelGateway({ route: route(gateway.url) })
        ).rejects.toThrow(
          "OMP model gateway does not serve the configured model"
        );
      }
      for (const [status, statusModels, malformed] of [
        [503, 200, { data: [] }],
        [200, 401, { data: [] }],
        [200, 200, []],
        [200, 200, { models: [] }],
        [200, 200, { data: "all" }],
        [200, 200, null],
      ] as const) {
        health = status;
        models = statusModels;
        list = malformed;
        await expect(
          requireOmpModelGateway({ route: route(gateway.url) })
        ).rejects.toThrow("OMP model gateway is unavailable");
      }
    } finally {
      await gateway.close();
    }
    await expect(
      requireOmpModelGateway({ route: route(await closedPortUrl()) })
    ).rejects.toThrow("OMP model gateway is unavailable");

    const silent = await startGateway(() => new Promise<void>(() => undefined));
    try {
      return await expect(
        requireOmpModelGateway({ route: route(silent.url), timeoutMs: 50 })
      ).rejects.toThrow("OMP model gateway is unavailable");
    } finally {
      await silent.close();
    }
  });
});

describe("host relay", () => {
  it("forwards only this run's model, with the gateway bearer instead of the sandbox's", async () => {
    const gateway = await startGateway();
    const relay = await startOmpModelRelay({
      socketPath: join(directory, "relay.sock"),
      route: route(gateway.url),
    });
    try {
      const reply = await viaSocket(relay.socketPath, {
        body: modelBody(),
        headers: { authorization: `Bearer ${OMP_MODEL_RELAY_API_KEY}` },
      });
      expect(reply).toEqual({
        status: 200,
        contentType: "text/event-stream",
        body: "data: one\n\ndata: [DONE]\n\n",
      });
      expect(gateway.requests).toEqual([
        {
          method: "POST",
          url: "/v1/pi/stream",
          authorization: `Bearer ${TOKEN}`,
          body: modelBody(),
        },
      ]);

      for (const [request, status] of [
        [{ method: "GET", path: "/v1/models" }, 404],
        [{ path: "/v1/messages", body: modelBody() }, 404],
        [{ body: "not json" }, 403],
        [{ body: "[]" }, 403],
        [{ body: "null" }, 403],
        [{ body: JSON.stringify({ context: {} }) }, 403],
        [{ body: modelBody({ modelId: DEFAULT_OMP_IMPLEMENT_MODEL }) }, 403],
        [{ body: modelBody({ model: { id: MODEL } }) }, 403],
      ] as const) {
        const refused = await viaSocket(relay.socketPath, request);
        expect(refused.status).toBe(status);
        expect(JSON.parse(refused.body)).toMatchObject({
          error: { type: "model_relay" },
        });
      }
      return expect(gateway.requests).toHaveLength(1);
    } finally {
      await relay.close();
      await gateway.close();
    }
  });

  it("bounds the request, reports an unreachable gateway and passes empty answers through", async () => {
    const gateway = await startGateway((_request, response) => {
      response.writeHead(204).end();
    });
    const fetchImpl = vi.fn(fetch);
    const relay = await startOmpModelRelay({
      socketPath: join(directory, "relay.sock"),
      route: route(gateway.url),
      maxRequestBytes: 256,
      fetchImpl,
    });
    const unreachable = await startOmpModelRelay({
      socketPath: join(directory, "unreachable.sock"),
      route: route(await closedPortUrl()),
    });
    try {
      expect(
        await viaSocket(relay.socketPath, {
          body: modelBody({ padding: "x".repeat(512) }),
        })
      ).toMatchObject({ status: 413 });
      expect(await viaSocket(relay.socketPath, { body: modelBody() })).toEqual({
        status: 204,
        contentType: "application/octet-stream",
        body: "",
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
      return expect(
        await viaSocket(unreachable.socketPath, { body: modelBody() })
      ).toMatchObject({ status: 502 });
    } finally {
      await relay.close();
      await unreachable.close();
      await gateway.close();
    }
  });

  it("streams large answers with backpressure and stops the gateway when the sandbox hangs up", async () => {
    const large = Buffer.alloc(8 * 1024 * 1024, 0x61);
    let slowClosed: Promise<unknown> = Promise.resolve();
    const gateway = await startGateway(async (request, response, body) => {
      if (body.includes('"size":"large"')) {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(large);
        return;
      }
      slowClosed = once(request.socket, "close");
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.write("data: first\n\n");
    });
    const relay = await startOmpModelRelay({
      socketPath: join(directory, "relay.sock"),
      route: route(gateway.url),
    });
    try {
      const reply = await viaSocket(relay.socketPath, {
        body: modelBody({ size: "large" }),
      });
      expect(reply.body.length).toBe(large.length);

      // The sandbox reads one event and hangs up: the relay aborts the
      // gateway request instead of keeping it open.
      await new Promise<void>((resolve, reject) => {
        const request = httpRequest(
          {
            socketPath: relay.socketPath,
            method: "POST",
            path: "/v1/pi/stream",
          },
          (response) => {
            response.once("data", () => {
              request.destroy();
              resolve();
            });
          }
        );
        request.once("error", () => undefined);
        request.once("close", () => resolve());
        request.end(modelBody());
        setTimeout(() => reject(new Error("no first event")), 5000);
      });
      await slowClosed;

      // A sandbox that dies mid-upload does not take the relay down.
      await new Promise<void>((resolve) => {
        const socket = connect(relay.socketPath, () => {
          socket.write(
            "POST /v1/pi/stream HTTP/1.1\r\nHost: relay\r\nContent-Length: 1000\r\n\r\n{"
          );
          setTimeout(() => {
            socket.destroy();
            resolve();
          }, 50);
        });
      });
      return expect(
        await viaSocket(relay.socketPath, {
          body: modelBody({ size: "large" }),
        })
      ).toMatchObject({ status: 200 });
    } finally {
      await relay.close();
      await gateway.close();
    }
  });
});

describe("inbound relay", () => {
  it("pipes the sandbox's loopback port to the relay socket and closes open connections", async () => {
    const socketPath = join(directory, "relay.sock");
    const echo = createNetServer((socket) => socket.pipe(socket));
    echo.listen(socketPath);
    await once(echo, "listening");
    const inbound = await startOmpModelRelayInbound({ socketPath, port: 0 });
    try {
      const client = connect(inbound.port, "127.0.0.1");
      await once(client, "connect");
      client.write("ping");
      const [echoed] = await once(client, "data");
      expect(String(echoed)).toBe("ping");
      const closed = once(client, "close");
      await inbound.close();
      await closed;
    } finally {
      echo.close();
    }

    // Without the relay socket, a sandbox connection is closed at once.
    const orphan = await startOmpModelRelayInbound({
      socketPath: join(directory, "missing.sock"),
      port: 0,
      host: "127.0.0.1",
    });
    try {
      const client = connect(orphan.port, "127.0.0.1");
      client.once("error", () => undefined);
      return await once(client, "close");
    } finally {
      await orphan.close();
    }
  });

  it("starts from <port> <socket>, prints ready, and stops when stdin closes", async () => {
    for (const argv of [
      [],
      ["4000"],
      ["4000", "/relay.sock", "extra"],
      ["0", "/relay.sock"],
      ["65536", "/relay.sock"],
      ["port", "/relay.sock"],
      ["4000", "relative.sock"],
    ]) {
      await expect(
        runOmpModelRelayInboundMain(argv, {
          stdin: new PassThrough(),
          stdout: new PassThrough(),
        })
      ).rejects.toThrow("model relay arguments are invalid");
    }
    const free = createNetServer();
    free.listen(0, "127.0.0.1");
    await once(free, "listening");
    const port = portOf(free);
    free.close();
    await once(free, "close");
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const running = runOmpModelRelayInboundMain(
      [String(port), join(directory, "relay.sock")],
      { stdin, stdout }
    );
    const [ready] = await once(stdout, "data");
    expect(String(ready)).toBe("ready\n");
    const probe = connect(port, "127.0.0.1");
    await once(probe, "connect");
    probe.destroy();
    stdin.end();
    return await running;
  });
});

type FakeProcess = EventEmitter & {
  stdout: PassThrough | null;
  stdin: PassThrough;
  stdio: unknown[];
  exitCode: number | null;
  kill: ReturnType<typeof vi.fn>;
};

// bwrap as the worker sees it: fd 3 reports the sandbox, fd 4 releases it.
const fakeSandbox = (info?: PassThrough, block?: PassThrough) =>
  Object.assign(new EventEmitter(), {
    stdio: [null, null, null, info, block],
  }) as unknown as ChildProcess;

// nsenter + inbound relay, as the worker sees it.
const fakeInbound = (
  behaviour: Readonly<{
    output?: string;
    stdout?: boolean;
    exitAtStdinEnd?: boolean;
    // false: no exit is ever reported, not even after SIGKILL.
    exitAtKill?: boolean;
    exitAtStart?: boolean;
    error?: boolean;
  }> = {}
): FakeProcess => {
  const child = Object.assign(new EventEmitter(), {
    stdout: behaviour.stdout === false ? null : new PassThrough(),
    stdin: new PassThrough(),
    stdio: [],
    exitCode: null as number | null,
    kill: vi.fn((signal: string) => {
      if (behaviour.exitAtKill === false) return true;
      child.exitCode = 137;
      child.emit("exit", null, signal);
      return true;
    }),
  });
  if (behaviour.exitAtStdinEnd !== false) {
    child.stdin.once("finish", () => {
      child.exitCode = 0;
      child.emit("exit", 0, null);
    });
  }
  setImmediate(() => {
    if (behaviour.error) {
      child.emit("error", new Error("spawn nsenter ENOENT"));
      return;
    }
    if (behaviour.exitAtStart) {
      child.exitCode = 1;
      child.emit("exit", 1, null);
      return;
    }
    child.stdout?.write(behaviour.output ?? "ready\n");
  });
  return child;
};

const reportPid = (info: PassThrough, pid: unknown): void => {
  const text = JSON.stringify({ "child-pid": pid }, null, 4);
  info.write(text.slice(0, 5));
  setImmediate(() => info.write(text.slice(5)));
};

describe("sandbox relay session", () => {
  it("starts the inbound relay in the sandbox's namespaces, then releases the sandbox", async () => {
    const gateway = await startGateway();
    const spawned: unknown[][] = [];
    let inbound: FakeProcess | undefined;
    const session = await openOmpModelRelay({
      route: route(gateway.url),
      runtimeExecutable: "/usr/bin/node",
      inboundEntry: "/opt/relay/model-relay-inbound-cli.ts",
      spawnImpl: ((...arguments_: unknown[]) => {
        spawned.push(arguments_);
        inbound = fakeInbound();
        return inbound;
      }) as never,
    });
    const info = new PassThrough();
    const block = new PassThrough();
    try {
      reportPid(info, 4242);
      await session.attach(fakeSandbox(info, block));
      expect(String(block.read())).toBe("1");
      const [executable, arguments_, options] = spawned[0] as [
        string,
        string[],
        Readonly<{ env: NodeJS.ProcessEnv; stdio: unknown }>,
      ];
      const socketPath = arguments_.at(-1)!;
      expect(executable).toBe(NSENTER_EXECUTABLE);
      expect(arguments_).toEqual([
        "--user",
        "--net",
        "--preserve-credentials",
        "--target=4242",
        "--",
        "/usr/bin/node",
        "/opt/relay/model-relay-inbound-cli.ts",
        String(OMP_SANDBOX_MODEL_PORT),
        socketPath,
      ]);
      expect(options).toEqual({
        env: { NODE_ENV: "production", NO_COLOR: "1", PATH: "/usr/bin:/bin" },
        stdio: ["pipe", "pipe", "ignore"],
      });
      // The socket leads to this run's relay.
      expect((await viaSocket(socketPath, { body: modelBody() })).status).toBe(
        200
      );
      expect(gateway.requests.at(-1)?.authorization).toBe(`Bearer ${TOKEN}`);
      await session.close();
      expect(inbound?.kill).not.toHaveBeenCalled();
      return expect(
        (await readdir(tmpdir())).some((name) =>
          socketPath.includes(`/${name}/`)
        )
      ).toBe(false);
    } finally {
      await gateway.close();
    }
  });

  it("fails closed when the sandbox or its inbound relay does not come up", async () => {
    const gatewayUrl = await closedPortUrl();
    const failures: (readonly [
      string,
      (session: Awaited<ReturnType<typeof openOmpModelRelay>>) => Promise<void>,
      Readonly<Parameters<typeof fakeInbound>[0]>,
    ])[] = [
      [
        "OMP sandbox did not report its process",
        (session) => session.attach(fakeSandbox()),
        {},
      ],
      ...[
        (info: PassThrough) => info.end("{}"),
        (info: PassThrough) => reportPid(info, 0),
        (info: PassThrough) => reportPid(info, "4242"),
        (info: PassThrough) => info.end("5"),
        (info: PassThrough) => info.write("x".repeat(5000)),
        () => undefined,
      ].map(
        (report) =>
          [
            "OMP sandbox did not report its process",
            async (session: Awaited<ReturnType<typeof openOmpModelRelay>>) => {
              const info = new PassThrough();
              report(info);
              return await session.attach(fakeSandbox(info, new PassThrough()));
            },
            {},
          ] as const
      ),
      ...(
        [
          { exitAtStart: true },
          { error: true },
          { stdout: false },
          { output: "x".repeat(5000) },
          { output: "starting\n" },
        ] as const
      ).map(
        (behaviour) =>
          [
            "OMP model relay failed to start",
            async (session: Awaited<ReturnType<typeof openOmpModelRelay>>) => {
              const info = new PassThrough();
              reportPid(info, 4242);
              return await session.attach(fakeSandbox(info, new PassThrough()));
            },
            behaviour,
          ] as const
      ),
    ];
    for (const [message, attach, behaviour] of failures) {
      const session = await openOmpModelRelay({
        route: route(gatewayUrl),
        readyTimeoutMs: 100,
        spawnImpl: (() => fakeInbound(behaviour)) as never,
      });
      await expect(attach(session)).rejects.toThrow(
        new OmpModelRelayError(message)
      );
      await session.close();
    }
  });

  it("kills an inbound relay that ignores its closed stdin", async () => {
    const inbound = fakeInbound({ exitAtStdinEnd: false });
    const session = await openOmpModelRelay({
      route: route(await closedPortUrl()),
      spawnImpl: (() => inbound) as never,
    });
    const info = new PassThrough();
    reportPid(info, 4242);
    await session.attach(fakeSandbox(info, new PassThrough()));
    await session.close();
    return expect(inbound.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("stops waiting for an inbound relay whose exit is never reported, and still cleans up", async () => {
    const inbound = fakeInbound({ exitAtStdinEnd: false, exitAtKill: false });
    // A private TMPDIR keeps other test files' relays out of the check.
    const relayRoot = await mkdtemp(join(tmpdir(), "df-relay-root-"));
    const previous = process.env["TMPDIR"];
    process.env["TMPDIR"] = relayRoot;
    try {
      const session = await openOmpModelRelay({
        route: route(await closedPortUrl()),
        exitTimeoutMs: 1200,
        spawnImpl: (() => inbound) as never,
      });
      const info = new PassThrough();
      reportPid(info, 4242);
      await session.attach(fakeSandbox(info, new PassThrough()));
      expect(await readdir(relayRoot)).toHaveLength(1);
      const startedAt = Date.now();
      await session.close();
      // SIGKILL went out after the grace period, then the wait gave up.
      expect(inbound.kill).toHaveBeenCalledWith("SIGKILL");
      expect(Date.now() - startedAt).toBeLessThan(4000);
      return expect(await readdir(relayRoot)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = previous;
      await rm(relayRoot, { recursive: true, force: true });
    }
  });

  it("uses the installed nsenter and runtime by default, and cleans up when the socket cannot listen", async () => {
    // A process ID that cannot exist: the real nsenter refuses it.
    const session = await openOmpModelRelay({
      route: route(await closedPortUrl()),
      readyTimeoutMs: 5000,
    });
    const info = new PassThrough();
    reportPid(info, 4_194_304);
    await expect(
      session.attach(fakeSandbox(info, new PassThrough()))
    ).rejects.toThrow("OMP model relay failed to start");
    await session.close();

    // A temporary directory too deep for a unix socket path.
    const deep = join(directory, "d".repeat(100));
    await mkdir(deep);
    const previous = process.env["TMPDIR"];
    process.env["TMPDIR"] = deep;
    try {
      await expect(
        openOmpModelRelay({ route: route(await closedPortUrl()) })
      ).rejects.toThrow("OMP model relay failed to start");
      return expect(await readdir(deep)).toEqual([]);
    } finally {
      if (previous === undefined) delete process.env["TMPDIR"];
      else process.env["TMPDIR"] = previous;
    }
  });
});
