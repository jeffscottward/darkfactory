import {
  access,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";
type SystemFixtureModule = Readonly<{
  encodeOwnedRunAdoption: (proof: unknown) => string;
  finalizeOwnedLifecycleAfterPlaywright: (
    input: Readonly<{
      encodedAdoption: string;
      exitCode: number;
      repositoryPath: string;
      runId: string;
      treeTerminated: boolean;
    }>
  ) => Promise<unknown>;
  prepareOwnedRun: (
    repositoryPath: string,
    runId: string,
    artifactProfile: "anonymous-public-visual" | "no-binary"
  ) => Promise<unknown>;
}>;
// A variable import intentionally exercises the focused Vitest Civet loader.
const systemModulePath = ["../../../scripts/e2e", "system.civet"].join("/");
const {
  encodeOwnedRunAdoption,
  finalizeOwnedLifecycleAfterPlaywright,
  prepareOwnedRun,
} = (await import(systemModulePath)) as SystemFixtureModule;

import {
  assertOwnedE2ERunRootsReady,
  createE2ERunPaths,
  createOwnedE2ELifecycleStateWriter,
  E2E_LIFECYCLE_STATE_FILE_NAME,
  readOwnedE2ELifecycleState,
  removeOwnedE2EPreviewArtifacts,
  removeOwnedE2ERunArtifacts,
  type E2ELifecycleStage,
  type E2ELifecycleStateWriter,
  type E2ERunPaths,
} from "./run-artifacts";

const repositoryRoot = fileURLToPath(new URL("../../../", import.meta.url));
const stages: readonly E2ELifecycleStage[] = [
  "artifact-isolation",
  "module-loading",
  "database-create",
  "database-migrate",
  "database-reset",
  "database-seed",
  "server-spawn",
  "server-probed",
];

const prepareAdoptedPaths = async (name: string): Promise<E2ERunPaths> => {
  const paths = createE2ERunPaths(
    `${name}_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
  const proof = await prepareOwnedRun(repositoryRoot, paths.runId, "no-binary");
  await expect(
    assertOwnedE2ERunRootsReady(paths, encodeOwnedRunAdoption(proof))
  ).resolves.toBe(true);
  return paths;
};
const prepareFinalizerFixture = async (
  name: string
): Promise<Readonly<{ adoption: string; paths: E2ERunPaths }>> => {
  const paths = createE2ERunPaths(
    `${name}_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`
  );
  const proof = await prepareOwnedRun(repositoryRoot, paths.runId, "no-binary");
  const adoption = encodeOwnedRunAdoption(proof);
  await expect(assertOwnedE2ERunRootsReady(paths, adoption)).resolves.toBe(
    true
  );
  return { adoption, paths };
};

const advanceLifecycleToReady = async (
  paths: E2ERunPaths
): Promise<E2ELifecycleStateWriter> => {
  const writer = await createOwnedE2ELifecycleStateWriter(paths);
  for (const stage of stages) {
    await writer.write({ version: 1, status: "starting", stage });
  }
  await writer.write({ version: 1, status: "ready", stage: "server-ready" });
  return writer;
};

const writePlaywrightReport = async (
  paths: E2ERunPaths,
  status: "failed" | "interrupted" | "skipped"
): Promise<void> => {
  await writeFile(
    join(paths.root, "playwright-report.json"),
    JSON.stringify({
      suites: [{ specs: [{ tests: [{ results: [{ status }] }] }] }],
    }),
    { mode: 0o600 }
  );
};

const cleanPaths = async (paths: E2ERunPaths): Promise<void> => {
  await Promise.all([
    removeOwnedE2ERunArtifacts(paths).catch(() => undefined),
    rm(paths.evidence, { force: true, recursive: true }),
  ]);
};

describe("adopted E2E lifecycle state", () => {
  it("persists every startup transition and survives adopted preview cleanup", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_transitions");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "ready",
        stage: "server-ready",
      });
      await mkdir(paths.previews, { recursive: true });
      await writeFile(join(paths.previews, "preview.txt"), "private", "utf8");

      await removeOwnedE2EPreviewArtifacts(paths);

      await expect(access(paths.previews)).rejects.toThrow();
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "ready",
        stage: "server-ready",
      });
      await writer.write({
        version: 1,
        status: "stopped",
        stage: "server-ready",
      });
      const statePath = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
      expect((await lstat(statePath)).mode & 0o777).toBe(0o600);
      expect(JSON.parse(await readFile(statePath, "utf8"))).toEqual({
        version: 1,
        status: "stopped",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("retains the exact failed startup stage and allows cleanup failure escalation", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_failure");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      await writer.write({
        version: 1,
        status: "starting",
        stage: "artifact-isolation",
      });
      await writer.write({
        version: 1,
        status: "starting",
        stage: "module-loading",
      });
      await writer.write({
        version: 1,
        status: "startup-failed",
        stage: "module-loading",
      });
      await writer.write({
        version: 1,
        status: "cleanup-failed",
        stage: "module-loading",
      });

      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "cleanup-failed",
        stage: "module-loading",
      });
      await expect(
        writer.write({
          version: 1,
          status: "starting",
          stage: "database-create",
        })
      ).rejects.toThrow(/transition/i);
    } finally {
      await cleanPaths(paths);
    }
  });
  it("retains a post-readiness runtime failure through cleanup escalation", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_runtime_failure");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "ready",
        stage: "server-ready",
      });
      await writer.write({
        version: 1,
        status: "runtime-failed",
        stage: "server-ready",
      });
      await writer.write({
        version: 1,
        status: "cleanup-failed",
        stage: "server-ready",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "cleanup-failed",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("finalizes an executed test failure after readiness without lifecycle regression", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_failure"
    );
    try {
      await advanceLifecycleToReady(paths);
      await writePlaywrightReport(paths, "failed");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 1,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-ready",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("makes parent runtime failure win after graceful child stop", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_signal"
    );
    try {
      const writer = await advanceLifecycleToReady(paths);
      await writer.write({
        version: 1,
        status: "stopped",
        stage: "server-ready",
      });
      await writePlaywrightReport(paths, "interrupted");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 130,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("preserves a genuine pre-readiness startup failure", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_startup"
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages.filter((stage) => stage !== "server-probed")) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "startup-failed",
        stage: "server-spawn",
      });
      await writePlaywrightReport(paths, "failed");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 1,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "startup-failed",
        stage: "server-spawn",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("promotes a post-probe teardown startup state after executed Playwright failure", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_post_probe"
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "startup-failed",
        stage: "server-probed",
      });
      await writePlaywrightReport(paths, "failed");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 1,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-probed",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-probed",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("preserves cleanup failure after an executed Playwright result", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_cleanup"
    );
    try {
      const writer = await advanceLifecycleToReady(paths);
      await writer.write({
        version: 1,
        status: "cleanup-failed",
        stage: "server-ready",
      });
      await writePlaywrightReport(paths, "failed");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 1,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "cleanup-failed",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("rejects invalid lifecycle state instead of masking it with parent finalization", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_invalid"
    );
    try {
      await advanceLifecycleToReady(paths);
      const statePath = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
      await writeFile(
        statePath,
        '{"version":1,"status":"starting","stage":"server-ready"}\n',
        {
          mode: 0o600,
        }
      );
      await writePlaywrightReport(paths, "failed");
      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 1,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).rejects.toThrow(/schema|invalid/i);
      await expect(readFile(statePath, "utf8")).resolves.toContain(
        '"status":"starting"'
      );
    } finally {
      await cleanPaths(paths);
    }
  });

  it("rejects a replaced state file without following a symlink", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_symlink");
    const outside = join(
      dirname(paths.root),
      `${paths.runId}-outside-lifecycle-state.json`
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      await writer.write({
        version: 1,
        status: "starting",
        stage: "artifact-isolation",
      });
      const statePath = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
      await writeFile(outside, "outside", { mode: 0o600 });
      await rm(statePath);
      await symlink(outside, statePath);

      await expect(
        writer.write({
          version: 1,
          status: "starting",
          stage: "module-loading",
        })
      ).rejects.toThrow(/unsafe|replaced|changed/i);
      await expect(readFile(outside, "utf8")).resolves.toBe("outside");
    } finally {
      await rm(outside, { force: true });
      await cleanPaths(paths);
    }
  });

  it("fails closed on an unsafe write target and leaves no temporary state", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_write_failure");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      const statePath = join(paths.root, E2E_LIFECYCLE_STATE_FILE_NAME);
      await mkdir(statePath);

      await expect(
        writer.write({
          version: 1,
          status: "starting",
          stage: "artifact-isolation",
        })
      ).rejects.toThrow(/unsafe/i);
      const names = await readdir(paths.root);
      expect(
        names.filter((name) =>
          name.startsWith(`.${E2E_LIFECYCLE_STATE_FILE_NAME}.`)
        )
      ).toEqual([]);
    } finally {
      await cleanPaths(paths);
    }
  });
});
