import {
  access,
  lstat,
  mkdir,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";
type SystemFixtureModule = Readonly<{
  encodeOwnedRunAdoption: (proof: unknown) => string;
  prepareOwnedRun: (
    repositoryPath: string,
    runId: string,
    artifactProfile: "anonymous-public-visual" | "no-binary"
  ) => Promise<unknown>;
}>;
// A variable import intentionally exercises the focused Vitest Civet loader.
const systemModulePath = ["../../../scripts/e2e", "system.civet"].join("/");
const { encodeOwnedRunAdoption, prepareOwnedRun } = (await import(
  systemModulePath
)) as SystemFixtureModule;

import {
  assertOwnedE2ERunRootsReady,
  createE2ERunPaths,
  removeOwnedE2EPreviewArtifacts,
  removeOwnedE2ERunArtifacts,
  type E2ERunAdoption,
  type E2ERunPaths,
} from "./run-artifacts";

const OWNER_FILE_NAME = ".darkfactory-e2e-owner.json";
const sharedPreviewDirectory = fileURLToPath(
  new URL("../../../packages/email/previews/", import.meta.url)
);
const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));

const prepareAdoption = async (
  paths: E2ERunPaths
): Promise<
  Readonly<{
    encoded: string;
    e2eMarker: string;
    evidenceMarker: string;
  }>
> => {
  const proof = await prepareOwnedRun(repositoryRoot, paths.runId, "no-binary");
  return Object.freeze({
    e2eMarker: join(paths.root, OWNER_FILE_NAME),
    encoded: encodeOwnedRunAdoption(proof),
    evidenceMarker: join(paths.evidence, OWNER_FILE_NAME),
  });
};

const cleanPaths = async (paths: E2ERunPaths): Promise<void> => {
  await Promise.all([
    removeOwnedE2ERunArtifacts(paths).catch(() => undefined),
    rm(paths.evidence, { force: true, recursive: true }),
  ]);
};

describe("E2E run artifact ownership", () => {
  it("direct invocation starts absent and removes only its branded run root", async () => {
    const runId = `isolation_${process.pid}_${Date.now()}`;
    const owned = createE2ERunPaths(`${runId}_owned`);
    const sibling = createE2ERunPaths(`${runId}_sibling`);
    const sharedSentinel = join(
      sharedPreviewDirectory,
      `developer-sentinel-${runId}.txt`
    );
    await expect(assertOwnedE2ERunRootsReady(owned, undefined)).resolves.toBe(
      false
    );
    await expect(assertOwnedE2ERunRootsReady(sibling, undefined)).resolves.toBe(
      false
    );

    try {
      await mkdir(owned.previews, { recursive: true });
      await mkdir(sibling.previews, { recursive: true });
      await mkdir(sharedPreviewDirectory, { recursive: true });
      await writeFile(join(owned.previews, "owned.txt"), "owned", "utf8");
      await writeFile(join(sibling.previews, "sibling.txt"), "sibling", "utf8");
      await writeFile(sharedSentinel, "developer", "utf8");

      await removeOwnedE2ERunArtifacts(owned);

      await expect(access(owned.root)).rejects.toThrow();
      await expect(
        access(join(sibling.previews, "sibling.txt"))
      ).resolves.toBeUndefined();
      await expect(access(sharedSentinel)).resolves.toBeUndefined();
    } finally {
      await cleanPaths(sibling);
      await rm(sharedSentinel, { force: true });
    }
  });

  it("adopts exact precreated roots and preserves proof markers for scanning", async () => {
    const paths = createE2ERunPaths(`adopt_${process.pid}_${Date.now()}`);
    const proof = await prepareAdoption(paths);
    try {
      await expect(
        assertOwnedE2ERunRootsReady(paths, proof.encoded)
      ).resolves.toBe(true);
      await mkdir(paths.authPreviews, { recursive: true });
      await writeFile(join(paths.authPreviews, "sensitive.txt"), "private");

      await removeOwnedE2EPreviewArtifacts(paths);

      await expect(access(paths.previews)).rejects.toThrow();
      await expect(access(proof.e2eMarker)).resolves.toBeUndefined();
      await expect(access(proof.evidenceMarker)).resolves.toBeUndefined();
    } finally {
      await cleanPaths(paths);
    }
  });

  it("refuses tampered and replaced owner markers", async () => {
    const paths = createE2ERunPaths(`tamper_${process.pid}_${Date.now()}`);
    const proof = await prepareAdoption(paths);
    try {
      await writeFile(proof.e2eMarker, "{}", "utf8");
      await expect(
        assertOwnedE2ERunRootsReady(paths, proof.encoded)
      ).rejects.toThrow(/marker/i);

      const originalMarker = await lstat(proof.e2eMarker);
      const replacementMarker = `${proof.e2eMarker}.replacement`;
      await writeFile(
        replacementMarker,
        Buffer.from(proof.encoded, "base64url"),
        { mode: 0o600 }
      );
      const replacement = await lstat(replacementMarker);
      expect({
        dev: replacement.dev,
        ino: replacement.ino,
      }).not.toEqual({
        dev: originalMarker.dev,
        ino: originalMarker.ino,
      });
      await rename(replacementMarker, proof.e2eMarker);
      const installed = await lstat(proof.e2eMarker);
      expect({ dev: installed.dev, ino: installed.ino }).toEqual({
        dev: replacement.dev,
        ino: replacement.ino,
      });
      await expect(
        assertOwnedE2ERunRootsReady(paths, proof.encoded)
      ).rejects.toThrow(/marker/i);
    } finally {
      await cleanPaths(paths);
    }
  });

  it("refuses stale proofs and unknown preexisting roots", async () => {
    const paths = createE2ERunPaths(`stale_${process.pid}_${Date.now()}`);
    const proof = await prepareAdoption(paths);
    try {
      const stale = JSON.parse(
        Buffer.from(proof.encoded, "base64url").toString("utf8")
      ) as E2ERunAdoption;
      const staleEncoded = Buffer.from(
        JSON.stringify({ ...stale, runId: `${paths.runId}_other` }),
        "utf8"
      ).toString("base64url");
      await expect(
        assertOwnedE2ERunRootsReady(paths, staleEncoded)
      ).rejects.toThrow(/adoption proof/i);
      await expect(
        assertOwnedE2ERunRootsReady(paths, undefined)
      ).rejects.toThrow(/without adoption proof/i);
    } finally {
      await cleanPaths(paths);
    }
  });

  it("refuses symlinked owner markers", async () => {
    const paths = createE2ERunPaths(`symlink_${process.pid}_${Date.now()}`);
    const proof = await prepareAdoption(paths);
    const outside = join(dirname(paths.root), `${paths.runId}-outside-marker`);
    try {
      await writeFile(outside, Buffer.from(proof.encoded, "base64url"), {
        mode: 0o600,
      });
      await rm(proof.e2eMarker);
      await symlink(outside, proof.e2eMarker);
      await expect(
        assertOwnedE2ERunRootsReady(paths, proof.encoded)
      ).rejects.toThrow(/marker/i);
    } finally {
      await cleanPaths(paths);
      await rm(outside, { force: true });
    }
  });
});
