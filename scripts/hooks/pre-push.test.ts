import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

it("preserves destination argv through the executable shell hook", async () => {
  const directory = mkdtempSync(join(tmpdir(), "pre-push-argv-"))
  const executable = join(directory, "bun")
  const childProcess = await vi.importActual<typeof import("node:child_process")>("node:child_process")
  try {
    writeFileSync(executable, "#!/bin/sh\nprintf '%s\\n' \"$@\"\n")
    chmodSync(executable, 0o755)
    const destination = "/tmp/repository with spaces.git"
    const invocation = childProcess.spawnSync("/bin/sh", [".husky/pre-push", "review", destination], {
      encoding: "utf8",
      env: { ...process.env, PATH: directory },
      shell: false,
    })
    expect(invocation.status).toBe(0)
    return expect(invocation.stdout.trimEnd().split("\n")).toEqual([
      "--preload", "@danielx/civet/bun-civet", "scripts/hooks/pre-push.ts", "review", destination,
    ])
  }
  finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
)

const mocks = vi.hoisted(() => ({
  spawnSync: vi.fn(),
  readFileSync: vi.fn(),
  readSync: vi.fn(),
}))

vi.mock("node:child_process", () => ({ spawnSync: mocks.spawnSync }))
vi.mock("node:fs", async (importOriginal) => ({
  ...await importOriginal<typeof import("node:fs")>(),
  readFileSync: mocks.readFileSync,
  readSync: mocks.readSync,
}))

import { PRE_PUSH_SCRIPTS, runPrePush } from "./index.ts"
const BUN_VERSION = "1.3.14"

const HEAD = "a".repeat(40)
const OTHER = "b".repeat(40)
const TAG = "c".repeat(40)
const ZERO = "0".repeat(40)
const target = ["review", "ssh://git@code.example/team/destination.git"]
const lanes = ["verify:prepush"]
const update = (id = HEAD, ref = "refs/heads/main") => `HEAD ${id} ${ref} ${ZERO}\n`
const deletion = `(delete) ${ZERO} refs/heads/old ${OTHER}\n`
const result = (status: number | null = 0, stdout = "", extra = {}) => ({
  status, stdout, stderr: "", signal: null, ...extra,
})
const gitSuccess = (executable, arguments_) => {
  if (executable === "bun" && arguments_[0] === "--version") {
    return result(0, `${BUN_VERSION}\n`)
  }
  if (executable === "git" && arguments_[1] === "rev-parse") {
    return result(0, `${HEAD}\n`)
  }
  return result()
}
const run = (input = update(), dependencies = {}) => runPrePush(target, {
  readInput: () => input,
  ...dependencies,
})
const invokedLanes = () => mocks.spawnSync.mock.calls
  .filter(([executable, arguments_]) => executable === "bun" && arguments_[0] === "run")
  .map(([, arguments_]) => arguments_[1])

beforeEach(() => {
  vi.stubGlobal("Bun", { version: BUN_VERSION })
  mocks.readFileSync.mockReturnValue(`${BUN_VERSION}\n`)
  mocks.spawnSync.mockImplementation(gitSuccess)
  vi.spyOn(console, "error").mockImplementation(() => undefined)
  return undefined
}
)

afterEach(() => {
  mocks.readFileSync.mockReset()
  mocks.spawnSync.mockReset()
  mocks.readSync.mockReset()
  vi.unstubAllGlobals()
  return vi.restoreAllMocks()
}
)

describe("source-bound pre-push", () => {
  it("validates the pinned Bun runtime before running core", () => {
    const events: string[] = []
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (executable === "bun" && arguments_[0] === "--version") {
        events.push("runtime")
      }
      return gitSuccess(executable, arguments_)
    }
    )
    const runScripts = vi.fn((scripts) => {
      events.push(...scripts)
      return 0
    }
    )
    expect(run(update(), { runScripts })).toBe(0)
    expect(events).toEqual(["runtime", ...lanes])
    return expect(mocks.spawnSync.mock.calls.some(([, arguments_]) => arguments_.includes("origin"))).toBe(false)
  }
  )

  it("runs only the deterministic core lane without a shell", () => {
    expect(run()).toBe(0)
    expect(invokedLanes()).toEqual(lanes)
    return expect(mocks.spawnSync.mock.calls.every(([, , options]) => options.shell === false)).toBe(true)
  }
  )

  it("blocks publication when core fails", () => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (executable === "bun" && arguments_[1] === "verify:prepush") {
        return result(23)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run()).toBe(23)
    return expect(invokedLanes()).toEqual(["verify:prepush"])
  }
  )

  it("does not let consumers mutate the mandatory lanes", () => {
    expect(() => (PRE_PUSH_SCRIPTS as string[]).push("skip")).toThrow()
    expect(run()).toBe(0)
    return expect(invokedLanes()).toEqual(lanes)
  }
  )

  const expectRuntimeWarning = (detail: string): void => {
    expect(run()).toBe(0)
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^\[hook\] WARNING: Bun runtime differs from the pinned toolchain/u))
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(detail))
    expect(invokedLanes()).toEqual(lanes)
  }

  it.each([
    ["missing", "missing", () => {
      return mocks.readFileSync.mockImplementation(() => {
        throw new Error("missing")
      }
      )
    }
    ],
    ["malformed", "missing or malformed", () => mocks.readFileSync.mockReturnValue("not-semver\n")],
    ["wrong", "Executing Bun must exactly match", () => mocks.readFileSync.mockReturnValue("9.9.9\n")],
  ] as const)("warns about a %s Bun pin without blocking local lanes", (_name, detail, arrange) => {
    arrange()
    return expectRuntimeWarning(detail)
  }
  )

  it.each([
    ["nonzero exit", result(9), "exit 9"],
    ["spawn error", result(0, "", { error: new Error("bun unavailable") }), "bun unavailable"],
    ["termination signal", result(null, "", { signal: "SIGTERM" }), "SIGTERM"],
  ] as const)("warns about a PATH-resolved bun %s without blocking local lanes", (_name, failedResult, detail) => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (executable === "bun" && arguments_[0] === "--version") {
        return failedResult
      }
      return gitSuccess(executable, arguments_)
    }
    )
    return expectRuntimeWarning(detail)
  }
  )

  it("warns about a mismatched PATH-resolved bun without blocking local lanes", () => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (executable === "bun" && arguments_[0] === "--version") {
        return result(0, "9.9.9\n")
      }
      return gitSuccess(executable, arguments_)
    }
    )
    return expectRuntimeWarning("PATH-resolved bun must exactly match")
  }
  )

  it("warns about a mismatched executing Bun without blocking local lanes", () => {
    vi.stubGlobal("Bun", { version: "9.9.9" })
    return expectRuntimeWarning("Executing Bun must exactly match")
  }
  )

  it("warns about a missing executing Bun even when PATH bun matches the pin", () => {
    vi.stubGlobal("Bun", undefined)
    return expectRuntimeWarning("Executing Bun must exactly match")
  }
  )

  it("warns about non-Error failures reading the Bun pin", () => {
    mocks.readFileSync.mockImplementation(() => {
      throw "Bun pin unavailable"
    }
    )
    return expectRuntimeWarning("Bun pin unavailable")
  }
  )

  it("does not warn when both Bun runtimes match the pin", () => {
    expect(run()).toBe(0)
    return expect(console.error).not.toHaveBeenCalledWith(expect.stringContaining("WARNING"))
  }
  )


  it.each([
    [], ["review"], [...target, "HEAD"], ["", target[1]], ["review", ""], ["review", "bad\nurl"],
  ])("rejects malformed Git argv %j before reading STDIN", (...argv) => {
    const readInput = vi.fn(() => update())
    expect(runPrePush(argv, { readInput })).toBe(1)
    expect(readInput).not.toHaveBeenCalled()
    return expect(mocks.spawnSync).not.toHaveBeenCalled()
  }
  )

  it.each([
    ["empty", ""],
    ["extra field", `HEAD ${HEAD} refs/heads/main ${ZERO} extra\n`],
    ["blank record", `${update()}\n`],
    ["control byte", `HE\0AD ${HEAD} refs/heads/main ${ZERO}\n`],
    ["abbreviated ID", `HEAD aaaa refs/heads/main ${ZERO}\n`],
    ["mixed ID length", `HEAD ${HEAD} refs/heads/main ${"0".repeat(64)}\n`],
    ["mixed object formats", `${update()}HEAD ${"a".repeat(64)} refs/heads/second ${"0".repeat(64)}\n`],
    ["unsupported namespace", update(HEAD, "refs/notes/review")],
    ["duplicate destination", update() + update()],
    ["missing deletion marker", update(ZERO)],
    ["false deletion marker", `(delete) ${HEAD} refs/heads/main ${ZERO}\n`],
    ["deleting absent ref", `(delete) ${ZERO} refs/heads/main ${ZERO}\n`],
    ["option-like source", `--all ${HEAD} refs/heads/main ${ZERO}\n`],
    ["oversized input", "x".repeat(65537)],
    ["too many refs", Array.from({ length: 257 }, (_, index) => update(HEAD, `refs/heads/b${index}`)).join("")],
  ])("rejects %s ref input before any assessment", (_, input) => {
    expect(run(input)).toBe(1)
    return expect(invokedLanes()).toEqual([])
  }
  )

  it("accepts whitespace-separated SHA-256 records without substituting HEAD for their source", () => {
    const sha256 = "d".repeat(64)
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (executable === "git" && arguments_[1] === "rev-parse") {
        return result(0, sha256)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run(` HEAD\t${sha256}\trefs/heads/main ${"0".repeat(64)} `)).toBe(0)
    return expect(mocks.spawnSync).toHaveBeenCalledWith("git", ["--no-replace-objects", "rev-parse", "--verify", "--end-of-options", `${sha256}^{commit}`], expect.any(Object))
  }
  )

  it("peels annotated tags and validates multiple sources at HEAD", () => {
    expect(run(update() + `refs/tags/release ${TAG} refs/tags/release ${ZERO}\n`)).toBe(0)
    expect(mocks.spawnSync).toHaveBeenCalledWith("git", ["--no-replace-objects", "rev-parse", "--verify", "--end-of-options", `${TAG}^{commit}`], expect.any(Object))
    return expect(invokedLanes()).toEqual(lanes)
  }
  )

  it("rejects a source commit other than HEAD even alongside a valid source", () => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes(`${OTHER}^{commit}`)) {
        return result(0, OTHER)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run(update() + update(OTHER, "refs/heads/other"))).toBe(1)
    return expect(invokedLanes()).toEqual([])
  }
  )

  it("explicitly accepts deletion-only pushes without source verification", () => {
    expect(run(deletion)).toBe(0)
    expect(invokedLanes()).toEqual([])
    return expect(mocks.spawnSync.mock.calls.some(([, arguments_]) => arguments_.includes("rev-parse"))).toBe(false)
  }
  )

  it("does not let a deletion bypass verification of another source", () => {
    expect(run(deletion + update())).toBe(0)
    return expect(invokedLanes()).toEqual(lanes)
  }
  )

  it.each([" M src/index.civet\0", "M  src/index.civet\0", "MM src/index.civet\0"])("rejects dirty tracked source %j before local lanes", (dirty) => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes("status")) {
        return result(0, dirty)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run()).toBe(1)
    return expect(invokedLanes()).toEqual([])
  }
  )

  it("inspects only tracked files so untracked and ignored files never block a push", () => {
    expect(run()).toBe(0)
    const statusCalls = mocks.spawnSync.mock.calls.filter(([, arguments_]) => arguments_.includes("status"))
    expect(statusCalls).toHaveLength(2)
    const results=[];for (const [, arguments_] of statusCalls) {
      expect(arguments_).toContain("--untracked-files=no")
      results.push(expect(arguments_).not.toContain("--ignored"))
    };return results;
  }
  )

  it("rejects source files modified by a successful verification lane", () => {
    let dirty = false
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes("status") && dirty) {
        return result(0, " M src/index.civet\0")
      }
      return gitSuccess(executable, arguments_)
    }
    )
    const runScripts = () => {
      dirty = true
      return 0
    }
    return expect(run(update(), { runScripts })).toBe(1)
  }
  )

  it("rejects HEAD changing during verification", () => {
    let moved = false
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes("HEAD^{commit}") && moved) {
        return result(0, OTHER)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    const runScripts = () => {
      moved = true
      return 0
    }
    return expect(run(update(), { runScripts })).toBe(1)
  }
  )

  it("propagates a failed HEAD recheck before local lanes", () => {
    let headReads = 0
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes("HEAD^{commit}")) {
        headReads += 1
        if (headReads === 2) {
          return result(19)
        }
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run()).toBe(19)
    return expect(invokedLanes()).toEqual([])
  }
  )

  it("propagates a failed HEAD recheck after successful verification", () => {
    let verified = false
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes("HEAD^{commit}") && verified) {
        return result(19)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    const runScripts = vi.fn(() => {
      verified = true
      return 0
    }
    )
    expect(run(update(), { runScripts })).toBe(19)
    return expect(runScripts).toHaveBeenCalledExactlyOnceWith(lanes)
  }
  )

  it.each(["check-ref-format", "rev-parse", "status"])("propagates failed Git prerequisite %s", (failed) => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes(failed)) {
        return result(19)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    expect(run()).toBe(19)
    return expect(invokedLanes()).toEqual([])
  }
  )

  it("rejects non-commit tag objects rather than silently using HEAD", () => {
    mocks.spawnSync.mockImplementation((executable, arguments_) => {
      if (arguments_.includes(`${TAG}^{commit}`)) {
        return result(128)
      }
      return gitSuccess(executable, arguments_)
    }
    )
    return expect(run(update(TAG, "refs/tags/blob"))).toBe(128)
  }
  )

  it("rejects malformed Git commit output", () => {
    mocks.spawnSync.mockReturnValue(result(0, "not-a-commit"))
    return expect(run()).toBe(1)
  }
  )

  it.each(["git", "bun"])("blocks %s spawn errors and signals", (failed) => {
    const spawnError = new Error("executable unavailable")
    for (const failure of [result(null, "", { error: spawnError }), result(null, "", { signal: "SIGTERM" }), result(null)]) {
      mocks.spawnSync.mockImplementation((executable, arguments_) => {
        return executable === failed ? failure : gitSuccess(executable, arguments_)
      }
      )
      expect(run()).toBe(1)
    }
    expect(console.error).toHaveBeenCalledWith(spawnError.message)
    return expect(console.error).toHaveBeenCalledWith(expect.stringContaining("SIGTERM"))
  }
  )

  it.each(["readInput", "runScripts"])("blocks thrown %s errors", (dependency) => {
    const failure = new Error("unavailable prerequisite")
    const throwFailure = () => {
      throw failure
    }
    expect(run(update(), { [dependency]: throwFailure })).toBe(1)
    return expect(console.error).toHaveBeenCalledWith(expect.stringContaining(failure.message))
  }
  )

  it("blocks non-Error lane failures", () => {
    const runScripts = () => {
      throw "lane unavailable"
    }
    expect(run(update(), { runScripts })).toBe(1)
    return expect(console.error).toHaveBeenCalledWith(expect.stringContaining("lane unavailable"))
  }
  )

  it.each(["runScripts"])("rejects invalid %s status", (dependency) => {
    return expect(run(update(), { [dependency]: () => undefined })).toBe(1)
  }
  )

  it("bounds STDIN reads rather than reading unlimited push input", () => {
    mocks.readSync.mockImplementation((_, buffer, offset, length) => {
      buffer.fill(120, offset, offset + length)
      return length
    }
    )
    expect(runPrePush(target)).toBe(1)
    expect(mocks.readSync).toHaveBeenCalledTimes(1)
    expect(mocks.readSync.mock.calls[0][3]).toBe(65537)
    return expect(mocks.spawnSync).not.toHaveBeenCalled()
  }
  )

  return it("forwards only Git argv and reads four-field updates from STDIN in the executable entrypoint", async () => {
    const originalArgv = process.argv
    const originalExitCode = process.exitCode
    const input = Buffer.from(update())
    let offset = 0
    mocks.readSync.mockImplementation((_, buffer, start, length) => {
      const count = Math.min(length, input.length - offset, 17)
      input.copy(buffer, start, offset, offset + count)
      offset += count
      return count
    }
    )
    try {
      process.argv = ["bun", "scripts/hooks/pre-push.ts", ...target]
      mocks.spawnSync.mockImplementation((executable, arguments_) => {
        return executable === "bun" && arguments_[0] === "run" ? result(13) : gitSuccess(executable, arguments_)
      }
      )
      await import("./pre-push.ts")
      expect(process.exitCode).toBe(13)
      return expect(invokedLanes()).toEqual(lanes)
    }
    finally {
      process.argv = originalArgv
      process.exitCode = originalExitCode
    }
  }
  )
}
)
