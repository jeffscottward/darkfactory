import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const CONFIG_DIGEST =
  "d2799b335dd76e228f22ef6fd168364ad9c1c37f26ed8b07ce1eb4d06b2a5c8e";
const ARGV_DIGEST =
  "0970fa90d3ab277f28b29a75762d2e81be2a9b60fc280d4122a663ac57ff2eff";
const IMAGE_DIGEST = `sha256:${"b".repeat(64)}`;
const PINNED_BASE_IMAGE = `oven/bun@sha256:${"a".repeat(64)}`;

const originalArguments = [...process.argv];
const originalExitCode = process.exitCode;
const originalEnvironment = { ...process.env };

type SpawnResponse = Readonly<{
  exitCode: number;
  stdout?: string;
  stderr?: string;
}>;

const installBun = (
  responses: readonly SpawnResponse[],
  docker: string | null = "/usr/local/bin/docker"
) => {
  const pending = [...responses];
  const which = vi.fn(() => docker);
  const spawn = vi.fn(
    (
      _command: readonly string[],
      _options: Readonly<Record<string, unknown>>
    ) => {
      const response = pending.shift();
      if (response === undefined)
        throw new Error("missing verifier-image spawn response");
      return {
        stdout: new Response(response.stdout ?? "").body!,
        stderr: new Response(response.stderr ?? "").body!,
        exited: Promise.resolve(response.exitCode),
      };
    }
  );
  vi.stubGlobal("Bun", { which, spawn });
  return { which, spawn };
};

const mockVerifierDigests = (values: readonly string[]): void => {
  const pending = [...values];
  const createHash = vi.fn(() => {
    const hash = {
      update: vi.fn((_value: unknown) => hash),
      digest: vi.fn((_encoding: "hex") => {
        const value = pending.shift();
        if (value === undefined)
          throw new Error("missing mocked verifier digest");
        return value;
      }),
    };
    return hash;
  });
  vi.doMock("node:crypto", () => ({ createHash }));
};

afterEach(() => {
  process.argv = [...originalArguments];
  process.exitCode = originalExitCode;
  for (const name of Object.keys(process.env)) {
    if (!(name in originalEnvironment)) delete process.env[name];
  }
  for (const [name, value] of Object.entries(originalEnvironment)) {
    process.env[name] = value;
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.doUnmock("node:crypto");
  return vi.resetModules();
});

describe.sequential("verifier image executable", () => {
  it("builds a pinned image, verifies its immutable identity, and prints the digest", async () => {
    process.argv = ["bun", "verifier-image.ts", "setup"];
    process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"] = ` ${PINNED_BASE_IMAGE} `;
    process.env["DARKFACTORY_VERIFIER_IMAGE_NAME"] =
      " registry.example/darkfactory-verifier ";
    process.env["HOME"] = "/owned-home";
    process.env["PATH"] = "/owned-bin";
    process.env["DOCKER_CONTEXT"] = "owned-context";
    delete process.env["DOCKER_HOST"];
    const { spawn } = installBun([
      { exitCode: 0 },
      { exitCode: 0, stdout: `${IMAGE_DIGEST}\n` },
      {
        exitCode: 0,
        stdout: `${IMAGE_DIGEST}|${CONFIG_DIGEST}|${ARGV_DIGEST}\n`,
      },
    ]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await import("./verifier-image.ts");

    expect(spawn).toHaveBeenCalledTimes(3);
    expect(spawn.mock.calls[0]?.[0]).toEqual([
      "/usr/local/bin/docker",
      "build",
      "--pull",
      "--file",
      "packages/jobs/verifier/Dockerfile",
      "--tag",
      "registry.example/darkfactory-verifier",
      "--build-arg",
      `BUN_BASE_IMAGE=${PINNED_BASE_IMAGE}`,
      "--build-arg",
      `VERIFIER_CONFIG_DIGEST=${CONFIG_DIGEST}`,
      "--build-arg",
      `VERIFIER_ARGV_DIGEST=${ARGV_DIGEST}`,
      ".",
    ]);
    expect(spawn.mock.calls[0]?.[1]).toMatchObject({
      cwd: fileURLToPath(new URL("../../../../", import.meta.url)),
      env: expect.objectContaining({
        HOME: "/owned-home",
        PATH: "/owned-bin",
        DOCKER_CONTEXT: "owned-context",
      }),
      stdin: "ignore",
      stdout: "inherit",
      stderr: "inherit",
    });
    expect(spawn.mock.calls[1]?.[1]).toMatchObject({
      stdout: "pipe",
      stderr: "pipe",
    });
    return expect(stdout).toHaveBeenCalledWith(
      `WORKFLOW_VERIFIER_IMAGE_DIGEST=${IMAGE_DIGEST}\n`
    );
  });

  it("checks an existing image with fallback environment values", async () => {
    process.argv = ["bun", "verifier-image.ts", "check"];
    process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"] = ` ${IMAGE_DIGEST} `;
    delete process.env["HOME"];
    delete process.env["PATH"];
    const { spawn } = installBun([
      {
        exitCode: 0,
        stdout: `${IMAGE_DIGEST}|${CONFIG_DIGEST}|${ARGV_DIGEST}`,
      },
    ]);
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await import("./verifier-image.ts");

    expect(spawn.mock.calls[0]?.[1]).toMatchObject({
      env: expect.objectContaining({
        HOME: "/tmp",
        PATH: "/usr/local/bin:/usr/bin:/bin",
      }),
    });
    return expect(stdout).toHaveBeenCalledWith(`verified ${IMAGE_DIGEST}\n`);
  });

  it.each([
    ["configuration", ["0".repeat(64)], "Verifier config digest changed"],
    ["argv", [CONFIG_DIGEST, "0".repeat(64)], "Verifier argv digest changed"],
  ] as const)("rejects a changed verifier $0 digest", async (_label, digests, expectedMessage) => {
    mockVerifierDigests(digests);
    process.argv = ["bun", "verifier-image.ts", "check"];
    process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"] = IMAGE_DIGEST;
    installBun([]);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      expectedMessage
    );
  });

  it("rejects execution when Docker is unavailable", async () => {
    process.argv = ["bun", "verifier-image.ts", "check"];
    installBun([], null);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      "Docker is unavailable"
    );
  });

  it.each([
    [
      "setup without a pinned base",
      "setup",
      "DARKFACTORY_VERIFIER_BASE_IMAGE must be pinned by sha256 digest",
    ],
    [
      "check without a valid digest",
      "check",
      "Verifier image digest is invalid",
    ],
    [
      "an unsupported command",
      "remove",
      "Usage: verifier-image.ts setup|check",
    ],
  ] as const)("rejects $0", async (_label, command, expectedMessage) => {
    process.argv = ["bun", "verifier-image.ts", command];
    delete process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"];
    delete process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"];
    installBun([]);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      expectedMessage
    );
  });

  it("rejects an invalid configured image name", async () => {
    process.argv = ["bun", "verifier-image.ts", "setup"];
    process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"] = PINNED_BASE_IMAGE;
    process.env["DARKFACTORY_VERIFIER_IMAGE_NAME"] = "INVALID IMAGE";
    installBun([]);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      "DARKFACTORY_VERIFIER_IMAGE_NAME is invalid"
    );
  });

  it("rejects an image whose immutable labels do not match", async () => {
    process.argv = ["bun", "verifier-image.ts", "check"];
    process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"] = IMAGE_DIGEST;
    installBun([{ exitCode: 0, stdout: `${IMAGE_DIGEST}|wrong|wrong` }]);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      "Verifier image identity does not match immutable config"
    );
  });

  return it.each([
    [
      "captured stderr",
      "check",
      { exitCode: 1, stderr: "private docker failure\n" },
      "private docker failure",
    ],
    [
      "empty captured stderr",
      "check",
      { exitCode: 1 },
      "Docker command failed",
    ],
    ["inherited output", "setup", { exitCode: 1 }, "Docker command failed"],
  ] as const)("normalizes Docker failure with $0", async (_label, command, response, expectedMessage) => {
    process.argv = ["bun", "verifier-image.ts", command];
    process.env["WORKFLOW_VERIFIER_IMAGE_DIGEST"] = IMAGE_DIGEST;
    process.env["DARKFACTORY_VERIFIER_BASE_IMAGE"] = PINNED_BASE_IMAGE;
    delete process.env["DARKFACTORY_VERIFIER_IMAGE_NAME"];
    installBun([response]);

    return await expect(import("./verifier-image.ts")).rejects.toThrow(
      expectedMessage
    );
  });
});
