// What: the byte relay that nsenter starts inside an OMP sandbox's network
// namespace (see model-relay.ts#openOmpModelRelay). Arguments: <port> <socket>.
import { runOmpModelRelayInboundMain } from "./model-relay.ts";

try {
  await runOmpModelRelayInboundMain(process.argv.slice(2), {
    stdin: process.stdin,
    stdout: process.stdout,
  });
} catch (error) {
  process.stderr.write(
    `model relay: ${error instanceof Error ? error.message : "failed"}\n`
  );
  process.exitCode = 1;
}
