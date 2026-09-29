import { runSetup } from "./setup/setup.ts";
import { nodeSetupDependencies } from "./setup/system.ts";

process.exitCode = await runSetup(
  process.argv.slice(2),
  nodeSetupDependencies()
);
