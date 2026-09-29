import { runProductionWebDatabaseCheck } from "./deployment/database.ts"

process.exitCode = runProductionWebDatabaseCheck(
  process.env,
  process.stdout,
  process.stderr,
)
