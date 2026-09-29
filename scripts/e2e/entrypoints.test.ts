import { afterEach, describe, expect, it, vi } from "vitest"

const originalArguments = [...process.argv]
const originalExitCode = process.exitCode

afterEach(() => {
  process.argv = [...originalArguments]
  process.exitCode = originalExitCode
  vi.restoreAllMocks()
  vi.doUnmock("./cli.ts")
  return vi.resetModules()
}
)

describe("E2E executable wrappers", () => {
  it("forwards journey arguments, cwd, streams, and exit status", async () => {
    const runJourneyCli = vi.fn(async (
      arguments_: readonly string[],
      repositoryPath: string,
      streams: Readonly<{
        writeOutput: (value: string) => void
        writeError: (value: string) => void
      }>,
    ) => {
      expect(arguments_).toEqual(["e2e", "--grep", "account"])
      expect(repositoryPath).toBe("/workspace")
      streams.writeOutput("journey-output\n")
      streams.writeError("journey-error\n")
      return 7
    }
    )
    vi.doMock("./cli.ts", () => ({ runJourneyCli }))
    process.argv = ["node", "run.ts", "e2e", "--grep", "account"]
    vi.spyOn(process, "cwd").mockReturnValue("/workspace")
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    await import("./run.ts")

    expect(runJourneyCli).toHaveBeenCalledOnce()
    expect(stdout).toHaveBeenCalledWith("journey-output\n")
    expect(stderr.mock.calls.map(([value]) => value)).toEqual([
      '{"kind":"darkfactory-e2e-entry","version":1}\n',
      "journey-error\n",
    ])
    return expect(process.exitCode).toBe(7)
  }
  )

  it("forwards artifact scanner arguments, cwd, streams, and exit status", async () => {
    const runArtifactScannerCli = vi.fn(async (
      arguments_: readonly string[],
      repositoryPath: string,
      streams: Readonly<{
        writeOutput: (value: string) => void
        writeError: (value: string) => void
      }>,
    ) => {
      expect(arguments_).toEqual([
        "--run-id",
        "owned_run",
        "--ownership",
        "proof",
      ])
      expect(repositoryPath).toBe("/repository")
      streams.writeOutput("scanner-output\n")
      streams.writeError("scanner-error\n")
      return 1
    }
    )
    vi.doMock("./cli.ts", () => ({ runArtifactScannerCli }))
    process.argv = [
      "node",
      "scan-artifacts.ts",
      "--run-id",
      "owned_run",
      "--ownership",
      "proof",
    ]
    vi.spyOn(process, "cwd").mockReturnValue("/repository")
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    await import("./scan-artifacts.ts")

    expect(runArtifactScannerCli).toHaveBeenCalledOnce()
    expect(stdout).toHaveBeenCalledWith("scanner-output\n")
    expect(stderr).toHaveBeenCalledWith("scanner-error\n")
    return expect(process.exitCode).toBe(1)
  }
  )

  it("surfaces journey CLI failures without swallowing their error", async () => {
    const failure = new Error("journey CLI failed")
    const runJourneyCli = vi.fn(async () => {
      throw failure
    }
    )
    vi.doMock("./cli.ts", () => ({ runJourneyCli }))
    process.argv = ["node", "run.ts", "a11y"]
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true)

    await expect(import("./run.ts")).rejects.toBe(failure)

    expect(runJourneyCli).toHaveBeenCalledOnce()
    return expect(stderr).toHaveBeenCalledWith(
      '{"kind":"darkfactory-e2e-entry","version":1}\n',
    )
  }
  )

  return it("surfaces artifact scanner CLI failures without swallowing their error", async () => {
    const failure = new Error("artifact scanner CLI failed")
    const runArtifactScannerCli = vi.fn(async () => {
      throw failure
    }
    )
    vi.doMock("./cli.ts", () => ({ runArtifactScannerCli }))
    process.argv = ["node", "scan-artifacts.ts", "--run-id", "owned_run"]

    await expect(import("./scan-artifacts.ts")).rejects.toBe(failure)

    return expect(runArtifactScannerCli).toHaveBeenCalledOnce()
  }
  )
}
)
