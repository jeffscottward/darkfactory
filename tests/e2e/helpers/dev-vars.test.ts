import { constants } from "node:fs";
import {
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  acquireOwnedDevVars,
  releaseOwnedDevVarsLock,
  removeOwnedDevVarsFile,
  serializeDevVars,
} from "./dev-vars";

const roots: string[] = [];

const temporaryWebDirectory = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "darkfactory-dev-vars-"));
  roots.push(root);
  const webDirectory = join(root, "apps", "web");
  await mkdir(webDirectory, { recursive: true });
  return await realpath(webDirectory);
};

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("owned Worker .dev.vars lifecycle", () => {
  it("serializes only the explicit allowlist with dotenv-safe values", () => {
    expect(
      serializeDevVars(
        {
          APP_ENV: "test",
          APP_NAME: "Dark # Factory\nWorker",
          HOME: "/must-not-enter-worker",
        },
        ["APP_ENV", "APP_NAME"]
      )
    ).toBe('APP_ENV="test"\nAPP_NAME="Dark # Factory\\nWorker"\n');
  });

  it("validates the complete allowlist before acquiring filesystem resources", async () => {
    const webDirectory = await temporaryWebDirectory();

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV", "DATABASE_URL"],
        environment: { APP_ENV: "test" },
        webDirectory,
      })
    ).rejects.toThrow("Worker binding DATABASE_URL is missing");
    await expect(lstat(join(webDirectory, ".dev.vars"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      lstat(join(webDirectory, ".wrangler", ".dev-vars.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
  it.each([
    "write",
    "sync",
    "stat",
    "close",
  ] as const)("removes exact owned artifacts after an injected %s failure", async (stage) => {
    const webDirectory = await temporaryWebDirectory();
    let statCalls = 0;
    let closeCalls = 0;

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        operations: {
          ...(stage === "write"
            ? { write: async () => Promise.reject(new Error("injected write")) }
            : {}),
          ...(stage === "sync"
            ? { sync: async () => Promise.reject(new Error("injected sync")) }
            : {}),
          ...(stage === "stat"
            ? {
                stat: async (file) => {
                  statCalls += 1;
                  if (statCalls === 1) {
                    throw new Error("injected stat");
                  }
                  return await file.stat();
                },
              }
            : {}),
          ...(stage === "close"
            ? {
                close: async (file) => {
                  closeCalls += 1;
                  if (closeCalls === 1) {
                    throw new Error("injected close");
                  }
                  await file.close();
                },
              }
            : {}),
        },
        webDirectory,
      })
    ).rejects.toThrow(
      "Worker bindings acquisition failed; exact owned cleanup was attempted"
    );
    await expect(lstat(join(webDirectory, ".dev.vars"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      lstat(join(webDirectory, ".wrangler", ".dev-vars.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("retains the lock when acquisition cleanup cannot lstat exact ownership", async () => {
    const webDirectory = await temporaryWebDirectory();

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        operations: {
          write: async () => Promise.reject(new Error("injected write")),
          lstat: async () => Promise.reject(new Error("injected lstat")),
        },
        webDirectory,
      })
    ).rejects.toThrow(
      "Worker bindings acquisition failed; exact owned cleanup was attempted"
    );
    await expect(
      lstat(join(webDirectory, ".wrangler", ".dev-vars.lock"))
    ).resolves.toMatchObject({});
  });

  it("creates a private owned file and releases its lock last", async () => {
    const webDirectory = await temporaryWebDirectory();
    const lease = await acquireOwnedDevVars({
      bindingNames: ["APP_ENV", "DATABASE_URL"],
      environment: { APP_ENV: "test", DATABASE_URL: "postgres://isolated" },
      webDirectory,
    });

    const file = await lstat(join(webDirectory, ".dev.vars"));
    expect(file.isFile()).toBe(true);
    expect(file.mode & 0o777).toBe(0o600);
    expect(
      await readFile(join(webDirectory, ".dev.vars"), "utf8")
    ).not.toContain("HOME");

    await removeOwnedDevVarsFile(lease);
    await expect(lstat(join(webDirectory, ".dev.vars"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(lstat(lease.lockPath)).resolves.toMatchObject({});
    await releaseOwnedDevVarsLock(lease);
    await expect(lstat(lease.lockPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("preserves and refuses a pre-existing developer file", async () => {
    const webDirectory = await temporaryWebDirectory();
    const path = join(webDirectory, ".dev.vars");
    await writeFile(path, "DEVELOPER_VALUE=keep\n", { mode: 0o600 });

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        webDirectory,
      })
    ).rejects.toThrow("Refusing to replace an existing Worker bindings file");
    await expect(readFile(path, "utf8")).resolves.toBe(
      "DEVELOPER_VALUE=keep\n"
    );
    await expect(
      lstat(join(webDirectory, ".wrangler", ".dev-vars.lock"))
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("preserves and refuses a pre-existing symlink", async () => {
    const webDirectory = await temporaryWebDirectory();
    const target = join(webDirectory, "developer.env");
    await writeFile(target, "DEVELOPER_VALUE=keep\n", { mode: 0o600 });
    await symlink(target, join(webDirectory, ".dev.vars"));

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        webDirectory,
      })
    ).rejects.toThrow("Refusing to replace an existing Worker bindings file");
    await expect(readFile(target, "utf8")).resolves.toBe(
      "DEVELOPER_VALUE=keep\n"
    );
  });

  it("refuses a symlinked .wrangler directory without touching its target", async () => {
    const webDirectory = await temporaryWebDirectory();
    const external = join(webDirectory, "..", "external-wrangler");
    await mkdir(external);
    await writeFile(join(external, "sentinel"), "keep", { mode: 0o600 });
    await symlink(external, join(webDirectory, ".wrangler"));

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        webDirectory,
      })
    ).rejects.toThrow("Worker bindings directory is not canonical");
    await expect(readFile(join(external, "sentinel"), "utf8")).resolves.toBe(
      "keep"
    );
    await expect(lstat(join(external, ".dev-vars.lock"))).rejects.toMatchObject(
      { code: "ENOENT" }
    );
  });

  it("preserves a replacement created after exclusive acquisition", async () => {
    const webDirectory = await temporaryWebDirectory();
    const devVarsPath = join(webDirectory, ".dev.vars");

    await expect(
      acquireOwnedDevVars({
        bindingNames: ["APP_ENV"],
        environment: { APP_ENV: "test" },
        operations: {
          write: async (file, content) => {
            if (content.includes("APP_ENV")) {
              await unlink(devVarsPath);
              await writeFile(devVarsPath, "DEVELOPER_VALUE=keep\n", {
                mode: 0o600,
              });
              throw new Error("injected replacement");
            }
            await file.writeFile(content);
          },
        },
        webDirectory,
      })
    ).rejects.toThrow(
      "Worker bindings acquisition failed; exact owned cleanup was attempted"
    );
    await expect(readFile(devVarsPath, "utf8")).resolves.toBe(
      "DEVELOPER_VALUE=keep\n"
    );
    await expect(
      lstat(join(webDirectory, ".wrangler", ".dev-vars.lock"))
    ).resolves.toMatchObject({});
  });

  it("fails closed when owned content is tampered", async () => {
    const webDirectory = await temporaryWebDirectory();
    const lease = await acquireOwnedDevVars({
      bindingNames: ["APP_ENV"],
      environment: { APP_ENV: "test" },
      webDirectory,
    });
    await writeFile(lease.devVarsPath, "APP_ENV=production\n", { mode: 0o600 });

    await expect(removeOwnedDevVarsFile(lease)).rejects.toThrow(
      "Worker bindings ownership mismatch"
    );
    await expect(readFile(lease.devVarsPath, "utf8")).resolves.toBe(
      "APP_ENV=production\n"
    );
    await expect(lstat(lease.lockPath)).resolves.toMatchObject({});
  });

  it("fails closed when the owned path is replaced in a cleanup race", async () => {
    const webDirectory = await temporaryWebDirectory();
    const lease = await acquireOwnedDevVars({
      bindingNames: ["APP_ENV"],
      environment: { APP_ENV: "test" },
      webDirectory,
    });
    await unlink(lease.devVarsPath);
    const replacement = await open(
      lease.devVarsPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600
    );
    await replacement.writeFile("DEVELOPER_VALUE=keep\n");
    await replacement.close();

    await expect(removeOwnedDevVarsFile(lease)).rejects.toThrow(
      "Worker bindings ownership mismatch"
    );
    await expect(readFile(lease.devVarsPath, "utf8")).resolves.toBe(
      "DEVELOPER_VALUE=keep\n"
    );
    await expect(lstat(lease.lockPath)).resolves.toMatchObject({});
  });

  it("retains the lock when final lock cleanup cannot prove an empty owned directory", async () => {
    const webDirectory = await temporaryWebDirectory();
    const lease = await acquireOwnedDevVars({
      bindingNames: ["APP_ENV"],
      environment: { APP_ENV: "test" },
      webDirectory,
    });
    await removeOwnedDevVarsFile(lease);
    await writeFile(join(lease.lockPath, "foreign"), "keep", { mode: 0o600 });

    await expect(releaseOwnedDevVarsLock(lease)).rejects.toThrow();
    await expect(
      readFile(join(lease.lockPath, "foreign"), "utf8")
    ).resolves.toBe("keep");
  });
});
