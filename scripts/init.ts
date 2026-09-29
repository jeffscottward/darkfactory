import { runInit } from "./init/apply.ts";
import { nodeInitDependencies } from "./init/system.ts";

process.exitCode = await runInit(
  process.argv.slice(2),
  nodeInitDependencies(process.cwd())
);
