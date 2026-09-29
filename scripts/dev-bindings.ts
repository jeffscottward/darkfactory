import { EnvironmentValidationError } from "@darkfactory/config/server";
import {
  materializeWorkerBindings,
  type WorkerBindingsTarget,
  workerBindingsTargetPath,
} from "./dev/bindings.ts";

const [candidate, ...extra] = process.argv.slice(2);
const isValidTarget = candidate === undefined || candidate === "operator";
if (!isValidTarget || extra.length > 0) {
  process.stderr.write("Usage: dev-bindings [operator]\n");
  process.exitCode = 2;
} else {
  const target: WorkerBindingsTarget =
    candidate === "operator" ? "operator" : "web";
  try {
    await materializeWorkerBindings(process.cwd(), target);
    process.stdout.write(
      `${JSON.stringify({
        action: target === "operator" ? "operator:bindings" : "dev:bindings",
        ok: true,
        target: workerBindingsTargetPath(target),
        mode: "0600",
      })}\n`
    );
  } catch (error) {
    // Validation issues name variables and rules, never values.
    process.stderr.write(
      error instanceof EnvironmentValidationError
        ? `${error.message}\nFix .env (or run bun run setup) and retry.\n`
        : "Unable to materialize validated Worker bindings safely.\n"
    );
    process.exitCode = 1;
  }
}
