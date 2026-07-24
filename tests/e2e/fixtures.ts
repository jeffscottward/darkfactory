import {
  expect as playwrightExpect,
  test as base,
  type ConsoleMessage,
  type Page,
  type Response,
} from "@playwright/test";

import {
  BrowserErrorCollector,
  type ExpectedBrowserMessage,
  type ExpectedHttpError,
} from "./helpers/browser-errors";
import {
  publishEvidenceManifest,
  type EvidenceContext,
} from "./helpers/evidence";
import {
  discardEvidenceArtifacts,
  ensureStructuredEvidence,
} from "./helpers/artifacts";

const DEVELOPMENT_PASSWORD = "Development123!";

export type E2EIdentity = Readonly<{
  accountId: string;
  email: string;
  id: string;
  name: string;
  password: string;
  role: "admin" | "member";
}>;

export const E2E_IDENTITIES = Object.freeze({
  admin: Object.freeze({
    accountId: "10000000-0000-4000-8000-000000000001",
    email: "admin@domain.test",
    id: "00000000-0000-4000-8000-000000000001",
    name: "Admin User",
    password: DEVELOPMENT_PASSWORD,
    role: "admin",
  }),
  alice: Object.freeze({
    accountId: "10000000-0000-4000-8000-000000000002",
    email: "alice@domain.test",
    id: "00000000-0000-4000-8000-000000000002",
    name: "Alice Adams",
    password: DEVELOPMENT_PASSWORD,
    role: "member",
  }),
  bob: Object.freeze({
    accountId: "10000000-0000-4000-8000-000000000003",
    email: "bob@domain.test",
    id: "00000000-0000-4000-8000-000000000003",
    name: "Bob Baker",
    password: DEVELOPMENT_PASSWORD,
    role: "member",
  }),
} satisfies Record<string, E2EIdentity>);

export const signInAs = async (
  page: Page,
  identity: E2EIdentity
): Promise<void> => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address", { exact: true }).fill(identity.email);
  await page.getByLabel("Password", { exact: true }).fill(identity.password);

  const responsePromise = page.waitForResponse((response: Response) => {
    const url = new URL(response.url());
    return (
      response.request().method() === "POST" &&
      url.pathname === "/api/auth/sign-in/email"
    );
  });
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const response = await responsePromise;
  playwrightExpect(response.ok()).toBe(true);
  await playwrightExpect(page).toHaveURL(
    (url) => url.pathname === "/dashboard"
  );
  await playwrightExpect(
    page.getByRole("heading", { level: 1, name: "Dashboard" })
  ).toBeVisible();
};

export type BrowserErrorGuard = Readonly<{
  allowConsoleError: (rule: ExpectedBrowserMessage) => void;
  allowHttpError: (rule: ExpectedHttpError) => void;
  allowPageError: (rule: ExpectedBrowserMessage) => void;
}>;

export type EvidenceRecorder = Readonly<{
  describe: (context: Partial<EvidenceContext>) => void;
  snapshot: () => EvidenceContext;
}>;

type E2EFixtures = Readonly<{
  browserErrors: BrowserErrorGuard;
  evidence: EvidenceRecorder;
}>;

const currentPathname = (page: Page): string => {
  try {
    return new URL(page.url()).pathname;
  } catch {
    return "/";
  }
};

export const test = base.extend<E2EFixtures>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright requires object destructuring to discover fixture dependencies.
  evidence: async ({}, use, _testInfo) => {
    let context: EvidenceContext = {
      persona: "anonymous",
      state: "ready",
    };
    await use({
      describe: (nextContext) => {
        context = { ...context, ...nextContext };
      },
      snapshot: () => context,
    });
  },
  browserErrors: [
    async ({ baseURL, evidence, page }, use, testInfo) => {
      if (testInfo.repeatEachIndex > 0) {
        throw new Error(
          "DB-backed E2E journeys do not support --repeat-each; start a fresh run instead."
        );
      }
      const collector = new BrowserErrorCollector(
        [],
        baseURL === undefined ? {} : { sourceOrigin: new URL(baseURL).origin }
      );
      const onConsole = (message: ConsoleMessage): void => {
        collector.recordConsole(
          message.type(),
          message.text(),
          currentPathname(page)
        );
      };
      const onPageError = (error: Error): void => {
        collector.recordPageError(error, currentPathname(page));
      };
      const onResponse = (response: Response): void => {
        collector.recordResponse({
          method: response.request().method(),
          status: response.status(),
          url: response.url(),
        });
      };

      page.on("console", onConsole);
      page.on("pageerror", onPageError);
      page.on("response", onResponse);
      try {
        await use(collector);
      } finally {
        page.off("console", onConsole);
        page.off("pageerror", onPageError);
        page.off("response", onResponse);
      }

      const failures = collector.failures();
      if (failures.length > 0) {
        await discardEvidenceArtifacts(testInfo);
        throw new Error(
          `Browser emitted unexpected errors:\n${failures.join("\n")}`
        );
      }
      if (
        testInfo.status === "passed" &&
        testInfo.expectedStatus === "passed"
      ) {
        const context = evidence.snapshot();
        try {
          await ensureStructuredEvidence({ context, page, testInfo });
          await publishEvidenceManifest({ context, page, testInfo });
        } catch {
          try {
            await discardEvidenceArtifacts(testInfo);
          } catch {
            throw new Error("Evidence finalization cleanup failed.");
          }
          throw new Error("Evidence finalization failed.");
        }
      } else {
        await discardEvidenceArtifacts(testInfo);
      }
    },
    { auto: true },
  ],
});

// biome-ignore lint/performance/noBarrelFile: The central Playwright fixture intentionally exposes its shared helpers.
export { expect } from "@playwright/test";
export {
  axeArtifactPath,
  expectNoThemeFlash,
  installFirstPaintProbe,
  screenshotArtifactPath,
} from "./helpers/artifacts";
export {
  waitForContactPreview,
  waitForPreviewLink,
} from "./helpers/preview-email";
export type {
  ExpectedBrowserMessage,
  ExpectedHttpError,
} from "./helpers/browser-errors";
export type {
  PreviewOperation,
  PreviewRecipient,
} from "./helpers/preview-email";
