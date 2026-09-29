export const CAPACITY_RETRY_MAX_ATTEMPTS = 3;
export const CAPACITY_RETRY_DELAY_MS = 1000;

type Transport = (request: Request) => Promise<Response>;

/** Own data property only: hostile getters or proxies on error objects must not run. */
export const ownErrorData = (error: unknown, key: string): unknown => {
  if (typeof error !== "object" || error === null) return undefined;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(error, key);
    return descriptor !== undefined && Object.hasOwn(descriptor, "value")
      ? descriptor.value
      : undefined;
  } catch {
    return undefined;
  }
};

/** Exactly the response of packages/db/src/server/request-scope.ts#requestDatabaseCapacityResponse. */
export const isCapacityResponse = (response: Response): boolean =>
  response.status === 503 && response.headers.get("retry-after") === "1";

const waitForCapacity = (signal: AbortSignal): Promise<boolean> =>
  new Promise((resolve) => {
    signal.throwIfAborted();
    const finish = () => {
      clearTimeout(timeout);
      signal.removeEventListener("abort", finish);
      resolve(!signal.aborted);
    };
    const timeout = setTimeout(finish, CAPACITY_RETRY_DELAY_MS);
    signal.addEventListener("abort", finish, { once: true });
  });

/**
 * The one bounded policy for in-process oRPC reads that hit the isolate DB cap
 * (packages/db/src/server/client.ts#RequestDatabaseCapacityError): retry only
 * when the raw transport response was the exact capacity 503 AND the client
 * decoded it as an undeclared SERVICE_UNAVAILABLE; at most three attempts,
 * one second apart, abandoned as soon as `signal` aborts. Any other failure,
 * and the last capacity failure, is rethrown so callers stay fail-closed.
 *
 * `operation` receives the transport to hand to its API client, so the
 * policy observes the raw response of each attempt.
 */
export const retryOnCapacity = async <Result>(
  transport: Transport,
  signal: AbortSignal,
  operation: (observedTransport: Transport) => Promise<Result>
): Promise<Result> => {
  let capacityResponse = false;
  const observedTransport: Transport = async (request) => {
    const response = await transport(request);
    capacityResponse = isCapacityResponse(response);
    return response;
  };
  for (let attempt = 1; ; attempt += 1) {
    capacityResponse = false;
    try {
      signal.throwIfAborted();
      const result = await operation(observedTransport);
      signal.throwIfAborted();
      return result;
    } catch (error) {
      const isCapacityFailure =
        capacityResponse &&
        ownErrorData(error, "defined") === false &&
        ownErrorData(error, "code") === "SERVICE_UNAVAILABLE" &&
        ownErrorData(error, "status") === 503;
      if (attempt === CAPACITY_RETRY_MAX_ATTEMPTS || !isCapacityFailure) {
        throw error;
      }
      if (!(await waitForCapacity(signal))) throw error;
    }
  }
};
