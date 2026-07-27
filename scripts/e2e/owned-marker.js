import { constants } from "node:fs";
import { lstat, open } from "node:fs/promises";
import { join } from "node:path";

const invalidMarker = () =>
  new Error("Owned lifecycle marker identity or capability changed");
const invalidRoot = () =>
  new Error("Owned lifecycle root identity or capability changed");

export const requireFileFlag = (flag) => {
  if (!Number.isSafeInteger(flag) || flag <= 0) {
    throw new Error("Required filesystem ownership capability is unavailable");
  }
  return flag;
};

export const rethrowOwnedLifecycleReadError = (error) => {
  if (error?.code === "ENOENT") {
    throw new Error("Owned lifecycle root identity or capability changed", {
      cause: error,
    });
  }
  throw error;
};

export const assertStableOwnedRoot = (before, after) => {
  if (
    before.dev !== after.dev ||
    before.ino !== after.ino ||
    before.mode !== after.mode ||
    before.uid !== after.uid ||
    before.gid !== after.gid ||
    before.nlink !== after.nlink ||
    before.ctimeMs !== after.ctimeMs ||
    before.mtimeMs !== after.mtimeMs
  ) {
    throw invalidRoot();
  }
};

export const assertStableOwnedMarkerRead = (
  expected,
  before,
  after,
  content,
  expectedContent
) => {
  if (
    expected.dev !== after.dev ||
    expected.ino !== after.ino ||
    before.size !== after.size ||
    before.mode !== after.mode ||
    before.uid !== after.uid ||
    before.gid !== after.gid ||
    before.nlink !== after.nlink ||
    before.ctimeMs !== after.ctimeMs ||
    before.mtimeMs !== after.mtimeMs ||
    content !== expectedContent
  ) {
    throw invalidMarker();
  }
};

const closeAfterOwnedOperation = async (
  handle,
  failed,
  primaryError,
  label
) => {
  try {
    await handle.close();
  } catch (closeError) {
    if (failed) {
      throw new AggregateError(
        [primaryError, closeError],
        `Owned lifecycle ${label} operation and close failed`
      );
    }
    throw closeError;
  }
  if (failed) {
    throw primaryError;
  }
};

export const inspectAndCloseOwnedMarker = async (
  marker,
  expected,
  owner,
  expectedContent
) => {
  let failed = false;
  let primaryError;
  try {
    const before = await marker.stat();
    if (
      !before.isFile() ||
      expected.dev !== before.dev ||
      expected.ino !== before.ino ||
      before.size > 512 ||
      before.uid !== owner.uid ||
      before.gid !== owner.gid ||
      before.nlink !== 1 ||
      // biome-ignore lint/suspicious/noBitwiseOperators: verifies POSIX permission bits.
      (before.mode & 0o777) !== 0o600
    ) {
      throw invalidMarker();
    }
    const content = await marker.readFile({ encoding: "utf8" });
    const after = await marker.stat();
    assertStableOwnedMarkerRead(
      expected,
      before,
      after,
      content,
      expectedContent
    );
  } catch (error) {
    failed = true;
    primaryError = error;
  }
  await closeAfterOwnedOperation(marker, failed, primaryError, "marker");
};

export const assertStableOwnedLifecycleRoot = async (
  path,
  ownerFile,
  expected,
  expectedContent,
  assertDirectory
) => {
  let root;
  let failed = false;
  let primaryError;
  try {
    await assertDirectory(path);
    const rootFlags =
      // biome-ignore lint/suspicious/noBitwiseOperators: combines POSIX file flags.
      constants.O_RDONLY |
      requireFileFlag(constants.O_DIRECTORY) |
      requireFileFlag(constants.O_NOFOLLOW);
    root = await open(path, rootFlags);
    const rootBefore = await root.stat();
    if (
      !rootBefore.isDirectory() ||
      // biome-ignore lint/suspicious/noBitwiseOperators: verifies the private root mode.
      (rootBefore.mode & 0o777) !== 0o700 ||
      expected.root.dev !== rootBefore.dev ||
      expected.root.ino !== rootBefore.ino
    ) {
      throw invalidRoot();
    }
    // Node has no portable fd-relative open. This boundary protects against
    // stale/replaced lifecycle artifacts, not hostile same-UID mutation; root
    // and marker identities are pinned and checked again below.
    const marker = await open(
      join(path, ownerFile),
      // biome-ignore lint/suspicious/noBitwiseOperators: combines POSIX file flags.
      constants.O_RDONLY | requireFileFlag(constants.O_NOFOLLOW)
    );
    await inspectAndCloseOwnedMarker(
      marker,
      expected.marker,
      { uid: rootBefore.uid, gid: rootBefore.gid },
      expectedContent
    );
    await assertDirectory(path);
    const [rootAfter, pathAfter] = await Promise.all([
      root.stat(),
      lstat(path),
    ]);
    assertStableOwnedRoot(rootBefore, rootAfter);
    assertStableOwnedRoot(rootBefore, pathAfter);
  } catch (error) {
    failed = true;
    try {
      rethrowOwnedLifecycleReadError(error);
    } catch (translatedError) {
      primaryError = translatedError;
    }
  }
  if (root === undefined) {
    throw primaryError;
  }
  await closeAfterOwnedOperation(root, failed, primaryError, "root");
};
