// What: the model path for sandboxed OMP runs on Linux. The sandbox has no
// network. For each run the worker starts a relay that allows exactly one
// model, adds the bearer of a local `omp auth-gateway` and forwards to it;
// nsenter places a byte relay on the sandbox's own loopback that leads there.
// Provider keys and OAuth tokens stay with the gateway and its broker, and the
// sandbox holds no secret at all.
// Used by: packages/jobs/src/server/omp.ts (Linux OMP runs) and
// packages/jobs/src/server/model-relay-inbound-cli.ts (the in-namespace relay).
// See: docs/operator.md#models-and-credentials
//
// This module imports only Node built-ins, so nsenter can start its inbound
// relay with plain `node` or `bun` and no build step.

import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { lstat, mkdtemp, readFile, rm } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import {
  type AddressInfo,
  connect,
  createServer as createTcpServer,
  type Socket,
} from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { Readable, Writable } from "node:stream";
import { fileURLToPath } from "node:url";

// The model endpoint on the sandbox's own loopback (its network namespace is
// private, so every run can use the same port).
export const OMP_SANDBOX_MODEL_PORT = 4000;
// OMP sends this in place of a key; the relay replaces it with the gateway bearer.
export const OMP_MODEL_RELAY_API_KEY = "darkfactory-model-relay";
export const DEFAULT_OMP_IMPLEMENT_MODEL = "anthropic/claude-opus-5-5";
export const DEFAULT_OMP_PLAN_MODEL = "openrouter/google/gemini-3.8-flash";
export const NSENTER_EXECUTABLE = "/usr/bin/nsenter";
export const OMP_MODEL_RELAY_SANDBOX_ARGUMENTS = Object.freeze([
  "--info-fd",
  "3",
  "--block-fd",
  "4",
] as const);
export const OMP_MODEL_RELAY_EXTRA_STDIO = 2;

const MAX_RELAY_REQUEST_BYTES = 32 * 1024 * 1024;
const MAX_GATEWAY_TOKEN_BYTES = 4096;
const MAX_SANDBOX_INFO_BYTES = 4096;
const GATEWAY_CHECK_TIMEOUT_MS = 5000;
const RELAY_READY_TIMEOUT_MS = 10_000;
const INBOUND_EXIT_GRACE_MS = 1000;
// How long close() waits for the inbound relay to exit, SIGKILL included. A
// runtime can fail to report a child's exit (Bun 1.3.14 did), and cleanup
// must not hang the worker for it.
const INBOUND_EXIT_TIMEOUT_MS = 5000;
const MODEL_ID =
  /^[a-z0-9][a-z0-9-]{0,63}\/[A-Za-z0-9][A-Za-z0-9._:~-]*(?:\/[A-Za-z0-9][A-Za-z0-9._:~-]*)*$/u;
const MAX_MODEL_ID_BYTES = 256;
// Printable ASCII without spaces, as omp writes its bearer tokens.
const GATEWAY_TOKEN = /^[\u0021-\u007e]{16,1024}$/u;
const LOOPBACK_HOSTS = Object.freeze(["127.0.0.1", "[::1]", "localhost"]);
const INBOUND_ENTRY = fileURLToPath(
  new URL("./model-relay-inbound-cli.ts", import.meta.url)
);

export class OmpModelRelayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OmpModelRelayError";
  }
}

export type OmpModelEffect = "plan" | "implement" | "verify";

export type OmpModelGatewayOptions = Readonly<{
  url: string;
  tokenFile: string;
  implementModel: string;
  planModel: string;
}>;

export type OmpModelRoute = Readonly<{
  gatewayUrl: string;
  token: string;
  modelId: string;
}>;

export const parseOmpModelId = (value: string): string => {
  if (Buffer.byteLength(value) > MAX_MODEL_ID_BYTES || !MODEL_ID.test(value)) {
    throw new OmpModelRelayError("OMP model id is invalid");
  }
  return value;
};

// Only a loopback http origin: the gateway runs on this host, and the relay
// sends it a bearer.
export const parseOmpModelGatewayUrl = (value: string): string => {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new OmpModelRelayError("OMP model gateway URL is invalid");
  }
  if (
    url.protocol !== "http:" ||
    !LOOPBACK_HOSTS.includes(url.hostname) ||
    url.username !== "" ||
    url.password !== "" ||
    url.pathname !== "/" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new OmpModelRelayError("OMP model gateway URL is invalid");
  }
  return url.origin;
};

// Code writing gets the implementation model; planning and review, which
// write no code, get the planning model.
export const ompModelForEffect = (
  gateway: OmpModelGatewayOptions,
  effectKind: OmpModelEffect
): string =>
  effectKind === "implement" ? gateway.implementModel : gateway.planModel;

// OMP reads models.yml from its agent directory (the run's session directory);
// JSON is valid YAML. Only the provider of the allowed model is routed, over
// OMP's pi-native gateway protocol.
export const ompModelsConfigFor = (modelId: string): string => {
  const provider = parseOmpModelId(modelId).slice(0, modelId.indexOf("/"));
  return `${JSON.stringify(
    {
      providers: {
        [provider]: {
          baseUrl: `http://127.0.0.1:${OMP_SANDBOX_MODEL_PORT}`,
          transport: "pi-native",
          apiKey: OMP_MODEL_RELAY_API_KEY,
        },
      },
    },
    null,
    2
  )}\n`;
};

// The bearer stays with the worker: a regular file of the worker's user that
// no one else can read.
export const readOmpModelGatewayToken = async (
  tokenFile: string,
  uid: number | undefined = process.getuid?.()
): Promise<string> => {
  try {
    const metadata = await lstat(tokenFile);
    if (
      !metadata.isFile() ||
      metadata.uid !== uid ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.size === 0 ||
      metadata.size > MAX_GATEWAY_TOKEN_BYTES
    ) {
      throw new Error("unusable token file");
    }
    const token = (await readFile(tokenFile, "utf8")).trim();
    if (!GATEWAY_TOKEN.test(token)) throw new Error("malformed token");
    return token;
  } catch {
    throw new OmpModelRelayError("OMP model gateway token is unavailable");
  }
};

const servesModel = (body: unknown, modelId: string): boolean => {
  if (
    typeof body !== "object" ||
    body === null ||
    !("data" in body) ||
    !Array.isArray(body.data)
  ) {
    throw new Error("malformed model list");
  }
  return body.data.some(
    (entry: unknown) =>
      typeof entry === "object" &&
      entry !== null &&
      "id" in entry &&
      entry.id === modelId
  );
};

// Before each run: the gateway answers, accepts the bearer and serves the model
// this effect may use.
export const requireOmpModelGateway = async (
  input: Readonly<{
    route: OmpModelRoute;
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
  }>
): Promise<void> => {
  const fetchImpl = input.fetchImpl ?? fetch;
  const signal = AbortSignal.timeout(
    input.timeoutMs ?? GATEWAY_CHECK_TIMEOUT_MS
  );
  let served: boolean;
  try {
    const health = await fetchImpl(`${input.route.gatewayUrl}/healthz`, {
      signal,
    });
    await health.body?.cancel();
    if (health.status !== 200) throw new Error("gateway unhealthy");
    const models = await fetchImpl(`${input.route.gatewayUrl}/v1/models`, {
      headers: { authorization: `Bearer ${input.route.token}` },
      signal,
    });
    if (models.status !== 200) throw new Error("model list refused");
    served = servesModel(await models.json(), input.route.modelId);
  } catch {
    throw new OmpModelRelayError("OMP model gateway is unavailable");
  }
  if (!served) {
    throw new OmpModelRelayError(
      "OMP model gateway does not serve the configured model"
    );
  }
};

export type OmpModelRelayServer = Readonly<{
  socketPath: string;
  close: () => Promise<void>;
}>;

const gatewayError = (
  response: ServerResponse,
  status: number,
  message: string
): void => {
  response
    .writeHead(status, {
      "cache-control": "no-store",
      "content-type": "application/json",
    })
    .end(JSON.stringify({ error: { message, type: "model_relay" } }));
};

// An oversized body stops the read without destroying the socket, so the 413
// still reaches the sandbox; the connection then closes.
const readRequestBody = async (
  request: IncomingMessage,
  limit: number
): Promise<Buffer | null> => {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request.iterator({ destroyOnReturn: false })) {
    const buffer = Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > limit) return null;
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
};

// OMP's pi-native client names the model in `modelId`; the gateway would also
// accept `model`, so a body that carries it is refused rather than parsed twice.
const isAllowedModelRequest = (body: Buffer, modelId: string): boolean => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    return false;
  }
  return (
    typeof parsed === "object" &&
    parsed !== null &&
    !Array.isArray(parsed) &&
    "modelId" in parsed &&
    parsed.modelId === modelId &&
    !("model" in parsed)
  );
};

const relayModelRequest = async (
  input: Readonly<{
    request: IncomingMessage;
    response: ServerResponse;
    route: OmpModelRoute;
    maxRequestBytes: number;
    fetchImpl: typeof fetch;
  }>
): Promise<void> => {
  const { request, response, route } = input;
  if (request.method !== "POST" || request.url !== "/v1/pi/stream") {
    request.resume();
    return gatewayError(response, 404, "the model relay serves one model");
  }
  const body = await readRequestBody(request, input.maxRequestBytes);
  if (body === null) {
    response.shouldKeepAlive = false;
    return gatewayError(response, 413, "model request is too large");
  }
  if (!isAllowedModelRequest(body, route.modelId)) {
    return gatewayError(response, 403, "this run may use only its own model");
  }
  const upstreamAbort = new AbortController();
  response.once("close", () => {
    if (!response.writableFinished) upstreamAbort.abort();
  });
  let upstream: Response;
  try {
    upstream = await input.fetchImpl(`${route.gatewayUrl}/v1/pi/stream`, {
      body: new Uint8Array(body),
      headers: {
        accept: "text/event-stream",
        authorization: `Bearer ${route.token}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: upstreamAbort.signal,
    });
  } catch {
    return gatewayError(response, 502, "model gateway is unreachable");
  }
  response.writeHead(upstream.status, {
    "cache-control": "no-store",
    "content-type":
      upstream.headers.get("content-type") ?? "application/octet-stream",
  });
  try {
    for await (const chunk of upstream.body ?? []) {
      if (!response.write(chunk)) {
        await once(response, "drain", { signal: upstreamAbort.signal });
      }
    }
  } catch {
    // The sandbox hung up, or the gateway stream broke: end what was sent.
  }
  response.end();
};

export const startOmpModelRelay = async (
  input: Readonly<{
    socketPath: string;
    route: OmpModelRoute;
    maxRequestBytes?: number;
    fetchImpl?: typeof fetch;
  }>
): Promise<OmpModelRelayServer> => {
  const server = createServer((request, response) => {
    void relayModelRequest({
      fetchImpl: input.fetchImpl ?? fetch,
      maxRequestBytes: input.maxRequestBytes ?? MAX_RELAY_REQUEST_BYTES,
      request,
      response,
      route: input.route,
    }).catch(() => response.destroy());
  });
  server.listen(input.socketPath);
  await once(server, "listening");
  return Object.freeze({
    close: async () => {
      server.closeAllConnections();
      server.close();
      await once(server, "close");
    },
    socketPath: input.socketPath,
  });
};

export type OmpModelRelayInbound = Readonly<{
  port: number;
  close: () => Promise<void>;
}>;

// The byte relay inside the sandbox's network namespace: every connection to
// 127.0.0.1:<port> there is piped to the worker's relay socket, which the
// sandbox cannot see.
export const startOmpModelRelayInbound = async (
  input: Readonly<{ socketPath: string; port: number; host?: string }>
): Promise<OmpModelRelayInbound> => {
  const sockets = new Set<Socket>();
  const track = (socket: Socket): void => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  };
  const server = createTcpServer((client) => {
    const upstream = connect(input.socketPath);
    track(client);
    track(upstream);
    const closeBoth = (): void => {
      client.destroy();
      upstream.destroy();
    };
    client.once("error", closeBoth);
    upstream.once("error", closeBoth);
    client.once("close", closeBoth);
    upstream.once("close", closeBoth);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  server.listen(input.port, input.host ?? "127.0.0.1");
  await once(server, "listening");
  // A TCP listener always reports an AddressInfo once it is listening.
  const address = server.address() as AddressInfo;
  return Object.freeze({
    close: async () => {
      for (const socket of sockets) socket.destroy();
      server.close();
      await once(server, "close");
    },
    port: address.port,
  });
};

// Entry for model-relay-inbound-cli.ts: `<port> <socket>`. It prints "ready"
// once listening and stops when the worker closes its stdin.
export const runOmpModelRelayInboundMain = async (
  argv: readonly string[],
  io: Readonly<{ stdin: Readable; stdout: Writable }>
): Promise<void> => {
  const [portArgument, socketPath] = argv;
  const port = Number(portArgument);
  if (
    argv.length !== 2 ||
    !Number.isSafeInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    socketPath === undefined ||
    !isAbsolute(socketPath)
  ) {
    throw new OmpModelRelayError("model relay arguments are invalid");
  }
  const inbound = await startOmpModelRelayInbound({ port, socketPath });
  const stopped = new Promise<void>((resolve) => {
    io.stdin.once("end", resolve);
    io.stdin.once("close", resolve);
  });
  io.stdin.resume();
  io.stdout.write("ready\n");
  await stopped;
  await inbound.close();
};

// Collects text from a stream until `done` accepts it, the stream ends, or the
// timeout passes. Listeners are removed either way.
const readUntil = <T>(
  stream: Readable,
  emitter: Readonly<{
    once: (event: "exit" | "error", listener: () => void) => unknown;
    off: (event: "exit" | "error", listener: () => void) => unknown;
  }> | null,
  timeoutMs: number,
  done: (text: string) => T | undefined
): Promise<T | undefined> =>
  new Promise<T | undefined>((resolve) => {
    let text = "";
    const finish = (value: T | undefined): void => {
      clearTimeout(timer);
      stream.off("data", onData);
      stream.off("end", onEnd);
      emitter?.off("exit", onEnd);
      emitter?.off("error", onEnd);
      resolve(value);
    };
    const onData = (chunk: Buffer | string): void => {
      text += Buffer.from(chunk).toString("utf8");
      const value = done(text);
      if (value !== undefined || text.length > MAX_SANDBOX_INFO_BYTES) {
        finish(value);
      }
    };
    const onEnd = (): void => finish(undefined);
    const timer = setTimeout(onEnd, timeoutMs);
    stream.on("data", onData);
    stream.once("end", onEnd);
    emitter?.once("exit", onEnd);
    emitter?.once("error", onEnd);
  });

// bwrap writes {"child-pid": N} to --info-fd once the sandbox exists.
const childPidIn = (text: string): number | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return undefined;
  }
  return typeof parsed === "object" &&
    parsed !== null &&
    "child-pid" in parsed &&
    typeof parsed["child-pid"] === "number" &&
    Number.isSafeInteger(parsed["child-pid"]) &&
    parsed["child-pid"] > 0
    ? parsed["child-pid"]
    : -1;
};

const sandboxPid = async (
  info: Readable,
  timeoutMs: number
): Promise<number> => {
  const pid = await readUntil(info, null, timeoutMs, childPidIn);
  if (pid === undefined || pid < 0) {
    throw new OmpModelRelayError("OMP sandbox did not report its process");
  }
  return pid;
};

const inboundReady = async (
  inbound: ChildProcess,
  timeoutMs: number
): Promise<void> => {
  const ready =
    inbound.stdout === null
      ? undefined
      : await readUntil(inbound.stdout, inbound, timeoutMs, (text) =>
          text.includes("ready\n") ? true : undefined
        );
  if (ready === undefined) {
    throw new OmpModelRelayError("OMP model relay failed to start");
  }
};

// The sandbox must be started with OMP_MODEL_RELAY_SANDBOX_ARGUMENTS and
// OMP_MODEL_RELAY_EXTRA_STDIO extra pipes (fd 3 and 4).
export type OmpModelRelaySession = Readonly<{
  attach: (child: ChildProcess) => Promise<void>;
  close: () => Promise<void>;
}>;

// One run's relay. bwrap starts paused (--block-fd); attach() reads the
// sandbox's process id from --info-fd, starts the inbound relay in its network
// namespace, waits until it listens and only then lets OMP start.
export const openOmpModelRelay = async (
  input: Readonly<{
    route: OmpModelRoute;
    nsenterExecutable?: string;
    runtimeExecutable?: string;
    inboundEntry?: string;
    readyTimeoutMs?: number;
    exitTimeoutMs?: number;
    spawnImpl?: typeof spawn;
  }>
): Promise<OmpModelRelaySession> => {
  // mkdtemp creates the directory 0700: only the worker can reach the socket.
  const directory = await mkdtemp(join(tmpdir(), "darkfactory-model-relay-"));
  const socketPath = join(directory, "relay.sock");
  let server: OmpModelRelayServer;
  try {
    server = await startOmpModelRelay({
      route: input.route,
      socketPath,
    });
  } catch {
    await rm(directory, { force: true, recursive: true });
    throw new OmpModelRelayError("OMP model relay failed to start");
  }
  const spawnImpl = input.spawnImpl ?? spawn;
  const readyTimeoutMs = input.readyTimeoutMs ?? RELAY_READY_TIMEOUT_MS;
  let inbound: ChildProcess | undefined;
  let inboundExited: Promise<void> = Promise.resolve();
  const attach = async (child: ChildProcess): Promise<void> => {
    const info = child.stdio[3];
    const block = child.stdio[4];
    if (!(info instanceof Readable && block instanceof Writable)) {
      throw new OmpModelRelayError("OMP sandbox did not report its process");
    }
    const pid = await sandboxPid(info, readyTimeoutMs);
    const started: ChildProcess = spawnImpl(
      input.nsenterExecutable ?? NSENTER_EXECUTABLE,
      [
        "--user",
        "--net",
        "--preserve-credentials",
        `--target=${pid}`,
        "--",
        input.runtimeExecutable ?? process.execPath,
        input.inboundEntry ?? INBOUND_ENTRY,
        String(OMP_SANDBOX_MODEL_PORT),
        socketPath,
      ],
      {
        env: { NODE_ENV: "production", NO_COLOR: "1", PATH: "/usr/bin:/bin" },
        stdio: ["pipe", "pipe", "ignore"],
      }
    );
    inbound = started;
    inboundExited = new Promise<void>((resolve) => {
      started.once("exit", () => resolve());
      started.once("error", () => resolve());
    });
    await inboundReady(started, readyTimeoutMs);
    block.end("1");
  };
  // Closing its stdin stops the inbound relay; SIGKILL follows a grace period.
  // The wait for its exit is bounded, so a lost exit cannot hang the worker.
  const close = async (): Promise<void> => {
    const running = inbound;
    if (running !== undefined) {
      running.stdin?.end();
      const kill = setTimeout(
        () => running.kill("SIGKILL"),
        INBOUND_EXIT_GRACE_MS
      );
      let stopWaiting: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        inboundExited,
        new Promise<void>((resolve) => {
          stopWaiting = setTimeout(
            resolve,
            input.exitTimeoutMs ?? INBOUND_EXIT_TIMEOUT_MS
          );
        }),
      ]);
      clearTimeout(kill);
      clearTimeout(stopWaiting);
    }
    await server.close();
    await rm(directory, { force: true, recursive: true });
  };
  return Object.freeze({ attach, close });
};
