import {
  PilotWorkerConfigurationError,
  runPilotWorkerMain,
} from "./pilot-worker.ts";

// Configuration errors name the key, never its value, so they are printed.
// Other errors may carry connection details, so only their type is shown.
try {
  await runPilotWorkerMain();
} catch (error) {
  process.stderr.write(
    error instanceof PilotWorkerConfigurationError
      ? `pilot worker: ${error.message}\n`
      : `pilot worker failed to start (${error instanceof Error ? error.name : "unknown error"}); see docs/debugging.md\n`
  );
  process.exitCode = 1;
}
