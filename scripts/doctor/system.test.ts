import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  execFile: vi.fn(),
  open: vi.fn(),
}));

vi.mock("node:child_process", () => ({ execFile: mocks.execFile }));
vi.mock("node:fs/promises", () => ({
  access: mocks.access,
  open: mocks.open,
}));

import {
  nodeDoctorDependencies,
  nodeDoctorFileSystem,
  nodeDoctorProcess,
  probeTrustedHttps,
} from "./system.ts";

const INJECTED_BUN_VERSION = "1.3.14";

const errno = (code: string, message = code): NodeJS.ErrnoException => {
  return Object.assign(new Error(message), { code });
};

const textHandle = (
  chunks: readonly Buffer[],
  options: Readonly<{ file?: boolean; size?: number; readError?: Error }> = {}
) => {
  let index = 0;
  const size =
    options.size ?? chunks.reduce((total, chunk) => total + chunk.length, 0);
  return {
    stat: vi.fn(async () => ({
      size,
      isFile: () => options.file ?? true,
    })),
    read: vi.fn(async (buffer: Buffer) => {
      if (options.readError) throw options.readError;
      const chunk = chunks[index++];
      if (!chunk) return { bytesRead: 0, buffer };
      chunk.copy(buffer);
      return { bytesRead: chunk.length, buffer };
    }),
    close: vi.fn(async () => undefined),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  return mocks.access.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  return vi.useRealTimers();
});

describe("doctor Node process adapter", () => {
  it("runs bounded commands with only allowed and explicitly added environment", async () => {
    vi.stubEnv("PATH", "/safe/bin");
    vi.stubEnv("DOCKER_HOST", "unix:///safe/docker.sock");
    vi.stubEnv("GROQ_API_KEY", "must-not-leak");
    let capturedOptions: Record<string, unknown> | undefined;
    mocks.execFile.mockImplementationOnce(
      (
        _command: string,
        _arguments: readonly string[],
        options: Record<string, unknown>,
        callback: (error: Error | null, stdout: string, stderr: string) => void
      ) => {
        capturedOptions = options;
        return callback(null, "v1\n", "");
      }
    );

    await expect(
      nodeDoctorProcess.run("docker", ["--version"], {
        timeoutMs: 40,
        maxOutputBytes: 256,
        environment: { DOCKER_CONTEXT: "isolated", CHECK_MODE: "doctor" },
      })
    ).resolves.toEqual({ exitCode: 0, stdout: "v1\n", stderr: "" });
    expect(capturedOptions).toMatchObject({
      encoding: "utf8",
      maxBuffer: 256,
      timeout: 40,
      windowsHide: true,
      env: expect.objectContaining({
        PATH: "/safe/bin",
        DOCKER_HOST: "unix:///safe/docker.sock",
        DOCKER_CONTEXT: "isolated",
        CHECK_MODE: "doctor",
      }),
    });
    expect(capturedOptions?.["env"]).not.toHaveProperty("GROQ_API_KEY");

    mocks.execFile.mockImplementationOnce(
      (
        _command: string,
        _arguments: readonly string[],
        options: Record<string, unknown>,
        callback: (
          error: NodeJS.ErrnoException,
          stdout?: null,
          stderr?: null
        ) => void
      ) => {
        capturedOptions = options;
        return callback(errno("ENOENT"), null, null);
      }
    );
    await expect(nodeDoctorProcess.run("missing", [])).resolves.toEqual({
      exitCode: 1,
      stdout: "",
      stderr: "",
    });
    expect(capturedOptions).toMatchObject({
      maxBuffer: 1_048_576,
      timeout: 10_000,
    });

    mocks.execFile.mockImplementationOnce(
      (
        _command: string,
        _arguments: readonly string[],
        _options: Record<string, unknown>,
        // execFile surfaces a numeric exit status in `code` for non-zero exits.
        callback: (
          error: Error & { code: number },
          stdout: string,
          stderr: string
        ) => void
      ) =>
        callback(
          Object.assign(new Error("failed"), { code: 17 }),
          "partial",
          "failure"
        )
    );
    return await expect(nodeDoctorProcess.run("failed", [])).resolves.toEqual({
      exitCode: 17,
      stdout: "partial",
      stderr: "failure",
    });
  });

  return it("reports trusted HTTPS status and unavailable probes without leaking fetch errors", async () => {
    const fetchRequest = vi
      .fn()
      .mockResolvedValueOnce({ status: 302 })
      .mockResolvedValueOnce({ status: 404 })
      .mockRejectedValueOnce(new Error("private TLS error"));
    vi.stubGlobal("fetch", fetchRequest);

    await expect(
      probeTrustedHttps("https://redirect.localhost")
    ).resolves.toEqual({
      ok: true,
      status: 302,
    });
    await expect(
      probeTrustedHttps("https://missing.localhost")
    ).resolves.toEqual({
      ok: false,
      status: 404,
    });
    await expect(
      probeTrustedHttps("https://offline.localhost")
    ).resolves.toEqual({
      ok: false,
      error: "unavailable",
    });
    return expect(fetchRequest).toHaveBeenNthCalledWith(
      1,
      "https://redirect.localhost",
      {
        method: "HEAD",
        redirect: "manual",
        signal: expect.any(AbortSignal),
      }
    );
  });
});

describe("doctor bounded filesystem adapter", () => {
  it("maps existence and reads bounded regular files while always closing handles", async () => {
    mocks.access
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(errno("ENOENT"));
    await expect(nodeDoctorFileSystem.exists("present.json")).resolves.toBe(
      true
    );
    await expect(nodeDoctorFileSystem.exists("missing.json")).resolves.toBe(
      false
    );

    const handle = textHandle([Buffer.from("doctor"), Buffer.from(" data")]);
    mocks.open.mockResolvedValueOnce(handle);
    await expect(nodeDoctorFileSystem.readText("report.txt", 32)).resolves.toBe(
      "doctor data"
    );
    expect(mocks.open).toHaveBeenCalledWith("report.txt", expect.any(Number));
    return expect(handle.close).toHaveBeenCalledOnce();
  });

  return it("rejects non-files, declared oversize files, and bytes beyond the read bound", async () => {
    for (const handle of [
      textHandle([], { file: false }),
      textHandle([], { size: 5 }),
    ]) {
      mocks.open.mockResolvedValueOnce(handle);
      await expect(nodeDoctorFileSystem.readText("unsafe", 4)).rejects.toThrow(
        /bound/i
      );
      expect(handle.close).toHaveBeenCalledOnce();
    }

    const underreported = textHandle([Buffer.from("12345")], { size: 4 });
    mocks.open.mockResolvedValueOnce(underreported);
    await expect(nodeDoctorFileSystem.readText("growing", 4)).rejects.toThrow(
      /bound/i
    );
    expect(underreported.close).toHaveBeenCalledOnce();

    const failedRead = textHandle([], { readError: errno("EIO") });
    mocks.open.mockResolvedValueOnce(failedRead);
    await expect(
      nodeDoctorFileSystem.readText("broken", 8)
    ).rejects.toMatchObject({
      code: "EIO",
    });
    return expect(failedRead.close).toHaveBeenCalledOnce();
  });
});

describe("doctor dependency discovery", () => {
  return it("exposes injected runtime paths and treats only nonempty environment values as configured", () => {
    vi.stubEnv("EMPTY_DOCTOR_VALUE", "");
    vi.stubEnv("SPACE_DOCTOR_VALUE", " ");
    const dependencies = nodeDoctorDependencies({
      cwd: () => "/workspace/darkfactory",
      versions: { node: "26.3.1", bun: INJECTED_BUN_VERSION },
    });

    expect(dependencies.bunVersion).toBe(INJECTED_BUN_VERSION);
    expect(dependencies.nodeVersion).toBe("26.3.1");
    expect(dependencies.workingDirectory).toBe("/workspace/darkfactory");
    expect(dependencies.environmentHas("MISSING_DOCTOR_VALUE")).toBe(false);
    expect(dependencies.environmentHas("EMPTY_DOCTOR_VALUE")).toBe(false);
    expect(dependencies.environmentHas("SPACE_DOCTOR_VALUE")).toBe(true);
    expect(dependencies.process).toBe(nodeDoctorProcess);
    expect(dependencies.files).toBe(nodeDoctorFileSystem);
    expect(
      nodeDoctorDependencies({ cwd: () => "/", versions: { node: "24.21.0" } })
        .bunVersion
    ).toBe("");
    return expect(dependencies.probeHttps).toBe(probeTrustedHttps);
  });
});
