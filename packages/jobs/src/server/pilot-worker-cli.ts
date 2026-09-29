import { runPilotWorkerMain } from "./pilot-worker.ts"

try {
  await runPilotWorkerMain()
}
catch {
  process.exitCode = 1
}
