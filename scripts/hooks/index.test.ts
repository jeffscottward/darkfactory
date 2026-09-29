import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readFileSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({ spawnSync: mocks.spawnSync }));
vi.mock("node:fs", () => ({ readFileSync: mocks.readFileSync }));

import { runPreCommit } from "./index.ts";

const BUN_VERSION = "1.3.14";

const spawnResult = (status: number | null, stdout = "", error?: Error) => ({
  status,
  stdout,
  stderr: "",
  pid: 123,
  signal: null,
  ...(error === undefined ? {} : { error }),
});

type SpawnCall = [executable: string, arguments_: string[], options?: unknown];

const spawnCalls = (): SpawnCall[] => {
  const spawnMock = Reflect.get(mocks, "spawnSync") as object;
  const mockState = Reflect.get(spawnMock, "mock") as object;
  return Reflect.get(mockState, "calls") as SpawnCall[];
};

const preCommitCalls = () => {
  return spawnCalls().filter(([executable, arguments_]) => {
    return !(
      executable === "bun" &&
      arguments_.length === 1 &&
      arguments_[0] === "--version"
    );
  });
};
beforeEach(() => {
  vi.stubGlobal("Bun", { version: BUN_VERSION });
  mocks.readFileSync.mockReturnValue(`${BUN_VERSION}\n`);
  mocks.spawnSync.mockImplementation((executable, arguments_) => {
    return executable === "bun" && arguments_[0] === "--version"
      ? spawnResult(0, `${BUN_VERSION}\n`)
      : spawnResult(0);
  });
});

afterEach(() => {
  mocks.readFileSync.mockReset();
  mocks.spawnSync.mockReset();
  vi.unstubAllGlobals();
  return vi.restoreAllMocks();
});

describe("repository hooks", () => {
  it("runs staged Biome and Markdown scripts with case-insensitive, argument-safe paths", () => {
    mocks.spawnSync
      .mockReturnValueOnce(
        spawnResult(
          0,
          "src/file with space.TS\0README.MARKDOWN\0component.CIVET\0notes.txt\0"
        )
      )
      .mockReturnValue(spawnResult(0));

    expect(runPreCommit()).toBe(0);
    return expect(preCommitCalls()).toEqual([
      [
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        {
          encoding: "utf8",
          shell: false,
          stdio: ["ignore", "pipe", "inherit"],
        },
      ],
      [
        "bun",
        ["run", "format:staged", "--", "./src/file with space.TS"],
        {
          shell: false,
          stdio: "inherit",
        },
      ],
      [
        "bun",
        ["run", "lint:staged", "--", "./src/file with space.TS"],
        {
          shell: false,
          stdio: "inherit",
        },
      ],
      [
        "bun",
        ["run", "lint:markdown:staged", "--", "./README.MARKDOWN"],
        {
          shell: false,
          stdio: "inherit",
        },
      ],
    ]);
  });

  it("defers Civet-only changes and silently accepts other irrelevant or empty path records", () => {
    const errorOutput = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mocks.spawnSync.mockReturnValueOnce(spawnResult(0, "src/worker.CIVET\0"));

    expect(runPreCommit()).toBe(0);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(1);

    mocks.spawnSync.mockReset();
    errorOutput.mockClear();
    mocks.spawnSync.mockReturnValueOnce(spawnResult(0, "notes.txt\0\0"));

    expect(runPreCommit()).toBe(0);
    expect(errorOutput).not.toHaveBeenCalled();
    return expect(preCommitCalls()).toHaveLength(1);
  });

  it("maps a failed staged-path lookup without hiding spawn errors or null statuses", () => {
    const errorOutput = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const spawnError = Object.assign(new Error("git executable unavailable"), {
      code: "ENOENT",
    });
    mocks.spawnSync.mockReturnValueOnce(spawnResult(null, "", spawnError));

    expect(runPreCommit()).toBe(1);
    return expect(errorOutput).toHaveBeenCalledWith(spawnError.message);
  });

  it("stops at each failed staged command", () => {
    const errorOutput = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    mocks.spawnSync
      .mockReturnValueOnce(spawnResult(0, "src/index.ts\0README.md\0"))
      .mockReturnValueOnce(spawnResult(4));
    expect(runPreCommit()).toBe(4);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(2);

    mocks.spawnSync.mockReset();
    errorOutput.mockClear();
    mocks.spawnSync
      .mockReturnValueOnce(spawnResult(0, "src/index.ts\0README.md\0"))
      .mockReturnValueOnce(spawnResult(0))
      .mockReturnValueOnce(spawnResult(5));
    expect(runPreCommit()).toBe(5);
    expect(mocks.spawnSync).toHaveBeenCalledTimes(3);

    mocks.spawnSync.mockReset();
    errorOutput.mockClear();
    mocks.spawnSync
      .mockReturnValueOnce(spawnResult(0, "README.md\0"))
      .mockReturnValueOnce(spawnResult(6));
    expect(runPreCommit()).toBe(6);
    return expect(mocks.spawnSync).toHaveBeenCalledTimes(2);
  });

  it("returns success after a Biome-only staged batch reaches the terminal path", () => {
    mocks.spawnSync
      .mockReturnValueOnce(spawnResult(0, "src/index.ts\0"))
      .mockReturnValue(spawnResult(0));

    expect(runPreCommit()).toBe(0);
    expect(preCommitCalls()).toHaveLength(3);
    return expect(
      preCommitCalls()
        .slice(1)
        .map(([, arguments_]) => arguments_[1])
    ).toEqual(["format:staged", "lint:staged"]);
  });

  return it("wires the pre-commit entrypoint to its hook runner exit code", async () => {
    const previousExitCode = process.exitCode;
    try {
      process.exitCode = undefined;
      mocks.spawnSync.mockReturnValueOnce(spawnResult(0, ""));
      await import("./pre-commit.ts");
      expect(process.exitCode).toBe(0);
      return expect(mocks.spawnSync).toHaveBeenLastCalledWith(
        "git",
        ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
        expect.any(Object)
      );
    } finally {
      process.exitCode = previousExitCode;
    }
  });
});
