import { randomUUID } from "node:crypto";
import { open, readFile, rm, type FileHandle } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const LOCK_FILE_MODE = 0o600;

const defaultLockPath = (): string => {
  const userId = process.getuid?.() ?? "unknown";
  return join(tmpdir(), `darkfactory-portless-darkfactory-${userId}.lock`);
};

const isErrno = (error: unknown, code: string): boolean =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

const processExists = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (isErrno(error, "ESRCH")) {
      return false;
    }
    throw error;
  }
};

type OwnerRecord = Readonly<{ nonce: string; pid: number }>;

declare const routeOwnerBrand: unique symbol;
export type RouteOwnerLock = Readonly<{
  lockPath: string;
  nonce: string;
  pid: number;
  readonly [routeOwnerBrand]: true;
}>;

const activeLocks = new WeakMap<object, FileHandle>();

const readOwner = async (
  lockPath: string
): Promise<OwnerRecord | undefined> => {
  try {
    const parsed = JSON.parse(
      await readFile(lockPath, "utf8")
    ) as Partial<OwnerRecord>;
    return typeof parsed.pid === "number" && typeof parsed.nonce === "string"
      ? { nonce: parsed.nonce, pid: parsed.pid }
      : undefined;
  } catch {
    return undefined;
  }
};

const existingOwnerError = async (lockPath: string): Promise<Error> => {
  const owner = await readOwner(lockPath);
  if (owner !== undefined && processExists(owner.pid)) {
    return new Error("Canonical darkfactory Portless route is already owned.");
  }
  return new Error(
    "Stale canonical Portless route lock requires explicit cleanup."
  );
};

export const acquireRouteOwnerLock = async ({
  lockPath = defaultLockPath(),
}: {
  readonly lockPath?: string;
} = {}): Promise<RouteOwnerLock> => {
  let handle: FileHandle;
  try {
    handle = await open(lockPath, "wx", LOCK_FILE_MODE);
  } catch (error) {
    if (isErrno(error, "EEXIST")) {
      throw await existingOwnerError(lockPath);
    }
    throw error;
  }

  const owner = { nonce: randomUUID(), pid: process.pid };
  const lock = { ...owner, lockPath } as RouteOwnerLock;
  try {
    await handle.writeFile(JSON.stringify(owner), "utf8");
    await handle.sync();
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(lockPath, { force: true });
    throw error;
  }

  activeLocks.set(lock, handle);
  return lock;
};

export const releaseRouteOwnerLock = async (
  lock: RouteOwnerLock
): Promise<void> => {
  const handle = activeLocks.get(lock);
  if (handle === undefined) {
    throw new Error("Refusing to release an unowned Portless route lock.");
  }

  const owner = await readOwner(lock.lockPath);
  if (owner?.pid !== lock.pid || owner.nonce !== lock.nonce) {
    throw new Error("Portless route lock ownership changed before release.");
  }

  await handle.close();
  await rm(lock.lockPath);
  activeLocks.delete(lock);
};
