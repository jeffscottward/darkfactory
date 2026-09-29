import { runDevServer, spawnInherited } from "./dev/serve.ts";

process.exitCode = await runDevServer(process.argv.slice(2), {
  environment: process.env,
  spawn: spawnInherited,
  onSignal: (signal, handler) => process.on(signal, handler),
  writeError: (value) => process.stderr.write(value),
});
