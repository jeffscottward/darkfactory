import { loadCapabilityManifest } from "../packages/config/src/server/capabilities.ts";
import { runCapabilityCli } from "./capability/cli.ts";
import { nodeCapabilityFileSystem } from "./capability/system.ts";

process.exitCode = await runCapabilityCli(
  process.argv.slice(2),
  {
    files: nodeCapabilityFileSystem,
    validateManifest: (source) => {
      return loadCapabilityManifest(source);
    },
  },
  {
    writeOutput: (value) => process.stdout.write(value),
    writeError: (value) => process.stderr.write(value),
  }
);
