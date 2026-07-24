import { constants, type Stats } from "node:fs";
import { lstat, mkdir, open, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { expect, type Page, type TestInfo } from "@playwright/test";

import { e2eRunPathsFromEnvironment } from "./run-artifacts";

const SAFE_ARTIFACT_NAME_PATTERN = /[^a-zA-Z0-9._-]+/gu;
const TRIM_UNSAFE_EDGES_PATTERN = /^[.-]+|[.-]+$/gu;
const STRUCTURED_TITLE_PATTERN = /[^A-Za-z0-9 .,:;!?()'/_-]+/gu;
const STRUCTURED_PATH_PATTERN =
  /^\/(?!.*(?:^|\/)\.{1,2}(?:\/|$))[^\\?#\u0000-\u001F]{0,511}$/u;
const STRUCTURED_MAX_BYTES = 16 * 1024;
const STRUCTURED_LIMIT = 16_384;
const COUNT_LIMIT = 10_000;

type EvidenceArtifactKind = "axe" | "screenshots" | "structured";

export type EvidenceArtifact = Readonly<{
  kind: EvidenceArtifactKind;
  path: string;
}>;

export type FirstPaintSample = Readonly<{
  backgroundColor: string;
  mode: string;
  palette: string;
}>;

interface FirstPaintProbeState {
  observer?: MutationObserver;
  painted: boolean;
  samples: FirstPaintSample[];
}

const evidenceArtifacts = new Map<string, EvidenceArtifact[]>();

export const evidenceArtifactsFor = (
  testInfo: TestInfo
): readonly EvidenceArtifact[] =>
  Object.freeze([...(evidenceArtifacts.get(testInfo.testId) ?? [])]);

export const consumeEvidenceArtifacts = (
  testInfo: TestInfo
): readonly EvidenceArtifact[] => {
  const artifacts = evidenceArtifactsFor(testInfo);
  evidenceArtifacts.delete(testInfo.testId);
  return Object.freeze([...artifacts]);
};

const isErrno = (error: unknown, code: string): boolean =>
  error !== null &&
  typeof error === "object" &&
  "code" in error &&
  error.code === code;

const removeRegularArtifact = async (path: string): Promise<void> => {
  let before: Stats;
  try {
    before = await lstat(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  if (!before.isFile() || before.isSymbolicLink()) {
    throw new Error("Evidence artifact is not an owned regular file.");
  }
  const handle = await open(
    path,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0)
  );
  try {
    const opened = await handle.stat();
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("Evidence artifact identity changed before cleanup.");
    }
    await unlink(path);
  } finally {
    await handle.close();
  }
  try {
    await lstat(path);
  } catch (error) {
    if (isErrno(error, "ENOENT")) {
      return;
    }
    throw error;
  }
  throw new Error("Evidence artifact path was replaced during cleanup.");
};

export const discardEvidenceArtifacts = async (
  testInfo: TestInfo
): Promise<void> => {
  const artifacts = evidenceArtifactsFor(testInfo);
  const results = await Promise.allSettled(
    artifacts.map(({ path }) => removeRegularArtifact(path))
  );
  const retained = artifacts.filter(
    (_, index) => results[index]?.status === "rejected"
  );
  if (retained.length === 0) {
    evidenceArtifacts.delete(testInfo.testId);
  } else {
    evidenceArtifacts.set(testInfo.testId, [...retained]);
    throw new Error("Evidence artifact cleanup failed.");
  }
};

const artifactPath = async (
  testInfo: TestInfo,
  kind: EvidenceArtifactKind,
  name: string
): Promise<string> => {
  const safeName = name
    .replaceAll(SAFE_ARTIFACT_NAME_PATTERN, "-")
    .replaceAll(TRIM_UNSAFE_EDGES_PATTERN, "");
  if (safeName.length === 0) {
    throw new TypeError(
      "Artifact name must contain a safe filename character."
    );
  }

  const testDirectory = `${testInfo.testId}-${testInfo.retry}`.replaceAll(
    SAFE_ARTIFACT_NAME_PATTERN,
    "-"
  );
  const path = join(
    e2eRunPathsFromEnvironment().evidence,
    testDirectory,
    kind,
    safeName
  );
  await mkdir(dirname(path), { recursive: true });
  const artifacts = evidenceArtifacts.get(testInfo.testId) ?? [];
  artifacts.push(Object.freeze({ kind, path }));
  evidenceArtifacts.set(testInfo.testId, artifacts);
  return path;
};

export const screenshotArtifactPath = (
  testInfo: TestInfo,
  name: string
): Promise<string> => artifactPath(testInfo, "screenshots", name);

export const axeArtifactPath = (
  testInfo: TestInfo,
  name: string
): Promise<string> => artifactPath(testInfo, "axe", name);

const boundedInteger = (value: number, maximum: number): number =>
  Number.isFinite(value)
    ? Math.min(maximum, Math.max(0, Math.trunc(value)))
    : 0;

const structuredPathname = (urlValue: string): string => {
  const pathname = new URL(urlValue).pathname
    .replace(/^(\/api\/auth\/reset-password\/)[^/]+$/u, "$1[redacted]")
    .replace(/^(\/(?:api\/auth\/)?verify-email\/)[^/]+$/u, "$1[redacted]");
  if (!STRUCTURED_PATH_PATTERN.test(pathname)) {
    throw new Error("Structured evidence route is invalid.");
  }
  return pathname;
};

export const ensureStructuredEvidence = async ({
  context,
  page,
  testInfo,
}: {
  readonly context: Readonly<{
    persona: "admin" | "anonymous" | "member";
    state: "ready";
  }>;
  readonly page: Page;
  readonly testInfo: TestInfo;
}): Promise<void> => {
  if (evidenceArtifactsFor(testInfo).length > 0) {
    return;
  }
  const observed = await page.evaluate(() => {
    const focused = document.activeElement;
    return {
      counts: {
        controls: document.querySelectorAll("a,button,input,select,textarea")
          .length,
        headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
        landmarks: document.querySelectorAll(
          "header,nav,main,footer,aside,[role=banner],[role=navigation],[role=main],[role=contentinfo],[role=complementary]"
        ).length,
      },
      document: {
        clientHeight: document.documentElement.clientHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollHeight: document.documentElement.scrollHeight,
        scrollWidth: document.documentElement.scrollWidth,
      },
      focus: {
        role: focused instanceof Element ? focused.getAttribute("role") : null,
        tag:
          focused instanceof Element ? focused.tagName.toLowerCase() : "body",
      },
    };
  });
  const allowedTags = new Set([
    "a",
    "body",
    "button",
    "input",
    "select",
    "textarea",
  ]);
  const allowedRoles = new Set([
    "button",
    "checkbox",
    "combobox",
    "link",
    "menuitem",
    "radio",
    "tab",
    "textbox",
  ]);
  const viewport = page.viewportSize();
  if (viewport === null) {
    throw new Error("Structured evidence requires a viewport.");
  }
  const title =
    testInfo.title
      .replaceAll(STRUCTURED_TITLE_PATTERN, " ")
      .replaceAll(/\s+/gu, " ")
      .trim()
      .slice(0, 160) || "e2e journey";
  let focusRole: string | null = "other";
  if (observed.focus.role === null) {
    focusRole = null;
  } else if (allowedRoles.has(observed.focus.role)) {
    focusRole = observed.focus.role;
  }
  const evidence = {
    version: 1,
    status: "passed",
    test: { title },
    context,
    route: { pathname: structuredPathname(page.url()) },
    viewport: {
      width: Math.max(1, boundedInteger(viewport.width, STRUCTURED_LIMIT)),
      height: Math.max(1, boundedInteger(viewport.height, STRUCTURED_LIMIT)),
    },
    document: {
      clientWidth: boundedInteger(
        observed.document.clientWidth,
        STRUCTURED_LIMIT
      ),
      clientHeight: boundedInteger(
        observed.document.clientHeight,
        STRUCTURED_LIMIT
      ),
      scrollWidth: boundedInteger(
        observed.document.scrollWidth,
        STRUCTURED_LIMIT
      ),
      scrollHeight: boundedInteger(
        observed.document.scrollHeight,
        STRUCTURED_LIMIT
      ),
    },
    counts: {
      headings: boundedInteger(observed.counts.headings, COUNT_LIMIT),
      landmarks: boundedInteger(observed.counts.landmarks, COUNT_LIMIT),
      controls: boundedInteger(observed.counts.controls, COUNT_LIMIT),
    },
    focus: {
      tag: allowedTags.has(observed.focus.tag) ? observed.focus.tag : "other",
      role: focusRole,
    },
  } as const;
  const content = Buffer.from(`${JSON.stringify(evidence)}\n`, "utf8");
  if (content.length > STRUCTURED_MAX_BYTES) {
    throw new Error("Structured evidence exceeds its size limit.");
  }
  const path = await artifactPath(
    testInfo,
    "structured",
    "structured-evidence.json"
  );
  const handle = await open(
    path,
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      (constants.O_NOFOLLOW ?? 0),
    0o600
  );
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
};

export const installFirstPaintProbe = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const state = window as typeof window & {
      __DARKFACTORY_E2E_PAINT_PROBE__?: FirstPaintProbeState;
    };
    const probe: FirstPaintProbeState = { painted: false, samples: [] };
    state.__DARKFACTORY_E2E_PAINT_PROBE__ = probe;
    const capture = (): void => {
      const root = document.documentElement;
      probe.samples.push({
        backgroundColor: getComputedStyle(root).backgroundColor,
        mode: root.dataset["mode"] ?? "",
        palette: root.dataset["palette"] ?? "",
      });
    };
    probe.observer = new MutationObserver(() => {
      if (probe.painted) {
        capture();
      }
    });
    probe.observer.observe(document.documentElement, {
      attributeFilter: ["class", "data-mode", "data-palette", "style"],
      attributes: true,
    });
    requestAnimationFrame(() => {
      probe.painted = true;
      capture();
    });
  });
};

export const expectNoThemeFlash = async (page: Page): Promise<void> => {
  await page.waitForFunction(() => {
    const state = window as typeof window & {
      __DARKFACTORY_E2E_PAINT_PROBE__?: FirstPaintProbeState;
    };
    return (
      document.readyState === "complete" &&
      (state.__DARKFACTORY_E2E_PAINT_PROBE__?.samples.length ?? 0) > 0
    );
  });
  const samples = await page.evaluate(async () => {
    const state = window as typeof window & {
      __DARKFACTORY_E2E_PAINT_PROBE__?: FirstPaintProbeState;
    };
    await document.fonts?.ready;
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    const probe = state.__DARKFACTORY_E2E_PAINT_PROBE__;
    if (probe === undefined) {
      return [];
    }
    const root = document.documentElement;
    probe.samples.push({
      backgroundColor: getComputedStyle(root).backgroundColor,
      mode: root.dataset["mode"] ?? "",
      palette: root.dataset["palette"] ?? "",
    });
    probe.observer?.disconnect();
    return probe.samples;
  });

  const first = samples[0];
  expect(first).toBeDefined();
  expect(first?.mode).not.toBe("");
  expect(first?.palette).not.toBe("");
  expect(samples).toEqual(samples.map(() => first));
};
