import { spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";

import { withoutGitRepositoryEnvironment } from "../lib/git-env.ts";
import type { DocsFileSystem, PackageManifestSource } from "./docs.ts";
import { type GuardHooks, guardedWrite } from "./filesystem-guard.ts";

// Bounds every read: manifests, Markdown and the largest source files.
const MAX_FILE_BYTES = 1_048_576;
const portable = (path: string): string => path.replaceAll("\\", "/");
type ReadIdentity = Readonly<{ path: string; dev: number; ino: number }>;

export const createDocsFileSystem = async (
  repositoryPath: string,
  hooks: GuardHooks = {}
): Promise<DocsFileSystem> => {
  const root = await realpath(repositoryPath);
  const contained = (path: string): string => {
    const target = resolve(root, path);
    const relation = relative(root, target);
    if (relation === ".." || relation.startsWith(`..${sep}`)) {
      throw new Error("Documentation path escapes repository");
    }
    return target;
  };
  const snapshotAncestors = async (
    path: string
  ): Promise<readonly ReadIdentity[]> => {
    const parent = dirname(path);
    const relation = relative(root, parent);
    if (relation === ".." || relation.startsWith(`..${sep}`)) {
      throw new Error("Documentation ancestor escapes repository");
    }
    const paths = [root];
    let current = root;
    if (relation.length > 0) {
      for (const segment of relation.split(sep)) {
        current = join(current, segment);
        paths.push(current);
      }
    }
    const snapshots = await Promise.all(
      paths.map(async (ancestor) => {
        const stats = await lstat(ancestor);
        if (!stats.isDirectory() || stats.isSymbolicLink())
          throw new Error("Documentation ancestor is unsafe");
        const canonical = await realpath(ancestor);
        const canonicalRelation = relative(root, canonical);
        if (
          canonicalRelation === ".." ||
          canonicalRelation.startsWith(`..${sep}`)
        ) {
          throw new Error("Documentation ancestor escapes repository");
        }
        return Object.freeze({
          path: ancestor,
          dev: stats.dev,
          ino: stats.ino,
        });
      })
    );
    return Object.freeze(snapshots);
  };
  const assertAncestors = async (
    snapshots: readonly ReadIdentity[]
  ): Promise<void> => {
    for (const snapshot of snapshots) {
      const stats = await lstat(snapshot.path);
      if (
        !stats.isDirectory() ||
        stats.isSymbolicLink() ||
        stats.dev !== snapshot.dev ||
        stats.ino !== snapshot.ino
      )
        throw new Error("Documentation ancestor identity changed");
    }
  };
  const readBounded = async (path: string): Promise<string> => {
    const target = contained(path);
    const ancestors = await snapshotAncestors(target);
    const handle = await open(
      target,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
    );
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size > MAX_FILE_BYTES)
        throw new Error(`Repository file is invalid: ${path}`);
      const content = await handle.readFile({ encoding: "utf8" });
      if (Buffer.byteLength(content, "utf8") > MAX_FILE_BYTES)
        throw new Error(`Repository file is too large: ${path}`);
      await assertAncestors(ancestors);
      return content;
    } finally {
      await handle.close();
    }
  };
  const discoverPackageManifests = async (): Promise<
    readonly PackageManifestSource[]
  > => {
    const paths = ["package.json"];
    for (const workspaceRoot of ["apps", "packages"]) {
      const directory = contained(workspaceRoot);
      const workspaceAncestors = await snapshotAncestors(
        join(directory, "_entry")
      );
      await assertAncestors(workspaceAncestors);
      const entries = await readdir(directory, { withFileTypes: true });
      await assertAncestors(workspaceAncestors);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
        const path = portable(join(workspaceRoot, entry.name, "package.json"));
        try {
          const stats = await lstat(contained(path));
          if (stats.isFile() && !stats.isSymbolicLink()) paths.push(path);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      await assertAncestors(workspaceAncestors);
    }
    paths.sort();
    return Promise.all(
      paths.map(async (path) => ({ path, source: await readBounded(path) }))
    );
  };

  // Hooks export GIT_DIR; drop it so Git always reads the repository at `root`.
  const git = (
    arguments_: readonly string[],
    accepted: readonly number[],
    input = ""
  ) => {
    const result = spawnSync("git", arguments_, {
      cwd: root,
      encoding: "utf8",
      env: withoutGitRepositoryEnvironment(),
      input,
      maxBuffer: 16 * MAX_FILE_BYTES,
    });
    if (!accepted.some((status) => status === result.status)) {
      throw new Error(`git ${arguments_[0]} failed: ${result.stderr}`.trim());
    }
    return result.stdout.split("\0").filter((path) => path.length > 0);
  };

  return Object.freeze({
    discoverPackageManifests,
    listRepositoryFiles: async () =>
      git(
        ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
        [0]
      ),
    // check-ignore exits 1 when no path is ignored.
    listIgnoredPaths: async (paths) =>
      git(
        ["check-ignore", "--no-index", "--stdin", "-z"],
        [0, 1],
        paths.join("\0")
      ),
    readFile: async (path) => {
      try {
        return await readBounded(path);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT" || code === "ELOOP") return;
        throw error;
      }
    },
    writeGenerated: async (path, content) =>
      guardedWrite(root, path, content, "upsert", hooks),
  });
};

export const nodeDocsFileSystem = await createDocsFileSystem(process.cwd());
