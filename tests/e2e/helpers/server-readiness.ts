import type { ChildProcess } from "node:child_process";

const DEFAULT_POLL_INTERVAL_MILLIS = 100;
export const E2E_SERVER_READY_TIMEOUT_MILLIS = 120_000;
const E2E_READINESS_PATHS = ["/", "/sign-in", "/api/auth/get-session"] as const;
const MAX_READINESS_BODY_BYTES = 1_048_576;
const READINESS_REQUEST_TIMEOUT_MILLIS = 2000;
export type PromiseResolvers<Value> = Readonly<{
  promise: Promise<Value>;
  reject: (reason?: unknown) => void;
  resolve: (value: Value | PromiseLike<Value>) => void;
}>;
type PromiseConstructorWithResolvers = PromiseConstructor & {
  withResolvers: <Value>() => PromiseResolvers<Value>;
};
export const createPromiseResolvers = <Value>(): PromiseResolvers<Value> =>
  (Promise as PromiseConstructorWithResolvers).withResolvers<Value>();

const pause = (milliseconds: number): Promise<void> => {
  const { promise, resolve } = createPromiseResolvers<void>();
  setTimeout(resolve, milliseconds);
  return promise;
};

const cancelResponseBody = async (response: Response): Promise<void> => {
  if (response.body === null || response.body.locked) {
    return;
  }
  await response.body.cancel().catch(() => undefined);
};

const hasBoundedBody = async (
  response: Response,
  maxBodyBytes: number
): Promise<boolean> => {
  const declaredLength = response.headers.get("content-length");
  if (
    declaredLength !== null &&
    /^\d+$/u.test(declaredLength) &&
    Number(declaredLength) > maxBodyBytes
  ) {
    await cancelResponseBody(response);
    return false;
  }
  if (response.body === null) {
    return true;
  }

  const reader = response.body.getReader();
  let received = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) {
        return true;
      }
      received += chunk.value.byteLength;
      if (received > maxBodyBytes) {
        await reader.cancel();
        return false;
      }
    }
  } finally {
    reader.releaseLock();
  }
};

export const probeE2EServerRoutes = async ({
  appUrl,
  fetchImplementation = fetch,
  maxBodyBytes = MAX_READINESS_BODY_BYTES,
  requestTimeoutMillis = READINESS_REQUEST_TIMEOUT_MILLIS,
}: {
  readonly appUrl: string;
  readonly fetchImplementation?: typeof fetch;
  readonly maxBodyBytes?: number;
  readonly requestTimeoutMillis?: number;
}): Promise<boolean> => {
  const origin = new URL(appUrl).origin;
  try {
    for (const path of E2E_READINESS_PATHS) {
      const url = new URL(path, origin);
      if (url.origin !== origin || url.pathname !== path) {
        return false;
      }
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        requestTimeoutMillis
      );
      let response: Response | undefined;
      try {
        response = await fetchImplementation(url, {
          credentials: "omit",
          method: "GET",
          redirect: "manual",
          signal: controller.signal,
        });
        if (response.status !== 200) {
          await cancelResponseBody(response);
          return false;
        }
        if (!(await hasBoundedBody(response, maxBodyBytes))) {
          return false;
        }
      } catch {
        if (response !== undefined) {
          await cancelResponseBody(response);
        }
        return false;
      } finally {
        clearTimeout(timeout);
      }
    }
    return true;
  } catch {
    return false;
  }
};

export type E2EServerExitState = Readonly<{
  exitCode: number | null;
  signal: NodeJS.Signals | null;
}>;

export type E2EServerExitStatus =
  | "startup-failed"
  | "runtime-failed"
  | "stopped";

export const classifyE2EServerExit = ({
  intentional,
  ready,
  state,
}: {
  readonly intentional: boolean;
  readonly ready: boolean;
  readonly state: E2EServerExitState;
}): E2EServerExitStatus => {
  if (
    intentional &&
    (state.exitCode === 0 ||
      state.signal === "SIGINT" ||
      state.signal === "SIGTERM")
  ) {
    return "stopped";
  }
  return ready ? "runtime-failed" : "startup-failed";
};

export const waitForE2EServerReady = async ({
  child,
  consecutiveSuccessfulProbes = 1,
  onReady,
  probe,
  pollIntervalMillis = DEFAULT_POLL_INTERVAL_MILLIS,
  timeoutMillis = E2E_SERVER_READY_TIMEOUT_MILLIS,
  now = Date.now,
  wait = pause,
}: {
  readonly child: ChildProcess;
  readonly consecutiveSuccessfulProbes?: number;
  readonly onReady?: () => Promise<void>;
  readonly probe: () => Promise<boolean>;
  readonly pollIntervalMillis?: number;
  readonly timeoutMillis?: number;
  readonly now?: () => number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}): Promise<void> => {
  if (
    !Number.isSafeInteger(timeoutMillis) ||
    timeoutMillis < 1 ||
    timeoutMillis > E2E_SERVER_READY_TIMEOUT_MILLIS ||
    !Number.isSafeInteger(pollIntervalMillis) ||
    pollIntervalMillis < 1 ||
    pollIntervalMillis > timeoutMillis ||
    !Number.isSafeInteger(consecutiveSuccessfulProbes) ||
    consecutiveSuccessfulProbes < 1 ||
    consecutiveSuccessfulProbes > 10
  ) {
    throw new RangeError("E2E server readiness budget is invalid.");
  }
  const deadline = now() + timeoutMillis;
  const { promise: exited, reject: rejectExit } =
    createPromiseResolvers<never>();
  const onError = (): void =>
    rejectExit(new Error("E2E server failed before readiness."));
  const onExit = (): void =>
    rejectExit(new Error("E2E server exited before readiness."));
  child.once("error", onError);
  child.once("exit", onExit);
  let successfulProbes = 0;
  try {
    while (now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("E2E server exited before readiness.");
      }
      const ready = await Promise.race([probe(), exited]);
      successfulProbes = ready ? successfulProbes + 1 : 0;
      if (successfulProbes >= consecutiveSuccessfulProbes) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error("E2E server exited before readiness.");
        }
        await onReady?.();
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error("E2E server exited before readiness.");
        }
        return;
      }
      const nextRemaining = deadline - now();
      if (nextRemaining > 0) {
        await Promise.race([
          wait(Math.min(pollIntervalMillis, nextRemaining)),
          exited,
        ]);
      }
    }
    throw new Error("E2E server readiness timed out.");
  } finally {
    child.off("error", onError);
    child.off("exit", onExit);
  }
};
