import { runGraphCli } from "./graph/cli.ts";
import { nodeGraphFileSystem, nodeGraphProcess } from "./graph/system.ts";

process.exitCode = await runGraphCli(process.argv.slice(2), {
  graph: {
    files: nodeGraphFileSystem,
    process: nodeGraphProcess,
  },
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
});
