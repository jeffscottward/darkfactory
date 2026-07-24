export class LifecycleShutdownRequestedError extends Error {
  constructor() {
    super("Lifecycle shutdown requested.");
    this.name = "LifecycleShutdownRequestedError";
  }
}

export type LifecycleOutcome = Readonly<{
  cleanupError?: unknown;
  exitCode: number;
  startupError?: unknown;
}>;

export type LifecycleControl = Readonly<{
  checkpoint: () => void;
  requestShutdown: (exitCode: number) => Promise<LifecycleOutcome>;
}>;

export const createSerializedLifecycle = ({
  cleanup,
  startup,
}: {
  readonly cleanup: () => Promise<void>;
  readonly startup: (control: LifecycleControl) => Promise<void>;
}): Readonly<{
  completion: Promise<LifecycleOutcome>;
  control: LifecycleControl;
  startup: Promise<void>;
}> => {
  let shutdownRequested = false;
  let finalization: Promise<LifecycleOutcome> | undefined;
  let resolveCompletion: (outcome: LifecycleOutcome) => void = () => undefined;
  const completion = new Promise<LifecycleOutcome>((resolve) => {
    resolveCompletion = resolve;
  });
  let startupPromise: Promise<void>;

  const checkpoint = (): void => {
    if (shutdownRequested) {
      throw new LifecycleShutdownRequestedError();
    }
  };
  const requestShutdown = (exitCode: number): Promise<LifecycleOutcome> => {
    shutdownRequested = true;
    finalization ??= (async () => {
      let startupError: unknown;
      try {
        await startupPromise;
      } catch (error) {
        startupError = error;
      }

      let cleanupError: unknown;
      try {
        await cleanup();
      } catch (error) {
        cleanupError = error;
      }

      const outcome: LifecycleOutcome = Object.freeze({
        ...(cleanupError === undefined ? {} : { cleanupError }),
        exitCode,
        ...(startupError === undefined ? {} : { startupError }),
      });
      resolveCompletion(outcome);
      return outcome;
    })();
    return finalization;
  };
  const control = Object.freeze({ checkpoint, requestShutdown });
  startupPromise = Promise.resolve().then(() => startup(control));
  // biome-ignore lint/complexity/noVoid: Shutdown owns and observes this bounded startup rejection.
  void startupPromise.catch(() => requestShutdown(1));

  return Object.freeze({ completion, control, startup: startupPromise });
};
