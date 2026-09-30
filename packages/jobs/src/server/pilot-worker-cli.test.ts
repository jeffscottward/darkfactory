import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPilotWorkerMain: vi.fn(),
}));

vi.mock("./pilot-worker.ts", () => ({
  PilotWorkerConfigurationError: class PilotWorkerConfigurationError extends Error {},
  runPilotWorkerMain: mocks.runPilotWorkerMain,
}));

let previousExitCode: string | number | null | undefined;

beforeEach(() => {
  vi.resetModules();
  mocks.runPilotWorkerMain.mockReset();
  previousExitCode = process.exitCode;
  return (process.exitCode = undefined);
});

afterEach(() => {
  return (process.exitCode = previousExitCode);
});

describe("pilot worker CLI", () => {
  it("runs the pilot worker entrypoint without changing the exit code", async () => {
    mocks.runPilotWorkerMain.mockResolvedValue(undefined);

    await import("./pilot-worker-cli.ts");

    expect(mocks.runPilotWorkerMain).toHaveBeenCalledOnce();
    return expect(process.exitCode).toBeUndefined();
  });

  it("prints a configuration error and fails", async () => {
    const { PilotWorkerConfigurationError } = await import("./pilot-worker.ts");
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    mocks.runPilotWorkerMain.mockRejectedValue(
      new PilotWorkerConfigurationError("WORKFLOW_LEASE_OWNER is invalid")
    );

    await import("./pilot-worker-cli.ts");

    expect(stderr).toHaveBeenCalledWith(
      "pilot worker: WORKFLOW_LEASE_OWNER is invalid\n"
    );
    return expect(process.exitCode).toBe(1);
  });

  return it("prints only the type of any other startup error", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    for (const [failure, printed] of [
      [new TypeError("postgres://user:secret@db/x refused"), "TypeError"],
      ["thrown string", "unknown error"],
    ] as const) {
      vi.resetModules();
      mocks.runPilotWorkerMain.mockRejectedValue(failure);
      await import("./pilot-worker-cli.ts");
      expect(stderr).toHaveBeenLastCalledWith(
        `pilot worker failed to start (${printed}); see docs/debugging.md\n`
      );
    }
    expect(JSON.stringify(stderr.mock.calls)).not.toContain("secret");
    return expect(process.exitCode).toBe(1);
  });
});
