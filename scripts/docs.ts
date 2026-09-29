import { runDocsCli } from "./docs/cli.ts";
import { nodeDocsFileSystem } from "./docs/system.ts";

process.exitCode = await runDocsCli(
  process.argv.slice(2),
  { files: nodeDocsFileSystem },
  {
    writeOutput: (value) => process.stdout.write(value),
    writeError: (value) => process.stderr.write(value),
  }
);
