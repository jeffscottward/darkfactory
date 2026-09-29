import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  constants: {} as Record<string, number>,
  fileSystem: {
    lstat: vi.fn(),
    open: vi.fn(),
    realpath: vi.fn(),
  },
  fileSystemActual: {} as Pick<
    typeof import("node:fs/promises"),
    "lstat" | "open" | "realpath"
  >,
  resetConstants: (): void => {
    // No-op double.
  },
  resetFileSystem: (): void => {
    // No-op double.
  },
}));
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const reset = (): void => {
    for (const name of Object.keys(mocks.constants))
      delete mocks.constants[name];
    Object.assign(mocks.constants, actual.constants);
  };
  mocks.resetConstants = reset;
  reset();
  return { ...actual, constants: mocks.constants };
});
vi.mock("node:fs/promises", async () => {
  const actual =
    await vi.importActual<typeof import("node:fs/promises")>(
      "node:fs/promises"
    );
  Object.assign(mocks.fileSystemActual, {
    lstat: actual.lstat,
    open: actual.open,
    realpath: actual.realpath,
  });
  const reset = (): void => {
    mocks.fileSystem.lstat.mockReset().mockImplementation(actual.lstat);
    mocks.fileSystem.open.mockReset().mockImplementation(actual.open);
    mocks.fileSystem.realpath.mockReset().mockImplementation(actual.realpath);
  };
  mocks.resetFileSystem = reset;
  reset();
  return {
    ...actual,
    lstat: mocks.fileSystem.lstat,
    open: mocks.fileSystem.open,
    realpath: mocks.fileSystem.realpath,
  };
});

import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import { GENERATED_PACKAGE_GRAPH_PATH, runDocsAction } from "./docs.ts";
import { createDocsFileSystem } from "./system.ts";

afterEach(() => {
  mocks.resetConstants();
  mocks.resetFileSystem();
  return vi.clearAllMocks();
});

const packageManifest = (name: string, brick = "product"): string =>
  JSON.stringify({
    name,
    brick,
    description: "A test brick.",
    version: "1.0.0",
  });

const initializeGit = (root: string): void => {
  spawnSync("git", ["init", "--quiet"], {
    cwd: root,
    env: withoutGitRepositoryEnvironment(),
  });
};

const createRepository = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "darkfactory-docs-system-"));
  await Promise.all([
    mkdir(join(root, "apps"), { recursive: true }),
    mkdir(join(root, "packages"), { recursive: true }),
  ]);
  await writeFile(
    join(root, "package.json"),
    packageManifest("@darkfactory/root", "workspace"),
    "utf8"
  );
  return root;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
};

describe("documentation filesystem", () => {
  it("discovers only regular package manifests in portable sorted order", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(
      join(tmpdir(), "darkfactory-docs-system-outside-")
    );
    try {
      await Promise.all([
        mkdir(join(root, "apps/web"), { recursive: true }),
        mkdir(join(root, "packages/api"), { recursive: true }),
        mkdir(join(root, "packages/without-manifest"), { recursive: true }),
        mkdir(join(root, "packages/directory-manifest/package.json"), {
          recursive: true,
        }),
        mkdir(join(outside, "linked"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(
          join(root, "apps/web/package.json"),
          packageManifest("@darkfactory/web"),
          "utf8"
        ),
        writeFile(
          join(root, "packages/api/package.json"),
          packageManifest("@darkfactory/api"),
          "utf8"
        ),
        writeFile(join(root, "packages/not-a-directory"), "ignored", "utf8"),
        writeFile(
          join(outside, "linked/package.json"),
          packageManifest("outside"),
          "utf8"
        ),
      ]);
      await symlink(join(outside, "linked"), join(root, "packages/linked"));

      const files = await createDocsFileSystem(root);
      const discovered = await files.discoverPackageManifests();

      expect(discovered.map(({ path }) => path)).toEqual([
        "apps/web/package.json",
        "package.json",
        "packages/api/package.json",
      ]);
      return expect(
        discovered.map(({ source }) => JSON.parse(source).name)
      ).toEqual(["@darkfactory/web", "@darkfactory/root", "@darkfactory/api"]);
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("bounds reads and rejects paths, directories, and symbolic links outside the file contract", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(
      join(tmpdir(), "darkfactory-docs-read-outside-")
    );
    try {
      const generated = join(root, "docs/generated");
      await mkdir(join(generated, "directory"), { recursive: true });
      await writeFile(
        join(generated, "at-limit.json"),
        "x".repeat(1_048_576),
        "utf8"
      );
      await writeFile(
        join(generated, "too-large.json"),
        "x".repeat(1_048_577),
        "utf8"
      );
      await writeFile(join(outside, "secret.json"), "outside", "utf8");
      await symlink(
        join(outside, "secret.json"),
        join(generated, "linked.json")
      );
      const files = await createDocsFileSystem(root);

      await expect(
        files.readFile("docs/generated/missing.json")
      ).resolves.toBeUndefined();
      await expect(
        files.readFile("docs/generated/at-limit.json")
      ).resolves.toHaveLength(1_048_576);
      await expect(
        files.readFile("docs/generated/too-large.json")
      ).rejects.toThrow(/invalid|large/i);
      await expect(files.readFile("docs/generated/directory")).rejects.toThrow(
        /invalid/i
      );
      await expect(
        files.readFile("docs/generated/linked.json")
      ).resolves.toBeUndefined();
      await expect(files.readFile("../secret.json")).rejects.toThrow(
        /escapes repository/i
      );
      await expect(files.readFile(".")).rejects.toThrow(
        /ancestor escapes repository/i
      );
      await expect(
        files.writeGenerated("../secret.json", "changed")
      ).rejects.toThrow(/escapes repository/i);
      return await expect(
        readFile(join(outside, "secret.json"), "utf8")
      ).resolves.toBe("outside");
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("supports documentation generation and reports fresh and stale checks without tracked writes", async () => {
    const root = await createRepository();
    try {
      await mkdir(join(root, "apps/web"), { recursive: true });
      await writeFile(
        join(root, "apps/web/package.json"),
        packageManifest("@darkfactory/web"),
        "utf8"
      );
      initializeGit(root);
      const files = await createDocsFileSystem(root);

      await expect(runDocsAction("generate", { files })).resolves.toMatchObject(
        {
          ok: true,
          changed: true,
          packageCount: 2,
        }
      );
      const generatedPath = join(root, GENERATED_PACKAGE_GRAPH_PATH);
      const generated = await readFile(generatedPath, "utf8");
      await expect(runDocsAction("check", { files })).resolves.toMatchObject({
        ok: true,
        changed: false,
        reason: expect.stringMatching(/current/i),
      });

      await mkdir(join(root, "packages/api"), { recursive: true });
      await writeFile(
        join(root, "packages/api/package.json"),
        packageManifest("@darkfactory/api"),
        "utf8"
      );
      await expect(runDocsAction("check", { files })).resolves.toMatchObject({
        ok: false,
        changed: false,
        packageCount: 3,
        reason: expect.stringMatching(/stale/i),
      });
      return await expect(readFile(generatedPath, "utf8")).resolves.toBe(
        generated
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("lists repository files and ignored paths through Git at the repository root", async () => {
    const root = await createRepository();
    try {
      const files = await createDocsFileSystem(root);
      await expect(files.listRepositoryFiles()).rejects.toThrow(
        /git ls-files failed/
      );

      initializeGit(root);
      await writeFile(join(root, ".gitignore"), "local/\n*.log\n", "utf8");
      await mkdir(join(root, "local"));
      await writeFile(join(root, "local/cache.txt"), "ignored", "utf8");
      await writeFile(join(root, "notes.log"), "ignored", "utf8");
      await expect(files.listRepositoryFiles()).resolves.toEqual([
        ".gitignore",
        "package.json",
      ]);
      await expect(
        files.listIgnoredPaths(["local/", "missing.log", "src/app.ts"])
      ).resolves.toEqual(["local/", "missing.log"]);
      return await expect(files.listIgnoredPaths([])).resolves.toEqual([]);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a workspace root that is not a regular directory", async () => {
    const root = await createRepository();
    try {
      await rm(join(root, "apps"), { recursive: true });
      await writeFile(join(root, "apps"), "occupied", "utf8");
      const files = await createDocsFileSystem(root);

      await expect(files.discoverPackageManifests()).rejects.toThrow(
        /ancestor is unsafe/i
      );
      return await expect(
        exists(join(root, GENERATED_PACKAGE_GRAPH_PATH))
      ).resolves.toBe(false);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
  it("rejects a canonical ancestor that resolves outside the repository", async () => {
    const root = await createRepository();
    const outside = await mkdtemp(
      join(tmpdir(), "darkfactory-docs-canonical-outside-")
    );
    const canonicalRoot = await mocks.fileSystemActual.realpath(root);
    const canonicalOutside = await mocks.fileSystemActual.realpath(outside);
    const apps = join(canonicalRoot, "apps");
    mocks.fileSystem.realpath.mockImplementation(async (...arguments_) => {
      return String(arguments_[0]) === apps
        ? canonicalOutside
        : Reflect.apply(mocks.fileSystemActual.realpath, undefined, arguments_);
    });

    try {
      const files = await createDocsFileSystem(root);
      return await expect(files.discoverPackageManifests()).rejects.toThrow(
        /ancestor escapes repository/i
      );
    } finally {
      await rm(root, { force: true, recursive: true });
      await rm(outside, { force: true, recursive: true });
    }
  });

  it("rejects an ancestor identity that changes after its snapshot", async () => {
    const root = await createRepository();
    const apps = join(await mocks.fileSystemActual.realpath(root), "apps");
    const files = await createDocsFileSystem(root);
    let appsInspections = 0;
    mocks.fileSystem.lstat.mockImplementation(async (...arguments_) => {
      const stats = (await Reflect.apply(
        mocks.fileSystemActual.lstat,
        undefined,
        arguments_
      )) as Awaited<ReturnType<typeof mocks.fileSystemActual.lstat>>;
      if (String(arguments_[0]) !== apps || ++appsInspections === 1)
        return stats;
      return Object.assign(stats, { ino: Number(stats.ino) + 1 });
    });

    try {
      return await expect(files.discoverPackageManifests()).rejects.toThrow(
        /ancestor identity changed/i
      );
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  it("rejects a manifest that grows after inspection with the no-follow fallback", async () => {
    const root = await createRepository();
    const generated = join(root, "docs/generated/growing.json");
    const canonicalGenerated = join(
      await mocks.fileSystemActual.realpath(root),
      "docs/generated/growing.json"
    );
    await mkdir(join(root, "docs/generated"), { recursive: true });
    await writeFile(generated, "x", "utf8");
    const files = await createDocsFileSystem(root);
    Reflect.deleteProperty(mocks.constants, "O_NOFOLLOW");
    mocks.fileSystem.open.mockImplementation(async (...arguments_) => {
      const handle = (await Reflect.apply(
        mocks.fileSystemActual.open,
        undefined,
        arguments_
      )) as Awaited<ReturnType<typeof mocks.fileSystemActual.open>>;
      if (String(arguments_[0]) === canonicalGenerated) {
        Object.defineProperty(handle, "readFile", {
          configurable: true,
          value: async () => "x".repeat(1_048_577),
        });
      }
      return handle;
    });

    try {
      return await expect(
        files.readFile("docs/generated/growing.json")
      ).rejects.toThrow(/file is too large/i);
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });

  return it("surfaces non-missing manifest discovery failures", async () => {
    const root = await createRepository();
    const blockedDirectory = join(root, "packages/blocked");
    const canonicalBlockedManifest = join(
      await mocks.fileSystemActual.realpath(root),
      "packages/blocked/package.json"
    );
    await mkdir(blockedDirectory, { recursive: true });
    const files = await createDocsFileSystem(root);
    mocks.fileSystem.lstat.mockImplementation(async (...arguments_) => {
      if (String(arguments_[0]) === canonicalBlockedManifest) {
        throw Object.assign(new Error("manifest permission denied"), {
          code: "EACCES",
        });
      }
      return Reflect.apply(mocks.fileSystemActual.lstat, undefined, arguments_);
    });

    try {
      return await expect(
        files.discoverPackageManifests()
      ).rejects.toMatchObject({
        code: "EACCES",
        message: "manifest permission denied",
      });
    } finally {
      await rm(root, { force: true, recursive: true });
    }
  });
});
