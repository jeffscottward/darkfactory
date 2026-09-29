import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lstat: vi.fn(),
  open: vi.fn(),
  randomUUID: vi.fn(() => "fixed-uuid"),
  readdir: vi.fn(),
  rename: vi.fn(),
  realpath: vi.fn(),
  readFile: vi.fn(),
  rm: vi.fn(),
}));

vi.mock("node:crypto", () => ({ randomUUID: mocks.randomUUID }));
vi.mock("node:fs/promises", () => ({
  lstat: mocks.lstat,
  open: mocks.open,
  readdir: mocks.readdir,
  readFile: mocks.readFile,
  realpath: mocks.realpath,
  rename: mocks.rename,
  rm: mocks.rm,
}));

import { materializeWorkerBindings, writeWorkerBindings } from "./bindings.ts";

const validBindings = [
  "DATABASE_URL=postgresql://local.invalid/database",
  "BETTER_AUTH_SECRET=development-auth-secret-at-least-32",
  "CONTACT_THROTTLE_SECRET=development-contact-secret-at-least-32",
  "",
].join("\n");

const errno = (code: string): NodeJS.ErrnoException => {
  return Object.assign(new Error(code), { code });
};

const regularMetadata = (overrides: Record<string, unknown> = {}) => ({
  isFile: () => true,
  isSymbolicLink: () => false,
  nlink: 1,
  ...overrides,
});
const directoryMetadata = {
  isDirectory: () => true,
  isSymbolicLink: () => false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.lstat.mockRejectedValue(errno("ENOENT"));
  mocks.realpath.mockImplementation(async (path: string) => path);
  mocks.rename.mockResolvedValue(undefined);
  return mocks.rm.mockResolvedValue(undefined);
});

describe("Worker binding failure cleanup", () => {
  it("rejects a symbolic identity even when metadata also reports a file", async () => {
    mocks.lstat.mockResolvedValueOnce(
      regularMetadata({
        isSymbolicLink: () => true,
      })
    );

    await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toThrow("Existing Worker bindings path is unsafe");
    return expect(mocks.open).not.toHaveBeenCalled();
  });

  it("preserves unexpected filesystem inspection errors", async () => {
    const unclassified = new Error("inspection failed");
    mocks.lstat.mockRejectedValueOnce(unclassified);
    await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toBe(unclassified);

    mocks.lstat.mockRejectedValueOnce("raw inspection failure");
    await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toBe("raw inspection failure");

    const denied = errno("EACCES");
    mocks.lstat.mockRejectedValueOnce(denied);
    return await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toBe(denied);
  });

  it("closes and removes a temporary file even when both cleanup operations reject", async () => {
    const primaryFailure = new Error("write failed");
    const handle = {
      writeFile: vi.fn(async () => {
        throw primaryFailure;
      }),
      chmod: vi.fn(),
      sync: vi.fn(),
      close: vi.fn(async () => {
        throw new Error("close failed");
      }),
    };
    mocks.open.mockResolvedValueOnce(handle);
    mocks.rm.mockRejectedValueOnce(new Error("remove failed"));

    await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toThrow("Unable to materialize Worker bindings safely");
    expect(mocks.open).toHaveBeenCalledWith(
      "/repo/.dev.vars.fixed-uuid.tmp",
      "wx",
      0o600
    );
    expect(handle.close).toHaveBeenCalledOnce();
    return expect(mocks.rm).toHaveBeenCalledWith(
      "/repo/.dev.vars.fixed-uuid.tmp",
      { force: true }
    );
  });

  it("removes a completed temporary file when the atomic rename fails", async () => {
    const handle = {
      writeFile: vi.fn(async () => undefined),
      chmod: vi.fn(async () => undefined),
      sync: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
    };
    mocks.open.mockResolvedValueOnce(handle);
    mocks.rename.mockRejectedValueOnce(new Error("rename failed"));

    await expect(
      writeWorkerBindings("/repo/.dev.vars", validBindings)
    ).rejects.toThrow("Unable to materialize Worker bindings safely");
    expect(handle.writeFile).toHaveBeenCalledWith(validBindings, "utf8");
    expect(handle.chmod).toHaveBeenCalledWith(0o600);
    expect(handle.sync).toHaveBeenCalledOnce();
    expect(handle.close).toHaveBeenCalledOnce();
    return expect(mocks.rm).toHaveBeenCalledWith(
      "/repo/.dev.vars.fixed-uuid.tmp",
      { force: true }
    );
  });

  it("rejects a regular binding parent that resolves outside the repository", async () => {
    mocks.lstat.mockResolvedValueOnce(directoryMetadata);
    mocks.realpath
      .mockResolvedValueOnce("/repo")
      .mockResolvedValueOnce("/outside/operator");

    await expect(
      materializeWorkerBindings("/repo", "operator")
    ).rejects.toThrow("Worker bindings directory is unsafe");
    expect(mocks.readFile).not.toHaveBeenCalled();
    return expect(mocks.open).not.toHaveBeenCalled();
  });

  return it("uses the current working directory and process environment by default without writing invalid bindings", async () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "");
    mocks.lstat.mockResolvedValueOnce(directoryMetadata);
    mocks.readFile.mockRejectedValueOnce(errno("ENOENT"));

    await expect(materializeWorkerBindings()).rejects.toThrow(
      "BETTER_AUTH_SECRET"
    );
    expect(mocks.lstat).toHaveBeenCalledWith(
      expect.stringContaining("apps/web")
    );
    expect(mocks.readFile).toHaveBeenCalledWith(
      join(process.cwd(), ".env"),
      "utf8"
    );
    vi.unstubAllEnvs();
    return expect(mocks.open).not.toHaveBeenCalled();
  });
});
