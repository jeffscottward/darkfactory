import { runDoctorCli } from "./doctor/cli.ts"
import { nodeDoctorDependencies } from "./doctor/system.ts"

process.exitCode = await runDoctorCli(process.argv.slice(2), {
  doctor: nodeDoctorDependencies(),
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
})
