import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runPilotWorkerMain: vi.fn(),
}));

vi.mock("./pilot-worker.ts", () => ({
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

  return it("sets a failing exit code when startup rejects", async () => {
    mocks.runPilotWorkerMain.mockRejectedValue(new Error("startup failed"));

    await import("./pilot-worker-cli.ts");

    expect(mocks.runPilotWorkerMain).toHaveBeenCalledOnce();
    return expect(process.exitCode).toBe(1);
  });
});
