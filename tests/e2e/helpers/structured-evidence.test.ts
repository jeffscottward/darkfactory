import { lstat, readFile, readdir, rm, writeFile } from "node:fs/promises";

import type { Page, TestInfo } from "@playwright/test";
import { afterEach, describe, expect, it } from "vitest";
type ScannerFixtureEntry = Readonly<{
  path: string;
  content: string;
  sha256?: string;
  binary?: "png";
}>;
type ScannerFixtureModule = Readonly<{
  scanArtifactPaths: (
    runId: string,
    additionalPaths: readonly string[],
    dependencies: Readonly<{
      artifactProfile: "anonymous-public-visual";
      collectEntries: () => Promise<readonly ScannerFixtureEntry[]>;
      deadlineMs: number;
      purgeOwnedRun: () => Promise<void>;
    }>
  ) => Promise<Readonly<{ ok: boolean; purged: boolean }>>;
}>;
// A variable import intentionally exercises the focused Vitest Civet loader.
const scannerModulePath = ["../../../scripts/e2e", "scanner.civet"].join("/");
const { scanArtifactPaths } = (await import(
  scannerModulePath
)) as ScannerFixtureModule;

import {
  ensureStructuredEvidence,
  evidenceArtifactsFor,
  screenshotArtifactPath,
} from "./artifacts";
import { publishEvidenceManifest } from "./evidence";
import { createE2ERunPaths } from "./run-artifacts";

const executedPlaywrightReport = (title: string): string =>
  JSON.stringify({
    suites: [
      {
        title,
        specs: [{ tests: [{ results: [{ status: "passed" }] }] }],
      },
    ],
    stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0 },
  });

let evidenceDirectory: string | undefined;

afterEach(async () => {
  if (evidenceDirectory !== undefined) {
    await rm(evidenceDirectory, { force: true, recursive: true });
    evidenceDirectory = undefined;
  }
});

describe("structured E2E evidence", () => {
  it("records bounded behavior without DOM, query, cookie, or input secrets", async () => {
    const runId = `structured_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      project: { name: "chromium" },
      retry: 0,
      testId: "structured-contract",
      title: "home page behavior is ready",
    } as TestInfo;
    const page = {
      evaluate: async () => ({
        counts: { controls: 7, headings: 2, landmarks: 4 },
        document: {
          clientHeight: 900,
          clientWidth: 1440,
          scrollHeight: 1800,
          scrollWidth: 1440,
        },
        focus: { role: "input-private-value", tag: "password" },
      }),
      url: () =>
        "https://darkfactory.localhost/api/auth/reset-password/reset-private-token?token=query-private-token#hash-private-token",
      viewportSize: () => ({ height: 900, width: 1440 }),
      cookieSecret: "session-cookie-private",
      domSecret: "BrowserAuth123!",
    } as unknown as Page;

    await ensureStructuredEvidence({
      context: { persona: "anonymous", state: "ready" },
      page,
      testInfo,
    });

    const registered = evidenceArtifactsFor(testInfo);
    expect(registered).toHaveLength(1);
    expect(registered[0]?.kind).toBe("structured");
    const artifactPath = registered[0]?.path;
    expect(artifactPath).toBeDefined();
    if (artifactPath === undefined) {
      throw new Error("Missing structured artifact.");
    }
    const content = await readFile(artifactPath, "utf8");
    expect(content.length).toBeLessThanOrEqual(16 * 1024);
    for (const secret of [
      "BrowserAuth123!",
      "input-private-value",
      "query-private-token",
      "hash-private-token",
      "session-cookie-private",
      "reset-private-token",
    ]) {
      expect(content).not.toContain(secret);
    }
    expect(JSON.parse(content)).toEqual({
      version: 1,
      status: "passed",
      test: { title: "home page behavior is ready" },
      context: { persona: "anonymous", state: "ready" },
      route: {
        pathname: "/api/auth/reset-password/[redacted]",
      },
      viewport: { width: 1440, height: 900 },
      document: {
        clientWidth: 1440,
        clientHeight: 900,
        scrollWidth: 1440,
        scrollHeight: 1800,
      },
      counts: { headings: 2, landmarks: 4, controls: 7 },
      focus: { tag: "other", role: "other" },
    });
    expect((await lstat(artifactPath)).mode & 0o777).toBe(0o600);

    await publishEvidenceManifest({
      context: { persona: "anonymous", state: "ready" },
      page,
      testInfo,
    });
    const manifestNames = await readdir(`${paths.evidence}/manifests`);
    expect(manifestNames).toHaveLength(1);
    const manifestName = manifestNames[0];
    if (manifestName === undefined) {
      throw new Error("Missing manifest.");
    }
    const manifestText = await readFile(
      `${paths.evidence}/manifests/${manifestName}`,
      "utf8"
    );
    const manifest = JSON.parse(manifestText) as {
      artifacts: Array<{ kind: string; path: string; sha256: string }>;
    };
    const structuredArtifact = manifest.artifacts[0];
    if (structuredArtifact === undefined) {
      throw new Error("Missing structured manifest artifact.");
    }
    const scan = await scanArtifactPaths(runId, [], {
      artifactProfile: "anonymous-public-visual",
      collectEntries: async () => [
        {
          path: `test-results/e2e-runs/${runId}/playwright-report.json`,
          content: executedPlaywrightReport("structured"),
        },
        {
          path: `test-results/evidence/${runId}/manifests/${manifestName}`,
          content: manifestText,
        },
        {
          path: `test-results/evidence/${runId}/${structuredArtifact.path}`,
          content,
          sha256: structuredArtifact.sha256,
        },
      ],
      deadlineMs: 5000,
      purgeOwnedRun: async () => {
        throw new Error("Clean structured evidence must not be purged.");
      },
    });
    expect(scan).toMatchObject({ ok: true, purged: false });
    expect(manifest.artifacts).toEqual([
      expect.objectContaining({ kind: "structured" }),
    ]);
  });

  it("preserves a strict public PNG without adding duplicate structured evidence", async () => {
    const runId = `visual_${process.pid}_${Date.now()}`;
    process.env["E2E_RUN_ID"] = runId;
    const paths = createE2ERunPaths(runId);
    evidenceDirectory = paths.evidence;
    const testInfo = {
      project: { name: "chromium" },
      retry: 0,
      testId: "visual-contract",
      title: "public home visual",
    } as TestInfo;
    const page = {
      evaluate: async () => ({ mode: "light", palette: "default" }),
      url: () => "https://darkfactory.localhost/",
      viewportSize: () => ({ height: 900, width: 1440 }),
    } as unknown as Page;
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZCqsAAAAASUVORK5CYII=",
      "base64"
    );
    const screenshotPath = await screenshotArtifactPath(
      testInfo,
      "public-home.png"
    );
    await writeFile(screenshotPath, png);

    await ensureStructuredEvidence({
      context: { persona: "anonymous", state: "ready" },
      page,
      testInfo,
    });
    expect(evidenceArtifactsFor(testInfo)).toEqual([
      { kind: "screenshots", path: screenshotPath },
    ]);

    await publishEvidenceManifest({
      context: { persona: "anonymous", state: "ready" },
      page,
      testInfo,
    });
    const manifestNames = await readdir(`${paths.evidence}/manifests`);
    expect(manifestNames).toHaveLength(1);
    const manifestName = manifestNames[0];
    if (manifestName === undefined) {
      throw new Error("Missing visual manifest.");
    }
    const manifestText = await readFile(
      `${paths.evidence}/manifests/${manifestName}`,
      "utf8"
    );
    const manifest = JSON.parse(manifestText) as {
      artifacts: Array<{ kind: string; path: string; sha256: string }>;
    };
    expect(manifest.artifacts).toEqual([
      expect.objectContaining({ kind: "screenshots" }),
    ]);
    const screenshotArtifact = manifest.artifacts[0];
    if (screenshotArtifact === undefined) {
      throw new Error("Missing screenshot manifest artifact.");
    }
    expect(png.subarray(0, 8)).toEqual(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    );
    const scan = await scanArtifactPaths(runId, [], {
      artifactProfile: "anonymous-public-visual",
      collectEntries: async () => [
        {
          path: `test-results/e2e-runs/${runId}/playwright-report.json`,
          content: executedPlaywrightReport("visual"),
        },
        {
          path: `test-results/evidence/${runId}/manifests/${manifestName}`,
          content: manifestText,
        },
        {
          path: `test-results/evidence/${runId}/${screenshotArtifact.path}`,
          content: png.toString("base64"),
          sha256: screenshotArtifact.sha256,
          binary: "png",
        },
      ],
      deadlineMs: 5000,
      purgeOwnedRun: async () => {
        throw new Error("Clean visual evidence must not be purged.");
      },
    });
    expect(scan).toMatchObject({ ok: true, purged: false });
  });
});
