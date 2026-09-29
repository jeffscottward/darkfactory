import { runWithTestEnvironment, spawnInherited } from "./lib/test-env.ts";

process.exitCode = await runWithTestEnvironment(process.argv.slice(2), {
  env: process.env,
  spawn: spawnInherited,
  error: (line) => process.stderr.write(`${line}\n`),
});
