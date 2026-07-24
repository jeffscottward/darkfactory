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
  status: "failed" | "interrupted" | "passed" | "skipped"
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

  it("serializes concurrent lifecycle state writes in call order", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_serialized_writes");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      const artifactIsolation = writer.write({
        version: 1,
        status: "starting",
        stage: "artifact-isolation",
      });
      const moduleLoading = writer.write({
        version: 1,
        status: "starting",
        stage: "module-loading",
      });

      await expect(
        Promise.all([artifactIsolation, moduleLoading])
      ).resolves.toEqual([undefined, undefined]);
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "starting",
        stage: "module-loading",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("does not publish ready after its state commit is cancelled", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_cancelled_ready");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      const cancellation = new AbortController();
      cancellation.abort(new Error("Readiness cancelled."));

      await expect(
        writer.write(
          { version: 1, status: "ready", stage: "server-ready" },
          { signal: cancellation.signal }
        )
      ).rejects.toThrow(/readiness cancelled/i);
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "starting",
        stage: "server-probed",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("cancels readiness at the final pre-publication check", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_pre_publish_cancel");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      let checks = 0;
      const cancellation = {
        throwIfAborted() {
          checks += 1;
          if (checks === 2) {
            throw new Error("Readiness cancelled before publication.");
          }
        },
      } as AbortSignal;

      await expect(
        writer.write(
          { version: 1, status: "ready", stage: "server-ready" },
          { signal: cancellation }
        )
      ).rejects.toThrow(/cancelled before publication/i);
      expect(checks).toBe(2);
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "starting",
        stage: "server-probed",
      });
      expect(
        (await readdir(paths.root)).some(
          (entry) =>
            entry.startsWith(`.${E2E_LIFECYCLE_STATE_FILE_NAME}.`) &&
            entry.endsWith(".tmp")
        )
      ).toBe(false);
    } finally {
      await cleanPaths(paths);
    }
  });

  it("does not publish a probe observation after its commit is cancelled", async () => {
    const paths = await prepareAdoptedPaths("lifecycle_cancelled_probe");
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages.filter((stage) => stage !== "server-probed")) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      const cancellation = new AbortController();
      cancellation.abort(new Error("Probe observation cancelled."));

      await expect(
        writer.write(
          { version: 1, status: "starting", stage: "server-probed" },
          { signal: cancellation.signal }
        )
      ).rejects.toThrow(/probe observation cancelled/i);
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "starting",
        stage: "server-spawn",
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

  it("preserves an unproven ready state after executed Playwright failure", async () => {
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
        status: "ready",
        stage: "server-ready",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "ready",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("repairs the post-ready Playwright SIGTERM race after a passing run", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_clean_signal"
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages.filter((stage) => stage !== "server-probed")) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "stopped",
        stage: "server-spawn",
      });
      await writePlaywrightReport(paths, "passed");

      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 0,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "stopped",
        stage: "server-ready",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "stopped",
        stage: "server-ready",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("records parent failure from clean spawn-stage shutdown at the same stage", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_clean_failure"
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages.filter((stage) => stage !== "server-probed")) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writer.write({
        version: 1,
        status: "stopped",
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
        status: "runtime-failed",
        stage: "server-spawn",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "runtime-failed",
        stage: "server-spawn",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("preserves an unproven hard-kill starting state for every exit", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_unproven_signal"
    );
    try {
      const writer = await createOwnedE2ELifecycleStateWriter(paths);
      for (const stage of stages.filter((stage) => stage !== "server-probed")) {
        await writer.write({ version: 1, status: "starting", stage });
      }
      await writePlaywrightReport(paths, "passed");

      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 0,
          repositoryPath: repositoryRoot,
          runId: paths.runId,
          treeTerminated: true,
        })
      ).resolves.toEqual({
        version: 1,
        status: "starting",
        stage: "server-spawn",
      });
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
        status: "starting",
        stage: "server-spawn",
      });
    } finally {
      await cleanPaths(paths);
    }
  });

  it("preserves a true startup crash despite a zero Playwright exit", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_true_startup_failure"
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
      await writePlaywrightReport(paths, "passed");

      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 0,
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

  it("preserves a recorded runtime crash despite a zero Playwright exit", async () => {
    const { adoption, paths } = await prepareFinalizerFixture(
      "lifecycle_parent_true_runtime_failure"
    );
    try {
      const writer = await advanceLifecycleToReady(paths);
      await writer.write({
        version: 1,
        status: "runtime-failed",
        stage: "server-ready",
      });
      await writePlaywrightReport(paths, "passed");

      await expect(
        finalizeOwnedLifecycleAfterPlaywright({
          encodedAdoption: adoption,
          exitCode: 0,
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

  it("preserves a spawn-stage startup failure after executed Playwright failure", async () => {
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

  it("preserves a post-probe startup failure after executed Playwright failure", async () => {
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
        status: "startup-failed",
        stage: "server-probed",
      });
      await expect(readOwnedE2ELifecycleState(paths)).resolves.toEqual({
        version: 1,
        status: "startup-failed",
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
