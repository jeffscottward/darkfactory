import type { ChildProcess } from "node:child_process";

import {
  assertOwnedE2ERunRootsReady,
  type E2ELifecycleState,
  e2eRunPathsFromEnvironment,
  readOwnedE2ELifecycleState,
} from "./run-artifacts.ts";

const DEFAULT_POLL_INTERVAL_MILLIS = 100;
export const E2E_SERVER_READY_TIMEOUT_MILLIS = 120_000;
const E2E_READINESS_PATHS = ["/", "/sign-in", "/api/auth/get-session"] as const;
const MAX_READINESS_BODY_BYTES = 1_048_576;
const READINESS_REQUEST_TIMEOUT_MILLIS = 60_000;
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

const cancelResponseBody = (response: Response): void => {
  if (response.body === null || response.body.locked) {
    return;
  }
  response.body.cancel().catch(() => undefined);
};

const acceptAndCancelResponseBody = (
  response: Response,
  maxBodyBytes: number
): boolean => {
  const declaredLength = response.headers.get("content-length");
  const acceptable =
    declaredLength === null ||
    !/^\d+$/u.test(declaredLength) ||
    Number(declaredLength) <= maxBodyBytes;
  cancelResponseBody(response);
  return acceptable;
};

export type E2EReadinessProbeContext = Readonly<{
  deadlineMillis: number;
  remainingMillis: number;
  signal: AbortSignal;
}>;

export const probeE2EServerRoutes = async ({
  appUrl,
  deadlineMillis,
  fetchImplementation = fetch,
  maxBodyBytes = MAX_READINESS_BODY_BYTES,
  now = Date.now,
  requestTimeoutMillis = READINESS_REQUEST_TIMEOUT_MILLIS,
  signal,
}: {
  readonly appUrl: string;
  readonly deadlineMillis?: number;
  readonly fetchImplementation?: typeof fetch;
  readonly maxBodyBytes?: number;
  readonly now?: () => number;
  readonly requestTimeoutMillis?: number;
  readonly signal?: AbortSignal;
}): Promise<boolean> => {
  if (
    !Number.isSafeInteger(requestTimeoutMillis) ||
    requestTimeoutMillis < 1 ||
    requestTimeoutMillis > E2E_SERVER_READY_TIMEOUT_MILLIS ||
    !Number.isSafeInteger(maxBodyBytes) ||
    maxBodyBytes < 1 ||
    (deadlineMillis !== undefined && !Number.isFinite(deadlineMillis))
  ) {
    return false;
  }
  try {
    const origin = new URL(appUrl).origin;
    for (const path of E2E_READINESS_PATHS) {
      const url = new URL(path, origin);
      if (url.origin !== origin || url.pathname !== path) {
        return false;
      }
      const remainingMillis =
        deadlineMillis === undefined
          ? requestTimeoutMillis
          : deadlineMillis - now();
      if (remainingMillis <= 0) {
        return false;
      }
      const controller = new AbortController();
      const abortRequest = (): void => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abortRequest, { once: true });
      if (signal?.aborted === true) {
        abortRequest();
      }
      const timeout = setTimeout(
        () => controller.abort(),
        Math.min(requestTimeoutMillis, remainingMillis)
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
          cancelResponseBody(response);
          return false;
        }
        if (!acceptAndCancelResponseBody(response, maxBodyBytes)) {
          return false;
        }
        if (deadlineMillis !== undefined && now() >= deadlineMillis) {
          return false;
        }
      } catch {
        if (response !== undefined) {
          cancelResponseBody(response);
        }
        return false;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", abortRequest);
      }
    }
    return deadlineMillis === undefined || now() < deadlineMillis;
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

export const waitForE2ELifecycleReady = async ({
  now = Date.now,
  pollIntervalMillis = DEFAULT_POLL_INTERVAL_MILLIS,
  readState,
  timeoutMillis = E2E_SERVER_READY_TIMEOUT_MILLIS,
  wait = pause,
}: {
  readonly now?: () => number;
  readonly pollIntervalMillis?: number;
  readonly readState: () => Promise<E2ELifecycleState | undefined>;
  readonly timeoutMillis?: number;
  readonly wait?: (milliseconds: number) => Promise<void>;
}): Promise<void> => {
  if (
    !Number.isSafeInteger(timeoutMillis) ||
    timeoutMillis < 1 ||
    timeoutMillis > E2E_SERVER_READY_TIMEOUT_MILLIS ||
    !Number.isSafeInteger(pollIntervalMillis) ||
    pollIntervalMillis < 1 ||
    pollIntervalMillis > timeoutMillis
  ) {
    throw new RangeError("E2E lifecycle readiness budget is invalid.");
  }
  const deadline = now() + timeoutMillis;
  while (now() < deadline) {
    const state = await readState();
    if (state?.status === "ready" && state.stage === "server-ready") {
      return;
    }
    if (state !== undefined && state.status !== "starting") {
      throw new Error(
        `E2E lifecycle ended before readiness (${state.status}/${state.stage}).`
      );
    }
    const remainingMillis = deadline - now();
    if (remainingMillis > 0) {
      await wait(Math.min(pollIntervalMillis, remainingMillis));
    }
  }
  throw new Error("E2E lifecycle readiness timed out.");
};

export const waitForCanonicalE2ELifecycleReady = async (): Promise<void> => {
  const paths = e2eRunPathsFromEnvironment();
  const adoption = Reflect.get(process.env, "E2E_RUN_ADOPTION") as
    | string
    | undefined;
  const adopted = await assertOwnedE2ERunRootsReady(paths, adoption);
  if (!adopted) {
    throw new Error(
      "Canonical E2E lifecycle readiness requires adoption proof."
    );
  }
  await waitForE2ELifecycleReady({
    readState: async () => await readOwnedE2ELifecycleState(paths),
  });
};

export default waitForCanonicalE2ELifecycleReady;

export const waitForE2EServerReady = async ({
  child,
  consecutiveSuccessfulProbes = 1,
  onReady,
  probe,
  pollIntervalMillis = DEFAULT_POLL_INTERVAL_MILLIS,
  timeoutMillis = E2E_SERVER_READY_TIMEOUT_MILLIS,
  now = Date.now,
  signal,
  wait = pause,
}: {
  readonly child: ChildProcess;
  readonly consecutiveSuccessfulProbes?: number;
  readonly onReady?: (context: E2EReadinessProbeContext) => Promise<void>;
  readonly probe: (context: E2EReadinessProbeContext) => Promise<boolean>;
  readonly pollIntervalMillis?: number;
  readonly timeoutMillis?: number;
  readonly now?: () => number;
  readonly signal?: AbortSignal;
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
  const probeController = new AbortController();
  const { promise: interrupted, reject: rejectInterruption } =
    createPromiseResolvers<never>();
  const interrupt = (error: Error): void => {
    probeController.abort(error);
    rejectInterruption(error);
  };
  const onAbort = (): void =>
    interrupt(new Error("E2E server readiness was aborted."));
  const onError = (): void =>
    interrupt(new Error("E2E server failed before readiness."));
  const onExit = (): void =>
    interrupt(new Error("E2E server exited before readiness."));
  signal?.addEventListener("abort", onAbort, { once: true });
  child.once("error", onError);
  child.once("exit", onExit);
  const deadlineTimeout = setTimeout(
    () => interrupt(new Error("E2E server readiness timed out.")),
    timeoutMillis
  );
  if (signal?.aborted === true) {
    onAbort();
  }
  let successfulProbes = 0;
  try {
    while (now() < deadline) {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error("E2E server exited before readiness.");
      }
      const probeStartedAt = now();
      const probeOperation = probe({
        deadlineMillis: deadline,
        remainingMillis: deadline - probeStartedAt,
        signal: probeController.signal,
      });
      let ready: boolean;
      try {
        ready = await Promise.race([probeOperation, interrupted]);
      } catch (error) {
        probeController.abort(error);
        await probeOperation.catch(() => undefined);
        throw error;
      }
      if (now() >= deadline) {
        throw new Error("E2E server readiness timed out.");
      }
      successfulProbes = ready ? successfulProbes + 1 : 0;
      if (successfulProbes >= consecutiveSuccessfulProbes) {
        if (child.exitCode !== null || child.signalCode !== null) {
          throw new Error("E2E server exited before readiness.");
        }
        const commitStartedAt = now();
        const readinessCommit =
          onReady?.({
            deadlineMillis: deadline,
            remainingMillis: deadline - commitStartedAt,
            signal: probeController.signal,
          }) ?? Promise.resolve();
        try {
          await Promise.race([readinessCommit, interrupted]);
        } catch (error) {
          probeController.abort(error);
          await readinessCommit.catch(() => undefined);
          throw error;
        }
        return;
      }
      const nextRemaining = deadline - now();
      if (nextRemaining > 0) {
        await Promise.race([
          wait(Math.min(pollIntervalMillis, nextRemaining)),
          interrupted,
        ]);
      }
    }
    throw new Error("E2E server readiness timed out.");
  } finally {
    clearTimeout(deadlineTimeout);
    probeController.abort();
    signal?.removeEventListener("abort", onAbort);
    child.off("error", onError);
    child.off("exit", onExit);
  }
};
