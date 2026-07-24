import { randomUUID } from "node:crypto";
import type { Stats } from "node:fs";
import { lstat, realpath, rename, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(
  new URL("../../../", import.meta.url)
);
const OPTIMIZER_CACHE_SEGMENTS = [
  "apps",
  "web",
  "node_modules",
  ".vite",
] as const;

type CleanupPaths = Readonly<{
  optimizerCache: string;
  quarantine: string;
}>;

interface RemoveOptimizerCacheOptions {
  afterQuarantine?: (paths: CleanupPaths) => Promise<void>;
  beforeQuarantine?: (paths: CleanupPaths) => Promise<void>;
  beforeRemove?: (paths: CleanupPaths) => Promise<void>;
  quarantineId?: string;
  remove?: typeof rm;
  rename?: typeof rename;
  repositoryRoot?: string;
}

type DirectoryIdentity = Readonly<{
  dev: number;
  ino: number;
  path: string;
}>;

const isMissing = (error: unknown): boolean =>
  error instanceof Error && "code" in error && error.code === "ENOENT";

const directoryIdentity = async (
  path: string,
  label: string
): Promise<DirectoryIdentity> => {
  const metadata: Stats = await lstat(path);
  if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
    throw new Error(`${label} must be a real directory`);
  }
  if ((await realpath(path)) !== path) {
    throw new Error(`${label} must use its canonical path`);
  }
  return { dev: metadata.dev, ino: metadata.ino, path };
};

const assertIdentity = async (
  expected: DirectoryIdentity,
  label: string
): Promise<void> => {
  const current = await directoryIdentity(expected.path, label);
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    throw new Error(`${label} identity changed during optimizer cleanup`);
  }
};

export const removeE2EOptimizerCache = async (
  options: RemoveOptimizerCacheOptions = {}
): Promise<boolean> => {
  const repositoryRoot = resolve(
    options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT
  );
  const ancestors: DirectoryIdentity[] = [
    await directoryIdentity(repositoryRoot, "E2E repository root"),
  ];
  const canonicalRoot = ancestors[0];
  if (canonicalRoot === undefined) {
    throw new Error("E2E repository identity is unavailable");
  }

  let ancestor = canonicalRoot.path;
  for (const segment of OPTIMIZER_CACHE_SEGMENTS.slice(0, -1)) {
    ancestor = join(ancestor, segment);
    try {
      ancestors.push(
        await directoryIdentity(ancestor, "E2E optimizer cache ancestor")
      );
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  }

  const cacheSegment = OPTIMIZER_CACHE_SEGMENTS.at(-1);
  if (cacheSegment === undefined) {
    throw new Error("E2E optimizer cache segment is unavailable");
  }
  const optimizerCache = join(ancestor, cacheSegment);
  if (
    optimizerCache !== join(canonicalRoot.path, ...OPTIMIZER_CACHE_SEGMENTS) ||
    dirname(optimizerCache) !== ancestor
  ) {
    throw new Error("Refusing an unexpected E2E optimizer cache path");
  }

  let cacheIdentity: DirectoryIdentity;
  try {
    cacheIdentity = await directoryIdentity(
      optimizerCache,
      "E2E optimizer cache"
    );
  } catch (error) {
    if (isMissing(error)) {
      return false;
    }
    throw error;
  }

  const quarantineId = options.quarantineId ?? `${process.pid}-${randomUUID()}`;
  if (!/^[a-zA-Z0-9-]+$/u.test(quarantineId)) {
    throw new Error("Invalid E2E optimizer quarantine identifier");
  }
  const quarantine = join(ancestor, `.vite.e2e-quarantine-${quarantineId}`);
  const paths = Object.freeze({ optimizerCache, quarantine });
  try {
    await lstat(quarantine);
    throw new Error("E2E optimizer quarantine path already exists");
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }

  const renameOperation = options.rename ?? rename;
  const removeOperation = options.remove ?? rm;
  const validateOwnedQuarantine = async (): Promise<void> => {
    for (const identity of ancestors) {
      await assertIdentity(identity, "E2E optimizer cache ancestor");
    }
    const moved = await directoryIdentity(
      quarantine,
      "E2E optimizer quarantine"
    );
    if (moved.dev !== cacheIdentity.dev || moved.ino !== cacheIdentity.ino) {
      throw new Error("E2E optimizer quarantine identity does not match cache");
    }
  };
  const restoreWhenOwned = async (): Promise<boolean> => {
    try {
      for (const identity of ancestors) {
        await assertIdentity(identity, "E2E optimizer cache ancestor");
      }
      const moved = await directoryIdentity(
        quarantine,
        "E2E optimizer quarantine"
      );
      if (moved.dev !== cacheIdentity.dev || moved.ino !== cacheIdentity.ino) {
        return false;
      }
      try {
        await lstat(optimizerCache);
        return false;
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
      }
      await renameOperation(quarantine, optimizerCache);
      await assertIdentity(cacheIdentity, "Restored E2E optimizer cache");
      return true;
    } catch {
      return false;
    }
  };

  await options.beforeQuarantine?.(paths);
  try {
    await renameOperation(optimizerCache, quarantine);
    await options.afterQuarantine?.(paths);
    await validateOwnedQuarantine();
    await options.beforeRemove?.(paths);
    await validateOwnedQuarantine();
    // Node has no portable fd-relative recursive removal. Identity validation
    // immediately before this final syscall minimizes the remaining local race.
    await removeOperation(quarantine, { force: true, recursive: true });
  } catch (error) {
    const restored = await restoreWhenOwned();
    const disposition = restored
      ? "original cache restored"
      : `manual quarantine inspection may be required at ${quarantine}`;
    throw new Error(`E2E optimizer cleanup failed; ${disposition}`, {
      cause: error,
    });
  }
  return true;
};
