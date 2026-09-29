import { runPrePush } from "./index.ts"

process.exitCode = runPrePush(process.argv.slice(2))
