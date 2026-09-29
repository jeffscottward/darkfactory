import { runWorkerBindingsCli } from "./dev/bindings.ts";

process.exitCode = await runWorkerBindingsCli(process.argv.slice(2), {
  repositoryPath: process.cwd(),
  environment: process.env,
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
});
