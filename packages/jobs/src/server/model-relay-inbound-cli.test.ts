import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  runOmpModelRelayInboundMain: vi.fn(),
}));

vi.mock("./model-relay.ts", () => ({
  runOmpModelRelayInboundMain: mocks.runOmpModelRelayInboundMain,
}));

let previousExitCode: string | number | null | undefined;

beforeEach(() => {
  vi.resetModules();
  mocks.runOmpModelRelayInboundMain.mockReset();
  previousExitCode = process.exitCode;
  return (process.exitCode = undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  return (process.exitCode = previousExitCode);
});

describe("model relay inbound CLI", () => {
  it("hands its arguments and process streams to the inbound relay", async () => {
    mocks.runOmpModelRelayInboundMain.mockResolvedValue(undefined);

    await import("./model-relay-inbound-cli.ts");

    expect(mocks.runOmpModelRelayInboundMain).toHaveBeenCalledWith(
      process.argv.slice(2),
      { stdin: process.stdin, stdout: process.stdout }
    );
    return expect(process.exitCode).toBeUndefined();
  });

  return it("prints why it stopped and fails", async () => {
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    for (const [failure, printed] of [
      [
        new Error("model relay arguments are invalid"),
        "model relay: model relay arguments are invalid\n",
      ],
      ["thrown string", "model relay: failed\n"],
    ] as const) {
      vi.resetModules();
      process.exitCode = undefined;
      mocks.runOmpModelRelayInboundMain.mockRejectedValue(failure);

      await import("./model-relay-inbound-cli.ts");

      expect(stderr).toHaveBeenLastCalledWith(printed);
      expect(process.exitCode).toBe(1);
    }
  });
});
