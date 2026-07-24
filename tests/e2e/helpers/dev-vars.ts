import { createHash, randomUUID } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  readdir,
  rmdir,
  unlink,
  type FileHandle,
} from "node:fs/promises";
import { join, resolve } from "node:path";

const DEV_VARS_FILE_NAME = ".dev.vars";
const DEV_VARS_LOCK_DIRECTORY = ".dev-vars.lock";
const DEV_VARS_OWNER_FILE = "owner";
const DEV_VARS_MARKER = "# darkfactory-owned-worker-bindings";
const BINDING_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const removedLeases = new WeakSet<OwnedDevVarsLease>();

export type WorkerBindingEnvironment = Readonly<
  Record<string, string | undefined>
>;

export type OwnedDevVarsLease = Readonly<{
  contentSha256: string;
  devVarsDevice: number;
  devVarsInode: number;
  devVarsPath: string;
  lockDevice: number;
  lockInode: number;
  lockPath: string;
  ownerDevice: number;
  ownerInode: number;
  ownerPath: string;
  ownerToken: string;
}>;

type OwnerRecord = Readonly<{
  contentSha256: string;
  devVarsDevice: number;
  devVarsInode: number;
  ownerToken: string;
  pid: number;
}>;

export type DevVarsAcquisitionOperations = Readonly<{
  close: (file: FileHandle) => Promise<void>;
  lstat: typeof lstat;
  stat: (file: FileHandle) => Promise<Stats>;
  sync: (file: FileHandle) => Promise<void>;
  write: (file: FileHandle, content: string) => Promise<void>;
}>;

const DEFAULT_ACQUISITION_OPERATIONS: DevVarsAcquisitionOperations = {
  close: async (file) => file.close(),
  lstat,
  stat: async (file) => file.stat(),
  sync: async (file) => file.sync(),
  write: async (file, content) =>
    file.writeFile(content, "utf8").then(() => undefined),
};

const isFileSystemError = (error: unknown, code: string): boolean =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

const sha256 = (content: string): string =>
  createHash("sha256").update(content).digest("hex");

const sameIdentity = (stats: Stats, device: number, inode: number): boolean =>
  stats.dev === device && stats.ino === inode;

const openNoFollow = async (path: string): Promise<FileHandle> =>
  await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);

const assertPrivateRegularFile = (stats: Stats): void => {
  if (!stats.isFile() || (stats.mode & 0o777) !== 0o600) {
    throw new Error("Worker bindings ownership mismatch");
  }
};

const assertOwnedLock = async (lease: OwnedDevVarsLease): Promise<void> => {
  const lock = await lstat(lease.lockPath);
  if (
    !(
      lock.isDirectory() &&
      sameIdentity(lock, lease.lockDevice, lease.lockInode)
    )
  ) {
    throw new Error("Worker bindings lock ownership mismatch");
  }

  const owner = await openNoFollow(lease.ownerPath);
  try {
    const ownerStats = await owner.stat();
    assertPrivateRegularFile(ownerStats);
    if (!sameIdentity(ownerStats, lease.ownerDevice, lease.ownerInode)) {
      throw new Error("Worker bindings lock ownership mismatch");
    }
    const record = JSON.parse(
      await owner.readFile("utf8")
    ) as Partial<OwnerRecord>;
    if (
      record.ownerToken !== lease.ownerToken ||
      record.devVarsDevice !== lease.devVarsDevice ||
      record.devVarsInode !== lease.devVarsInode ||
      record.contentSha256 !== lease.contentSha256
    ) {
      throw new Error("Worker bindings lock ownership mismatch");
    }
  } finally {
    await owner.close();
  }
};

export const serializeDevVars = (
  environment: WorkerBindingEnvironment,
  bindingNames: readonly string[]
): string => {
  const uniqueNames = new Set<string>();
  const lines: string[] = [];
  for (const name of bindingNames) {
    if (!BINDING_NAME_PATTERN.test(name) || uniqueNames.has(name)) {
      throw new Error("Worker binding allowlist is invalid");
    }
    uniqueNames.add(name);
    const value = environment[name];
    if (value === undefined) {
      throw new Error(`Worker binding ${name} is missing`);
    }
    lines.push(`${name}=${JSON.stringify(value)}`);
  }
  return `${lines.join("\n")}\n`;
};

const removeEmptyOwnedLock = async (lockPath: string): Promise<void> => {
  await rmdir(lockPath);
};

const assertCanonicalDirectory = async (
  path: string,
  message: string
): Promise<Stats> => {
  const stats = await lstat(path);
  if (!stats.isDirectory() || (await realpath(path)) !== resolve(path)) {
    throw new Error(message);
  }
  return stats;
};

const closeForRecovery = async (
  file: FileHandle | undefined
): Promise<void> => {
  if (file === undefined) {
    return;
  }
  await file.close().catch((error) => {
    if (!isFileSystemError(error, "EBADF")) {
      throw error;
    }
  });
};

const cleanupFailedAcquisition = async ({
  devVarsPath,
  devVarsStats,
  lock,
  lockPath,
  operations,
  ownerPath,
  ownerStats,
}: {
  readonly devVarsPath: string;
  readonly devVarsStats: Stats | undefined;
  readonly lock: Stats;
  readonly lockPath: string;
  readonly operations: DevVarsAcquisitionOperations;
  readonly ownerPath: string;
  readonly ownerStats: Stats | undefined;
}): Promise<void> => {
  const currentLock = await operations.lstat(lockPath);
  if (
    !(
      currentLock.isDirectory() && sameIdentity(currentLock, lock.dev, lock.ino)
    )
  ) {
    throw new Error("Worker bindings acquisition cleanup ownership mismatch");
  }

  const currentOwner =
    ownerStats === undefined ? undefined : await operations.lstat(ownerPath);
  const currentDevVars =
    devVarsStats === undefined
      ? undefined
      : await operations.lstat(devVarsPath);
  if (
    (currentOwner !== undefined &&
      (ownerStats === undefined ||
        !(
          sameIdentity(currentOwner, ownerStats.dev, ownerStats.ino) &&
          currentOwner.isFile()
        ) ||
        (currentOwner.mode & 0o777) !== 0o600)) ||
    (currentDevVars !== undefined &&
      (devVarsStats === undefined ||
        !(
          sameIdentity(currentDevVars, devVarsStats.dev, devVarsStats.ino) &&
          currentDevVars.isFile()
        ) ||
        (currentDevVars.mode & 0o777) !== 0o600))
  ) {
    throw new Error("Worker bindings acquisition cleanup ownership mismatch");
  }

  if (currentDevVars !== undefined) {
    if (devVarsStats === undefined) {
      throw new Error("Worker bindings acquisition cleanup ownership mismatch");
    }
    const finalStats = await operations.lstat(devVarsPath);
    if (!sameIdentity(finalStats, devVarsStats.dev, devVarsStats.ino)) {
      throw new Error("Worker bindings acquisition cleanup ownership mismatch");
    }
    await unlink(devVarsPath);
  }
  if (currentOwner !== undefined) {
    if (ownerStats === undefined) {
      throw new Error("Worker bindings acquisition cleanup ownership mismatch");
    }
    const finalStats = await operations.lstat(ownerPath);
    if (!sameIdentity(finalStats, ownerStats.dev, ownerStats.ino)) {
      throw new Error("Worker bindings acquisition cleanup ownership mismatch");
    }
    await unlink(ownerPath);
  }
  if ((await readdir(lockPath)).length !== 0) {
    throw new Error("Worker bindings acquisition cleanup lock is not empty");
  }
  await rmdir(lockPath);
};

export const acquireOwnedDevVars = async ({
  bindingNames,
  environment,
  operations: operationOverrides,
  webDirectory,
}: {
  readonly bindingNames: readonly string[];
  readonly environment: WorkerBindingEnvironment;
  readonly operations?: Partial<DevVarsAcquisitionOperations>;
  readonly webDirectory: string;
}): Promise<OwnedDevVarsLease> => {
  const serialized = serializeDevVars(environment, bindingNames);
  await assertCanonicalDirectory(
    webDirectory,
    "Worker bindings web directory is not canonical"
  );
  const wranglerDirectory = join(webDirectory, ".wrangler");
  const lockPath = join(wranglerDirectory, DEV_VARS_LOCK_DIRECTORY);
  const ownerPath = join(lockPath, DEV_VARS_OWNER_FILE);
  const devVarsPath = join(webDirectory, DEV_VARS_FILE_NAME);
  await mkdir(wranglerDirectory, { recursive: true });
  const wrangler = await assertCanonicalDirectory(
    wranglerDirectory,
    "Worker bindings directory is not canonical"
  );
  try {
    await mkdir(lockPath, { mode: 0o700 });
  } catch (error) {
    if (isFileSystemError(error, "EEXIST")) {
      throw new Error(
        "Worker bindings lock already exists; another owned lifecycle may be active"
      );
    }
    throw error;
  }

  const lock = await assertCanonicalDirectory(
    lockPath,
    "Worker bindings lock ownership mismatch"
  );
  try {
    await lstat(devVarsPath);
    await removeEmptyOwnedLock(lockPath);
    throw new Error("Refusing to replace an existing Worker bindings file");
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      throw error;
    }
  }

  const operations: DevVarsAcquisitionOperations = {
    ...DEFAULT_ACQUISITION_OPERATIONS,
    ...operationOverrides,
  };
  const ownerToken = `${process.pid}:${randomUUID()}`;
  const content = `${DEV_VARS_MARKER}\n# owner=${ownerToken}\n${serialized}`;
  let owner: FileHandle | undefined;
  let ownerStats: Stats | undefined;
  let ownerContent = "";
  let devVars: FileHandle | undefined;
  let devVarsStats: Stats | undefined;
  let lease: OwnedDevVarsLease | undefined;
  const failures: unknown[] = [];
  try {
    owner = await open(ownerPath, "wx", 0o600);
    await owner.chmod(0o600);
    ownerStats = await owner.stat();
    assertPrivateRegularFile(ownerStats);

    devVars = await open(
      devVarsPath,
      constants.O_CREAT |
        constants.O_EXCL |
        constants.O_WRONLY |
        constants.O_NOFOLLOW,
      0o600
    );
    await devVars.chmod(0o600);
    devVarsStats = await devVars.stat();
    assertPrivateRegularFile(devVarsStats);
    await operations.write(devVars, content);
    await operations.sync(devVars);
    const verifiedDevVarsStats = await operations.stat(devVars);
    if (
      !sameIdentity(verifiedDevVarsStats, devVarsStats.dev, devVarsStats.ino)
    ) {
      throw new Error("Worker bindings ownership mismatch");
    }
    const contentSha256 = sha256(content);
    const record: OwnerRecord = {
      contentSha256,
      devVarsDevice: devVarsStats.dev,
      devVarsInode: devVarsStats.ino,
      ownerToken,
      pid: process.pid,
    };
    ownerContent = `${JSON.stringify(record)}\n`;
    await operations.write(owner, ownerContent);
    await operations.sync(owner);
    const verifiedOwnerStats = await operations.stat(owner);
    if (!sameIdentity(verifiedOwnerStats, ownerStats.dev, ownerStats.ino)) {
      throw new Error("Worker bindings lock ownership mismatch");
    }

    const finalWrangler = await assertCanonicalDirectory(
      wranglerDirectory,
      "Worker bindings directory ownership mismatch"
    );
    const finalLock = await assertCanonicalDirectory(
      lockPath,
      "Worker bindings lock ownership mismatch"
    );
    if (
      !(
        sameIdentity(finalWrangler, wrangler.dev, wrangler.ino) &&
        sameIdentity(finalLock, lock.dev, lock.ino)
      )
    ) {
      throw new Error("Worker bindings lock ownership mismatch");
    }

    lease = {
      contentSha256,
      devVarsDevice: devVarsStats.dev,
      devVarsInode: devVarsStats.ino,
      devVarsPath,
      lockDevice: lock.dev,
      lockInode: lock.ino,
      lockPath,
      ownerDevice: ownerStats.dev,
      ownerInode: ownerStats.ino,
      ownerPath,
      ownerToken,
    };
  } catch (error) {
    failures.push(error);
  }

  for (const file of [devVars, owner]) {
    if (file === undefined) {
      continue;
    }
    try {
      await operations.close(file);
    } catch (error) {
      failures.push(error);
      await closeForRecovery(file).catch((recoveryError) => {
        failures.push(recoveryError);
      });
    }
  }

  if (failures.length === 0 && lease !== undefined) {
    return lease;
  }
  try {
    await cleanupFailedAcquisition({
      devVarsPath,
      devVarsStats,
      lock,
      lockPath,
      operations,
      ownerPath,
      ownerStats,
    });
  } catch (cleanupError) {
    failures.push(cleanupError);
  }
  throw new AggregateError(
    failures,
    "Worker bindings acquisition failed; exact owned cleanup was attempted"
  );
};

export const removeOwnedDevVarsFile = async (
  lease: OwnedDevVarsLease
): Promise<void> => {
  if (removedLeases.has(lease)) {
    return;
  }
  await assertOwnedLock(lease);
  let devVars: FileHandle;
  try {
    devVars = await openNoFollow(lease.devVarsPath);
  } catch (error) {
    throw new Error("Worker bindings ownership mismatch", { cause: error });
  }
  try {
    const stats = await devVars.stat();
    assertPrivateRegularFile(stats);
    const content = await devVars.readFile("utf8");
    if (
      !sameIdentity(stats, lease.devVarsDevice, lease.devVarsInode) ||
      sha256(content) !== lease.contentSha256
    ) {
      throw new Error("Worker bindings ownership mismatch");
    }
  } finally {
    await devVars.close();
  }

  const current = await lstat(lease.devVarsPath);
  if (!sameIdentity(current, lease.devVarsDevice, lease.devVarsInode)) {
    throw new Error("Worker bindings ownership mismatch");
  }
  await unlink(lease.devVarsPath);
  removedLeases.add(lease);
};

export const releaseOwnedDevVarsLock = async (
  lease: OwnedDevVarsLease
): Promise<void> => {
  if (!removedLeases.has(lease)) {
    throw new Error(
      "Refusing to release Worker bindings lock before file cleanup"
    );
  }
  await assertOwnedLock(lease);
  const entries = await readdir(lease.lockPath);
  if (entries.length !== 1 || entries[0] !== DEV_VARS_OWNER_FILE) {
    throw new Error("Worker bindings lock directory is not empty");
  }
  await unlink(lease.ownerPath);
  await rmdir(lease.lockPath);
};
