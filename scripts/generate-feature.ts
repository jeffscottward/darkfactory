import { runFeatureGeneratorCli } from "./generate-feature/cli.ts"

process.exitCode = await runFeatureGeneratorCli(process.argv.slice(2), {
  targetRoot: process.cwd(),
  writeOutput: (value) => process.stdout.write(value),
  writeError: (value) => process.stderr.write(value),
})
