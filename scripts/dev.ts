import { spawn } from "node:child_process";
import { runDevServer } from "./dev/serve.ts";

process.exitCode = await runDevServer(process.argv.slice(2), {
  environment: process.env,
  spawn: (command, arguments_) => {
    const child = spawn(command, arguments_, { stdio: "inherit" });
    const exited = Promise.withResolvers<number | null>();
    child.once("error", () => exited.resolve(1));
    child.once("exit", exited.resolve);
    return { kill: (signal) => child.kill(signal), exited: exited.promise };
  },
  onSignal: (signal, handler) => process.on(signal, handler),
  writeError: (value) => process.stderr.write(value),
});
