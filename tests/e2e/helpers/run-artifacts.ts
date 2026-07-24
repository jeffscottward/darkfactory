import { randomUUID, timingSafeEqual } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  lstat,
  mkdir,
  open,
  realpath,
  rename,
  rm,
  unlink,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const RUN_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const ADOPTION_PATTERN = /^[A-Za-z0-9_-]{1,2048}$/;
const NONCE_DIGEST_PATTERN = /^[a-f0-9]{64}$/;
const OWNER_FILE_NAME = ".darkfactory-e2e-owner.json";
export const E2E_LIFECYCLE_STATE_FILE_NAME = "lifecycle-state.json";
const LIFECYCLE_STATE_MAX_BYTES = 512;
const LIFECYCLE_STAGES = [
  "artifact-isolation",
  "module-loading",
  "database-create",
  "database-migrate",
  "database-reset",
  "database-seed",
  "server-spawn",
  "server-probed",
  "server-ready",
] as const;
const LIFECYCLE_STATUSES = [
  "starting",
  "ready",
  "startup-failed",
  "runtime-failed",
  "cleanup-failed",
  "stopped",
] as const;
const E2E_RUNS_ROOT = fileURLToPath(
  new URL("../../../test-results/e2e-runs/", import.meta.url)
);
const E2E_EVIDENCE_ROOT = fileURLToPath(
  new URL("../../../test-results/evidence/", import.meta.url)
);

type PathIdentity = Readonly<{ dev: number; ino: number }>;
type RootIdentity = Readonly<{
  marker: PathIdentity;
  root: PathIdentity;
}>;
export type E2ELifecycleStage = (typeof LIFECYCLE_STAGES)[number];
export type E2ELifecycleStatus = (typeof LIFECYCLE_STATUSES)[number];
export type E2ELifecycleState = Readonly<{
  version: 1;
  status: E2ELifecycleStatus;
  stage: E2ELifecycleStage;
}>;
export type E2ELifecycleStateWriteOptions = Readonly<{
  signal?: AbortSignal;
}>;
export type E2ELifecycleStateWriter = Readonly<{
  write: (
    state: E2ELifecycleState,
    options?: E2ELifecycleStateWriteOptions
  ) => Promise<void>;
}>;

export type E2EArtifactProfile = "anonymous-public-visual" | "no-binary";

export type E2ERunAdoption = Readonly<{
  artifactProfile: E2EArtifactProfile;
  e2e: RootIdentity;
  evidence: RootIdentity;
  nonceDigest: string;
  runId: string;
  version: 1;
}>;

export type E2ERunPaths = Readonly<{
  authPreviews: string;
  contactPreviews: string;
  evidence: string;
  previews: string;
  root: string;
  runId: string;
}>;

const ownedRunPaths = new WeakSet<object>();
const adoptedRunRoots = new WeakMap<object, PathIdentity>();

const isErrno = (error: unknown, code: string): boolean =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

const hasExactKeys = (
  value: Record<string, unknown>,
  expected: readonly string[]
): boolean => {
  const actual = Object.keys(value).sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const pathIdentity = (value: unknown): PathIdentity | undefined => {
  if (
    !(
      isRecord(value) &&
      hasExactKeys(value, ["dev", "ino"]) &&
      Number.isSafeInteger(value["dev"])
    ) ||
    Number(value["dev"]) < 0 ||
    !Number.isSafeInteger(value["ino"]) ||
    Number(value["ino"]) < 0
  ) {
    return undefined;
  }
  return Object.freeze({
    dev: Number(value["dev"]),
    ino: Number(value["ino"]),
  });
};

const rootIdentity = (value: unknown): RootIdentity | undefined => {
  if (!(isRecord(value) && hasExactKeys(value, ["marker", "root"]))) {
    return undefined;
  }
  const marker = pathIdentity(value["marker"]);
  const root = pathIdentity(value["root"]);
  return marker === undefined || root === undefined
    ? undefined
    : Object.freeze({ marker, root });
};

const decodeAdoption = (
  encoded: string,
  expectedRunId: string
): Readonly<{ adoption: E2ERunAdoption; canonical: Buffer }> => {
  if (!ADOPTION_PATTERN.test(encoded)) {
    throw new Error("Invalid E2E run adoption proof.");
  }
  const canonical = Buffer.from(encoded, "base64url");
  if (canonical.toString("base64url") !== encoded) {
    throw new Error("Invalid E2E run adoption proof.");
  }
  let value: unknown;
  try {
    value = JSON.parse(canonical.toString("utf8")) as unknown;
  } catch {
    throw new Error("Invalid E2E run adoption proof.");
  }
  if (
    !(
      isRecord(value) &&
      hasExactKeys(value, [
        "artifactProfile",
        "e2e",
        "evidence",
        "nonceDigest",
        "runId",
        "version",
      ])
    ) ||
    value["version"] !== 1 ||
    value["runId"] !== expectedRunId ||
    (value["artifactProfile"] !== "no-binary" &&
      value["artifactProfile"] !== "anonymous-public-visual") ||
    typeof value["nonceDigest"] !== "string" ||
    !NONCE_DIGEST_PATTERN.test(value["nonceDigest"]) ||
    JSON.stringify(value) !== canonical.toString("utf8")
  ) {
    throw new Error("Invalid E2E run adoption proof.");
  }
  const e2e = rootIdentity(value["e2e"]);
  const evidence = rootIdentity(value["evidence"]);
  if (e2e === undefined || evidence === undefined) {
    throw new Error("Invalid E2E run adoption proof.");
  }
  const adoption = Object.freeze({
    artifactProfile: value["artifactProfile"],
    e2e,
    evidence,
    nonceDigest: value["nonceDigest"],
    runId: expectedRunId,
    version: 1 as const,
  });
  return Object.freeze({ adoption, canonical });
};

const sameIdentity = (
  expected: PathIdentity,
  actual: Readonly<{ dev: number; ino: number }>
): boolean => expected.dev === actual.dev && expected.ino === actual.ino;

const assertCanonicalDirectory = async (
  path: string,
  ownerOnly: boolean
): Promise<Stats> => {
  const details = await lstat(path);
  if (
    details.isSymbolicLink() ||
    !details.isDirectory() ||
    (ownerOnly && (details.mode & 0o077) !== 0) ||
    (await realpath(path)) !== path
  ) {
    throw new Error("E2E run adoption directory is unsafe.");
  }
  return details;
};

const assertAncestors = async (root: string): Promise<void> => {
  const category = dirname(root);
  const testResults = dirname(category);
  await assertCanonicalDirectory(testResults, false);
  await assertCanonicalDirectory(category, false);
};

const assertAdoptedRoot = async ({
  canonical,
  expected,
  root,
}: {
  readonly canonical: Buffer;
  readonly expected: RootIdentity;
  readonly root: string;
}): Promise<PathIdentity> => {
  await assertAncestors(root);
  const rootDetails = await assertCanonicalDirectory(root, true);
  if (!sameIdentity(expected.root, rootDetails)) {
    throw new Error("E2E run adoption root identity changed.");
  }
  const markerPath = join(root, OWNER_FILE_NAME);
  const markerDetails = await lstat(markerPath);
  if (
    markerDetails.isSymbolicLink() ||
    !markerDetails.isFile() ||
    (markerDetails.mode & 0o777) !== 0o600 ||
    !sameIdentity(expected.marker, markerDetails)
  ) {
    throw new Error("E2E run adoption marker is unsafe.");
  }
  const marker = await open(
    markerPath,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const opened = await marker.stat();
    if (!sameIdentity(expected.marker, opened)) {
      throw new Error("E2E run adoption marker identity changed.");
    }
    const content = await marker.readFile();
    if (
      content.length !== canonical.length ||
      !timingSafeEqual(content, canonical)
    ) {
      throw new Error("E2E run adoption marker content changed.");
    }
  } finally {
    await marker.close();
  }
  return Object.freeze({ dev: rootDetails.dev, ino: rootDetails.ino });
};

const pathExists = async (path: string): Promise<boolean> => {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
};

export const createE2ERunId = (): string =>
  `${Date.now()}_${process.pid}_${randomUUID()}`;

export const createE2ERunPaths = (runId: string): E2ERunPaths => {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new TypeError(
      "E2E_RUN_ID must contain only safe filename characters."
    );
  }
  const root = join(E2E_RUNS_ROOT, runId);
  const previews = join(root, "previews");
  const paths = Object.freeze({
    authPreviews: join(previews, "auth"),
    contactPreviews: join(previews, "contact"),
    evidence: join(E2E_EVIDENCE_ROOT, runId),
    previews,
    root,
    runId,
  });
  ownedRunPaths.add(paths);
  return paths;
};

export const e2eRunPathsFromEnvironment = (
  environment: Readonly<Record<string, string | undefined>> = process.env
): E2ERunPaths => {
  const runId = environment["E2E_RUN_ID"];
  if (runId === undefined || runId.length === 0) {
    throw new Error("E2E_RUN_ID is required for isolated E2E artifacts.");
  }
  return createE2ERunPaths(runId);
};

export const assertOwnedE2ERunRootsReady = async (
  paths: E2ERunPaths,
  encodedAdoption: string | undefined
): Promise<boolean> => {
  if (!ownedRunPaths.has(paths)) {
    throw new Error("Refusing to inspect unowned E2E run directories.");
  }
  const [rootExists, evidenceExists] = await Promise.all([
    pathExists(paths.root),
    pathExists(paths.evidence),
  ]);
  if (encodedAdoption === undefined) {
    if (rootExists || evidenceExists) {
      throw new Error(
        "E2E run directory already exists without adoption proof."
      );
    }
    return false;
  }
  if (!(rootExists && evidenceExists)) {
    throw new Error("E2E run adoption proof requires both owned roots.");
  }
  const { adoption, canonical } = decodeAdoption(encodedAdoption, paths.runId);
  const [e2eRoot] = await Promise.all([
    assertAdoptedRoot({ canonical, expected: adoption.e2e, root: paths.root }),
    assertAdoptedRoot({
      canonical,
      expected: adoption.evidence,
      root: paths.evidence,
    }),
  ]);
  adoptedRunRoots.set(paths, e2eRoot);
  return true;
};

const assertLifecycleRoot = async (
  paths: E2ERunPaths,
  expected: PathIdentity
): Promise<void> => {
  const details = await assertCanonicalDirectory(paths.root, true);
  if (!sameIdentity(expected, details)) {
    throw new Error("E2E lifecycle state root identity changed.");
  }
};

export const prepareOwnedE2EPreviewDirectories = async (
  paths: E2ERunPaths
): Promise<void> => {
  if (!ownedRunPaths.has(paths)) {
    throw new Error("Refusing to prepare previews for an unowned E2E run.");
  }
  const expectedRoot = adoptedRunRoots.get(paths);
  if (expectedRoot === undefined) {
    throw new Error("E2E preview directories require an adopted run root.");
  }
  await assertLifecycleRoot(paths, expectedRoot);
  try {
    await mkdir(paths.previews, { mode: 0o700 });
    await mkdir(paths.authPreviews, { mode: 0o700 });
    await mkdir(paths.contactPreviews, { mode: 0o700 });
    await Promise.all([
      assertCanonicalDirectory(paths.previews, true),
      assertCanonicalDirectory(paths.authPreviews, true),
      assertCanonicalDirectory(paths.contactPreviews, true),
    ]);
    await assertLifecycleRoot(paths, expectedRoot);
  } catch (error) {
    await rm(paths.previews, { force: true, recursive: true }).catch(
      () => undefined
    );
    throw error;
  }
};

const lifecycleStateValue = (value: unknown): E2ELifecycleState => {
  if (
    !(isRecord(value) && hasExactKeys(value, ["stage", "status", "version"])) ||
    value["version"] !== 1 ||
    !LIFECYCLE_STATUSES.includes(value["status"] as E2ELifecycleStatus) ||
    !LIFECYCLE_STAGES.includes(value["stage"] as E2ELifecycleStage)
  ) {
    throw new Error("E2E lifecycle state is invalid.");
  }
  return Object.freeze({
    version: 1,
    status: value["status"] as E2ELifecycleStatus,
    stage: value["stage"] as E2ELifecycleStage,
  });
};

const lifecycleTransitionAllowed = (
  previous: E2ELifecycleState | undefined,
  next: E2ELifecycleState
): boolean => {
  if (previous === undefined) {
    return next.status === "starting" && next.stage === "artifact-isolation";
  }
  if (previous.status === "starting") {
    if (
      next.status === "startup-failed" ||
      next.status === "cleanup-failed" ||
      next.status === "stopped"
    ) {
      return next.stage === previous.stage;
    }
    if (next.status === "ready") {
      return (
        previous.stage === "server-probed" && next.stage === "server-ready"
      );
    }
    const previousIndex = LIFECYCLE_STAGES.indexOf(previous.stage);
    return (
      next.status === "starting" &&
      next.stage !== "server-ready" &&
      LIFECYCLE_STAGES.indexOf(next.stage) === previousIndex + 1
    );
  }
  if (previous.status === "ready") {
    return (
      next.stage === "server-ready" &&
      (next.status === "stopped" ||
        next.status === "runtime-failed" ||
        next.status === "cleanup-failed")
    );
  }
  return (
    (previous.status === "startup-failed" ||
      previous.status === "runtime-failed") &&
    next.status === "cleanup-failed" &&
    next.stage === previous.stage
  );
};

const readLifecycleStateFile = async (
  paths: E2ERunPaths,
  expectedRoot: PathIdentity
): Promise<
  Readonly<{ identity: PathIdentity; state: E2ELifecycleState }> | undefined
> => {
  await assertLifecycleRoot(paths, expectedRoot);
  const path = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
  let details: Stats;
  try {
    details = await lstat(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return undefined;
    }
    throw error;
  }
  if (
    details.isSymbolicLink() ||
    !details.isFile() ||
    (details.mode & 0o777) !== 0o600 ||
    details.size < 1 ||
    details.size > LIFECYCLE_STATE_MAX_BYTES
  ) {
    throw new Error("E2E lifecycle state file is unsafe.");
  }
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const opened = await handle.stat();
    if (
      !(sameIdentity(details, opened) && opened.isFile()) ||
      opened.size !== details.size
    ) {
      throw new Error("E2E lifecycle state identity changed.");
    }
    const content = await handle.readFile({ encoding: "utf8" });
    const after = await handle.stat();
    if (
      !sameIdentity(opened, after) ||
      after.size !== opened.size ||
      Buffer.byteLength(content, "utf8") !== after.size
    ) {
      throw new Error("E2E lifecycle state changed while reading.");
    }
    let value: unknown;
    try {
      value = JSON.parse(content) as unknown;
    } catch {
      throw new Error("E2E lifecycle state is invalid.");
    }
    return Object.freeze({
      identity: Object.freeze({ dev: after.dev, ino: after.ino }),
      state: lifecycleStateValue(value),
    });
  } finally {
    await handle.close();
  }
};

export const readOwnedE2ELifecycleState = async (
  paths: E2ERunPaths
): Promise<E2ELifecycleState | undefined> => {
  const expectedRoot = adoptedRunRoots.get(paths);
  if (expectedRoot === undefined) {
    throw new Error("E2E lifecycle state requires an adopted run root.");
  }
  return (await readLifecycleStateFile(paths, expectedRoot))?.state;
};

export const createOwnedE2ELifecycleStateWriter = async (
  paths: E2ERunPaths
): Promise<E2ELifecycleStateWriter> => {
  const expectedRoot = adoptedRunRoots.get(paths);
  if (expectedRoot === undefined) {
    throw new Error("E2E lifecycle state requires an adopted run root.");
  }
  if ((await readLifecycleStateFile(paths, expectedRoot)) !== undefined) {
    throw new Error("E2E lifecycle state already exists.");
  }
  let previous: E2ELifecycleState | undefined;
  let previousIdentity: PathIdentity | undefined;
  let writeBarrier = Promise.resolve();
  return Object.freeze({
    write: async (
      candidate: E2ELifecycleState,
      options?: E2ELifecycleStateWriteOptions
    ): Promise<void> => {
      const previousWrite = writeBarrier;
      let releaseWrite!: () => void;
      const writeCompleted = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      writeBarrier = previousWrite.then(async () => await writeCompleted);
      await previousWrite;
      try {
        options?.signal?.throwIfAborted();
        const state = lifecycleStateValue(candidate);
        if (!lifecycleTransitionAllowed(previous, state)) {
          throw new Error("E2E lifecycle state transition is invalid.");
        }
        const existing = await readLifecycleStateFile(paths, expectedRoot);
        if (
          (previousIdentity === undefined && existing !== undefined) ||
          (previousIdentity !== undefined &&
            (existing === undefined ||
              !sameIdentity(previousIdentity, existing.identity) ||
              existing.state.status !== previous?.status ||
              existing.state.stage !== previous.stage))
        ) {
          throw new Error("E2E lifecycle state was replaced or changed.");
        }
        const path = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
        const temporaryPath = join(
          paths.root,
          `.${E2E_LIFECYCLE_STATE_FILE_NAME}.${randomUUID()}.tmp`
        );
        let handle: Awaited<ReturnType<typeof open>> | undefined;
        try {
          handle = await open(
            temporaryPath,
            constants.O_CREAT |
              constants.O_EXCL |
              constants.O_WRONLY |
              (constants.O_NOFOLLOW ?? 0),
            0o600
          );
          await handle.writeFile(`${JSON.stringify(state)}\n`, "utf8");
          await handle.sync();
          await handle.close();
          handle = undefined;
          await assertLifecycleRoot(paths, expectedRoot);
          options?.signal?.throwIfAborted();
          await rename(temporaryPath, path);
          const directory = await open(
            paths.root,
            constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
          );
          try {
            await directory.sync();
          } finally {
            await directory.close();
          }
          const persisted = await readLifecycleStateFile(paths, expectedRoot);
          if (
            persisted === undefined ||
            persisted.state.status !== state.status ||
            persisted.state.stage !== state.stage
          ) {
            throw new Error("E2E lifecycle state persistence failed.");
          }
          previous = state;
          previousIdentity = persisted.identity;
        } catch (error) {
          if (handle !== undefined) {
            await handle.close().catch(() => undefined);
          }
          await unlink(temporaryPath).catch((cleanupError: unknown) => {
            if (!isErrno(cleanupError, "ENOENT")) {
              throw new Error("E2E lifecycle state cleanup failed.");
            }
          });
          throw error;
        }
      } finally {
        releaseWrite();
      }
    },
  });
};

export const removeOwnedE2EPreviewArtifacts = async (
  paths: E2ERunPaths
): Promise<void> => {
  if (!ownedRunPaths.has(paths)) {
    throw new Error("Refusing to remove previews from an unowned E2E run.");
  }
  if (!(await pathExists(paths.previews))) {
    return;
  }
  await assertCanonicalDirectory(paths.previews, false);
  await rm(paths.previews, { force: true, recursive: true });
};

export const removeOwnedE2ERunArtifacts = async (
  paths: E2ERunPaths
): Promise<void> => {
  if (!ownedRunPaths.has(paths)) {
    throw new Error("Refusing to remove an unowned E2E run directory.");
  }
  if (await pathExists(paths.root)) {
    await assertCanonicalDirectory(paths.root, false);
    await rm(paths.root, { force: true, recursive: true });
  }
  adoptedRunRoots.delete(paths);
  ownedRunPaths.delete(paths);
};
