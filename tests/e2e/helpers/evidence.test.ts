import { createHash } from "node:crypto";
import {
  access,
  chmod,
  mkdir,
  lstat,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";

import type { Page, TestInfo } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";

import {
  discardEvidenceArtifacts,
  evidenceArtifactsFor,
  screenshotArtifactPath,
} from "./artifacts";
import { publishEvidenceManifest } from "./evidence";
import { createE2ERunPaths } from "./run-artifacts";

let evidenceDirectory: string | undefined;

afterEach(async () => {
  if (evidenceDirectory !== undefined) {
    await rm(evidenceDirectory, { force: true, recursive: true });
    evidenceDirectory = undefined;
  }
});

describe("success evidence manifest", () => {
  it("publishes run-scoped metadata and artifact SHA-256 without tracked docs", async () => {
    const runId = `evidence_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      project: { name: "chromium" },
      retry: 0,
      testId: "evidence-contract",
      title: "captures the public foundation",
    } as TestInfo;
    const screenshotPath = await screenshotArtifactPath(
      testInfo,
      "foundation.png"
    );
    const screenshot = Buffer.from("deterministic screenshot evidence");
    await writeFile(screenshotPath, screenshot);
    const page = {
      evaluate: async () => ({ mode: "dark", palette: "slate" }),
      url: () =>
        "https://darkfactory.localhost/api/auth/reset-password/private-token?token=private",
      viewportSize: () => ({ height: 900, width: 1440 }),
    } as unknown as Page;

    await publishEvidenceManifest({
      context: { persona: "anonymous", state: "ready" },
      page,
      testInfo,
    });

    const manifestNames = await readdir(`${paths.evidence}/manifests`);
    expect(manifestNames).toHaveLength(1);
    const manifest = JSON.parse(
      await readFile(`${paths.evidence}/manifests/${manifestNames[0]}`, "utf8")
    ) as {
      artifacts: Array<{ path: string; sha256: string }>;
      context: { route: string; viewport: { height: number; width: number } };
      runId: string;
    };
    expect(manifest.runId).toBe(runId);
    expect(manifest.context).toMatchObject({
      route: "/api/auth/reset-password/[redacted]",
      viewport: { height: 900, width: 1440 },
    });
    expect(manifest.artifacts).toEqual([
      {
        kind: "screenshots",
        path: "evidence-contract-0/screenshots/foundation.png",
        sha256: createHash("sha256").update(screenshot).digest("hex"),
      },
    ]);
  });

  it("discards explicit artifacts from an unsuccessful attempt", async () => {
    const runId = `evidence_failure_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      retry: 0,
      testId: "failed-evidence-contract",
    } as TestInfo;
    const screenshotPath = await screenshotArtifactPath(testInfo, "failed.png");
    await writeFile(screenshotPath, "failed attempt", "utf8");

    await discardEvidenceArtifacts(testInfo);

    await expect(access(screenshotPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("rolls back artifacts and registry when manifest creation fails", async () => {
    const runId = `evidence_publish_failure_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      project: { name: "chromium" },
      retry: 0,
      testId: "publish-failure-contract",
      title: "publication failure",
    } as TestInfo;
    const screenshotPath = await screenshotArtifactPath(
      testInfo,
      "publication-failure.png"
    );
    await writeFile(screenshotPath, "must be rolled back", "utf8");
    const manifestsDirectory = `${paths.evidence}/manifests`;
    await mkdir(manifestsDirectory, { recursive: true });
    await chmod(manifestsDirectory, 0o500);
    const page = {
      evaluate: async () => ({ mode: "dark", palette: "slate" }),
      url: () => "https://darkfactory.localhost/",
      viewportSize: () => ({ height: 900, width: 1440 }),
    } as unknown as Page;

    await expect(
      publishEvidenceManifest({
        context: { persona: "anonymous", state: "ready" },
        page,
        testInfo,
      })
    ).rejects.toThrowError("Evidence publication failed.");

    await chmod(manifestsDirectory, 0o700);
    await expect(access(screenshotPath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(evidenceArtifactsFor(testInfo)).toEqual([]);
    expect(await readdir(manifestsDirectory)).toEqual([]);
  });

  it("retains a non-file artifact entry until safe cleanup can retry", async () => {
    const runId = `evidence_cleanup_failure_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      project: { name: "chromium" },
      retry: 0,
      testId: "cleanup-failure-contract",
      title: "cleanup failure",
    } as TestInfo;
    const screenshotPath = await screenshotArtifactPath(
      testInfo,
      "unexpected-directory.png"
    );
    await mkdir(screenshotPath);
    const page = {
      evaluate: async () => ({ mode: "dark", palette: "slate" }),
      url: () => "https://darkfactory.localhost/",
      viewportSize: () => ({ height: 900, width: 1440 }),
    } as unknown as Page;

    await expect(
      publishEvidenceManifest({
        context: { persona: "anonymous", state: "ready" },
        page,
        testInfo,
      })
    ).rejects.toThrowError("Evidence publication cleanup failed.");

    expect((await lstat(screenshotPath)).isDirectory()).toBe(true);
    expect(evidenceArtifactsFor(testInfo)).toEqual([
      { kind: "screenshots", path: screenshotPath },
    ]);
    await expect(access(`${paths.evidence}/manifests`)).rejects.toMatchObject({
      code: "ENOENT",
    });

    await rm(screenshotPath, { force: true, recursive: true });
    await discardEvidenceArtifacts(testInfo);
    expect(evidenceArtifactsFor(testInfo)).toEqual([]);
  });
});
