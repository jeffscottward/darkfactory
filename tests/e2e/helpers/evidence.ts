import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { link, mkdir, open, readFile, rm } from "node:fs/promises";
import { dirname, relative } from "node:path";

import type { Page, TestInfo } from "@playwright/test";

import {
  consumeEvidenceArtifacts,
  discardEvidenceArtifacts,
  evidenceArtifactsFor,
  type EvidenceArtifact,
} from "./artifacts";
import { e2eRunPathsFromEnvironment } from "./run-artifacts";

const RESET_TOKEN_PATH_PATTERN = /^(\/api\/auth\/reset-password\/)[^/]+$/u;
const SAFE_FILE_NAME_PATTERN = /[^a-zA-Z0-9._-]+/gu;
export type EvidenceContext = Readonly<{
  persona: "admin" | "anonymous" | "member";
  state: "ready";
}>;

const gitFingerprint = (revision: "HEAD" | "HEAD^{tree}"): string => {
  try {
    return execFileSync("git", ["rev-parse", revision], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unavailable";
  }
};

const hashArtifact = async (
  artifact: EvidenceArtifact,
  evidenceRoot: string
): Promise<
  Readonly<{
    kind: EvidenceArtifact["kind"];
    path: string;
    sha256: string;
  }>
> => {
  const content = await readFile(artifact.path);
  return Object.freeze({
    kind: artifact.kind,
    path: relative(evidenceRoot, artifact.path),
    sha256: createHash("sha256").update(content).digest("hex"),
  });
};

const safeRoute = (urlValue: string): string => {
  const url = new URL(urlValue);
  return url.pathname.replace(RESET_TOKEN_PATH_PATTERN, "$1[redacted]");
};

export const publishEvidenceManifest = async ({
  context,
  page,
  testInfo,
}: {
  readonly context: EvidenceContext;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<void> => {
  const runPaths = e2eRunPathsFromEnvironment();
  const safeTestId = `${testInfo.testId}-${testInfo.retry}`.replaceAll(
    SAFE_FILE_NAME_PATTERN,
    "-"
  );
  const manifestPath = `${runPaths.evidence}/manifests/${safeTestId}.json`;
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  let manifestPublished = false;
  try {
    const artifactRecords = evidenceArtifactsFor(testInfo);
    const artifacts = await Promise.all(
      artifactRecords.map((artifact) =>
        hashArtifact(artifact, runPaths.evidence)
      )
    );
    const theme = await page.evaluate(() => ({
      mode: document.documentElement.dataset["mode"] ?? "unknown",
      palette: document.documentElement.dataset["palette"] ?? "unknown",
    }));
    const manifest = {
      version: 1,
      runId: runPaths.runId,
      commit: gitFingerprint("HEAD"),
      tree: gitFingerprint("HEAD^{tree}"),
      test: {
        id: testInfo.testId,
        project: testInfo.project.name,
        retry: testInfo.retry,
        title: testInfo.title,
      },
      context: {
        persona: context.persona,
        route: safeRoute(page.url()),
        state: context.state,
        theme,
        viewport: page.viewportSize(),
      },
      artifacts,
    } as const;
    await mkdir(dirname(manifestPath), { recursive: true });
    const handle = await open(temporaryPath, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await link(temporaryPath, manifestPath);
    manifestPublished = true;
    await rm(temporaryPath, { force: true });
    consumeEvidenceArtifacts(testInfo);
  } catch {
    const cleanupResults = await Promise.allSettled([
      discardEvidenceArtifacts(testInfo),
      rm(temporaryPath, { force: true }),
      ...(manifestPublished ? [rm(manifestPath, { force: true })] : []),
    ]);
    if (cleanupResults.some((result) => result.status === "rejected")) {
      throw new Error("Evidence publication cleanup failed.");
    }
    throw new Error("Evidence publication failed.");
  }
};
