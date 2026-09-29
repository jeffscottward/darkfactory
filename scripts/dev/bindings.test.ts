import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { EnvironmentValidationError } from "@darkfactory/config/server";
import {
  listTemporaryBindingFiles,
  materializeWorkerBindings,
  resolveWorkerBindings,
  writeWorkerBindings,
} from "./bindings.ts";

const directories: string[] = [];
// Sorted, as resolveWorkerBindings writes them.
const validBindings = [
  "APP_ENV=development",
  "BETTER_AUTH_SECRET=development-auth-secret-at-least-32",
  "CONTACT_THROTTLE_SECRET=development-contact-secret-at-least-32",
  "DATABASE_URL=postgresql://local.invalid/database",
  "",
].join("\n");

const MAX_BINDING_BYTES = 128 * 1024;

const directory = async (): Promise<string> => {
  const path = await mkdtemp(join(tmpdir(), "darkfactory-bindings-"));
  directories.push(path);
  return path;
};

afterEach(async () => {
  return await Promise.all(
    directories
      .splice(0)
      .map((path) => rm(path, { force: true, recursive: true }))
  );
});

describe("development Worker bindings", () => {
  it("atomically replaces a regular file and enforces mode 0600", async () => {
    const root = await directory();
    const target = join(root, ".dev.vars");
    await writeFile(target, "stale", { mode: 0o644 });
    await chmod(target, 0o644);

    await writeWorkerBindings(target, validBindings);

    expect(await readFile(target, "utf8")).toBe(validBindings);
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
    return expect(await listTemporaryBindingFiles(root)).toEqual([]);
  });

  it("rejects symlink targets without changing their destination", async () => {
    const root = await directory();
    const destination = join(root, "destination");
    const target = join(root, ".dev.vars");
    await writeFile(destination, "do-not-replace");
    await symlink(destination, target);

    await expect(writeWorkerBindings(target, validBindings)).rejects.toThrow(
      "Existing Worker bindings path is unsafe"
    );
    expect(await readFile(destination, "utf8")).toBe("do-not-replace");
    return expect(await listTemporaryBindingFiles(root)).toEqual([]);
  });

  it("rejects malformed output before creating a file", async () => {
    const root = await directory();
    const target = join(root, ".dev.vars");

    await expect(
      writeWorkerBindings(
        target,
        "DATABASE_URL=postgresql://local.invalid/database\n"
      )
    ).rejects.toThrow("malformed or incomplete");
    return await expect(lstat(target)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("accepts the exact byte boundary and rejects empty, oversized, and malformed assignments", async () => {
    const root = await directory();
    const target = join(root, ".dev.vars");
    const prefix = `${validBindings}PADDING=`;
    const exactBindings = `${prefix}${"x".repeat(
      MAX_BINDING_BYTES - Buffer.byteLength(prefix, "utf8")
    )}`;

    await writeWorkerBindings(target, exactBindings);
    expect(Buffer.byteLength(await readFile(target), "utf8")).toBe(
      MAX_BINDING_BYTES
    );

    for (const invalid of [
      "",
      "\n",
      `${exactBindings}x`,
      "lowercase=value\nDATABASE_URL=database\nBETTER_AUTH_SECRET=secret\nCONTACT_THROTTLE_SECRET=secret\n",
      "DATABASE_URL=database\nBETTER_AUTH_SECRET=\nCONTACT_THROTTLE_SECRET=secret\n",
      "DATABASE_URL=database\nBETTER_AUTH_SECRET=secret\n",
    ]) {
      await expect(writeWorkerBindings(target, invalid)).rejects.toThrow(
        /empty|safe size|malformed|incomplete/i
      );
    }
  });

  it("rejects directory and multiply-linked targets", async () => {
    const root = await directory();
    const directoryTarget = join(root, "directory-target");
    await mkdir(directoryTarget);
    await expect(
      writeWorkerBindings(directoryTarget, validBindings)
    ).rejects.toThrow("Existing Worker bindings path is unsafe");

    const source = join(root, "linked-source");
    const linkedTarget = join(root, "linked-target");
    await writeFile(source, "unchanged");
    await link(source, linkedTarget);
    await expect(
      writeWorkerBindings(linkedTarget, validBindings)
    ).rejects.toThrow("Existing Worker bindings path is unsafe");
    return expect(await readFile(source, "utf8")).toBe("unchanged");
  });

  it("returns only temporary binding files with both required name boundaries", async () => {
    const root = await directory();
    await Promise.all([
      writeFile(join(root, ".dev.vars.first.tmp"), ""),
      writeFile(join(root, "prefix.dev.vars.second.tmp"), ""),
      writeFile(join(root, ".dev.vars.third.txt"), ""),
      writeFile(join(root, "unrelated.tmp"), ""),
    ]);

    return expect([...(await listTemporaryBindingFiles(root))].sort()).toEqual([
      ".dev.vars.first.tmp",
      "prefix.dev.vars.second.tmp",
    ]);
  });

  it("resolves .env values, lets the process environment win, and quotes only when needed", () => {
    const resolved = resolveWorkerBindings(
      [
        "# comment",
        "DATABASE_URL=postgresql://file.invalid/database",
        "BETTER_AUTH_SECRET=development-auth-secret-at-least-32",
        "CONTACT_THROTTLE_SECRET=development-contact-secret-at-least-32",
        "EMAIL_FROM=DarkFactory <noreply@domain.test>",
        "WORKFLOW_REPOSITORIES_ROOT=/srv/repositories",
        "GROQ_API_KEY=",
        "",
      ].join("\n"),
      {
        DATABASE_URL: "postgresql://override.invalid/database",
        UNRELATED_SHELL_VALUE: "must-not-leak",
      }
    );

    expect(resolved).toBe(
      [
        "BETTER_AUTH_SECRET=development-auth-secret-at-least-32",
        "CONTACT_THROTTLE_SECRET=development-contact-secret-at-least-32",
        "DATABASE_URL=postgresql://override.invalid/database",
        "EMAIL_FROM='DarkFactory <noreply@domain.test>'",
        "WORKFLOW_REPOSITORIES_ROOT=/srv/repositories",
        "",
      ].join("\n")
    );
    return expect(resolved).not.toContain("UNRELATED_SHELL_VALUE");
  });

  it("rejects invalid environments and values that cannot be written literally", () => {
    expect(() =>
      resolveWorkerBindings("DATABASE_URL=postgresql://local.invalid/db\n", {})
    ).toThrow(EnvironmentValidationError);
    for (const unsafe of ["it's", "two\nlines"]) {
      expect(() =>
        resolveWorkerBindings(validBindings, { APP_NAME: unsafe })
      ).toThrow("APP_NAME cannot be written to Worker bindings safely");
    }
  });

  it("materializes validated .env values at the repository boundary", async () => {
    const root = await directory();
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await writeFile(join(root, ".env"), validBindings);

    await materializeWorkerBindings(root, "web", {});

    expect(await readFile(join(root, "apps", "web", ".dev.vars"), "utf8")).toBe(
      validBindings
    );
    return expect(
      await listTemporaryBindingFiles(join(root, "apps", "web"))
    ).toEqual([]);
  });

  it("materializes operator bindings separately without changing web bindings", async () => {
    const root = await directory();
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await mkdir(join(root, "apps", "operator"), { recursive: true });
    const webTarget = join(root, "apps", "web", ".dev.vars");
    const operatorTarget = join(root, "apps", "operator", ".dev.vars");
    await writeFile(webTarget, "existing-web-bindings", { mode: 0o600 });

    await materializeWorkerBindings(root, "operator", {
      APP_ENV: "development",
      DATABASE_URL: "postgresql://local.invalid/database",
      BETTER_AUTH_SECRET: "development-auth-secret-at-least-32",
      CONTACT_THROTTLE_SECRET: "development-contact-secret-at-least-32",
    });

    expect(await readFile(webTarget, "utf8")).toBe("existing-web-bindings");
    expect(await readFile(operatorTarget, "utf8")).toBe(validBindings);
    expect((await lstat(operatorTarget)).mode & 0o777).toBe(0o600);
    return expect(
      await listTemporaryBindingFiles(join(root, "apps", "operator"))
    ).toEqual([]);
  });

  it("rejects an operator binding parent that resolves outside the repository", async () => {
    const root = await directory();
    const outside = await directory();
    await mkdir(join(root, "apps"), { recursive: true });
    await symlink(outside, join(root, "apps", "operator"));

    await expect(
      materializeWorkerBindings(root, "operator", {})
    ).rejects.toThrow("Worker bindings directory is unsafe");
    return await expect(
      lstat(join(outside, ".dev.vars"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  return it("rejects unreadable .env files and invalid environments without writing output", async () => {
    const root = await directory();
    await mkdir(join(root, "apps", "web"), { recursive: true });
    await mkdir(join(root, ".env"));
    await expect(materializeWorkerBindings(root, "web", {})).rejects.toThrow(
      "Unable to read .env"
    );

    await rm(join(root, ".env"), { recursive: true });
    await writeFile(join(root, ".env"), "BETTER_AUTH_SECRET=short\n");
    await expect(
      materializeWorkerBindings(root, "web", {})
    ).rejects.toBeInstanceOf(EnvironmentValidationError);
    return await expect(
      lstat(join(root, "apps", "web", ".dev.vars"))
    ).rejects.toMatchObject({
      code: "ENOENT",
    });
  });
});
