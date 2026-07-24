import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

import type { Page, TestInfo } from "@playwright/test";

import {
  expect,
  screenshotArtifactPath,
  test,
  waitForContactPreview,
} from "./fixtures";

const PUBLIC_ROUTES = [
  {
    heading: "Build the product. Keep the foundation legible.",
    name: "home",
    path: "/",
  },
  {
    heading: "Production structure you can follow end to end.",
    name: "features",
    path: "/features",
  },
  {
    heading: "Example compositions, deliberately not a business model.",
    name: "solutions",
    path: "/solutions",
  },
  {
    heading: "Start from source, not a marketing claim.",
    name: "resources",
    path: "/resources",
  },
  {
    heading: "A foundation should make change easier to reason about.",
    name: "about",
    path: "/about",
  },
  {
    heading: "Talk to the people behind the system.",
    name: "contact",
    path: "/contact",
  },
  {
    heading: "Privacy notice starter",
    name: "privacy",
    path: "/legal/privacy",
  },
  { heading: "Terms of service starter", name: "terms", path: "/legal/terms" },
] as const;

const RESPONSIVE_VIEWPORTS = [
  { height: 812, name: "mobile", width: 375 },
  { height: 1024, name: "tablet", width: 768 },
  { height: 900, name: "compact-desktop", width: 1024 },
  { height: 900, name: "desktop", width: 1440 },
] as const;
const PUBLIC_CAPTURE_PATHS: Readonly<Record<string, true>> = {
  "/": true,
  "/about": true,
  "/contact": true,
  "/error-smoke": true,
  "/features": true,
  "/legal/privacy": true,
  "/legal/terms": true,
  "/loading-smoke": true,
  "/resources": true,
  "/solutions": true,
};

const FORBIDDEN_VISUAL_SOURCE_FRAGMENTS = [
  ["sign", "InAs"].join(""),
  ["E2E_", "IDENTITIES"].join(""),
  ["storage", "State"].join(""),
  ["extraHTTP", "Headers"].join(""),
  ["setExtraHTTP", "Headers"].join(""),
  ["author", "ization"].join(""),
  `/${["dash", "board"].join("")}`,
  `/${["account"].join("")}`,
  `/${["admin"].join("")}`,
  `/${["feature", "-items"].join("")}`,
] as const;

const waitForStableDocument = async (page: Page): Promise<void> => {
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
};

const captureEvidence = async (
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> => {
  const pathname = new URL(page.url()).pathname;
  expect(
    PUBLIC_CAPTURE_PATHS[pathname] === true ||
      pathname.startsWith("/not-a-darkfactory-route-")
  ).toBe(true);
  await page.context().clearCookies();
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
  const cookieCount = (await page.context().cookies()).length;
  const storageCounts = await page.evaluate(() => ({
    localStorage: window.localStorage.length,
    sessionStorage: window.sessionStorage.length,
  }));
  if (
    cookieCount !== 0 ||
    storageCounts.localStorage !== 0 ||
    storageCounts.sessionStorage !== 0
  ) {
    throw new Error(
      "Public screenshot capture requires empty anonymous browser state."
    );
  }
  const populatedInputCount = await page
    .locator("input, textarea, select")
    .evaluateAll(
      (elements) =>
        elements.filter(
          (element) =>
            (element instanceof HTMLInputElement ||
              element instanceof HTMLTextAreaElement ||
              element instanceof HTMLSelectElement) &&
            element.value !== ""
        ).length
    );
  if (populatedInputCount !== 0) {
    throw new Error("Public screenshot capture requires empty form controls.");
  }

  const path = await screenshotArtifactPath(testInfo, `${name}.png`);
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path,
  });
};

const expectResponsiveDocument = async (page: Page): Promise<void> => {
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(
    dimensions.clientWidth + 1
  );
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main#main-content")).toBeVisible();
};

test("public visual source forbids authenticated or protected capture paths", async ({
  page,
}) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  const source = await readFile(new URL(import.meta.url), "utf8");
  for (const fragment of FORBIDDEN_VISUAL_SOURCE_FRAGMENTS) {
    expect(source).not.toContain(fragment);
  }
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the product. Keep the foundation legible.",
    })
  ).toBeVisible();
});

for (const route of PUBLIC_ROUTES) {
  test(`captures the responsive ${route.name} public route`, async ({
    page,
  }, testInfo) => {
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await waitForStableDocument(page);
      await expect(
        page.getByRole("heading", { level: 1, name: route.heading })
      ).toBeVisible();
      await expectResponsiveDocument(page);
      await captureEvidence(
        page,
        testInfo,
        `public-${route.name}-${viewport.width}`
      );
    }
  });
}

test("captures sanitized invalid contact state and exercises pending/previewed outcomes responsively", async ({
  page,
}, testInfo) => {
  let releaseRequest = (): void => undefined;
  let requestGate: Promise<void> = Promise.resolve();
  await page.route("**/api/orpc/contact/submit", async (route) => {
    await requestGate;
    await route.continue();
  });

  for (const viewport of RESPONSIVE_VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto("/contact");
    await waitForStableDocument(page);

    await page.locator("#name").fill(" ");
    await page.locator("#email").fill("invalid");
    await page.locator("#subject").fill(" ");
    await page.locator("#message").fill(" ");
    await page
      .locator("#contact-form")
      .evaluate((form: HTMLFormElement) => form.requestSubmit());
    await expect(page.locator("#contact-validation-summary")).toBeVisible();
    await expect(page.locator("#name")).toBeFocused();
    await expectResponsiveDocument(page);
    await page
      .locator("#contact-form input, #contact-form textarea")
      .evaluateAll((elements) => {
        for (const element of elements) {
          if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
          ) {
            element.value = "";
          }
        }
      });
    await captureEvidence(
      page,
      testInfo,
      `public-contact-invalid-${viewport.width}`
    );

    const submissionId = randomUUID();
    const contactEmail = `ada.visual+${submissionId}@example.test`;
    const contactSubject = `Responsive contact evidence ${submissionId}`;
    const previewAfter = Date.now();
    await page.locator("#name").fill(`Ada Visual ${viewport.width}`);
    await page.locator("#email").fill(contactEmail);
    await page.locator("#subject").fill(contactSubject);
    await page
      .locator("#message")
      .fill(
        `Capture the real pending and previewed outcome at ${viewport.width}px.`
      );
    requestGate = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    const requestPromise = page.waitForRequest((request) => {
      const url = new URL(request.url());
      return (
        request.method() === "POST" &&
        url.pathname === "/api/orpc/contact/submit"
      );
    });
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "POST" &&
        url.pathname === "/api/orpc/contact/submit"
      );
    });
    await page
      .locator("#contact-form")
      .evaluate((form: HTMLFormElement) => form.requestSubmit());
    await requestPromise;
    await expect(
      page.getByRole("button", { name: "Sending message" })
    ).toBeDisabled();

    releaseRequest();
    const response = await responsePromise;
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      json: { status: "previewed" },
    });
    await expect(
      page.getByText(
        "Your message was saved to the local email preview. It was not sent."
      )
    ).toBeVisible();
    await expect(page.locator("#contact-status")).toBeFocused();
    await waitForContactPreview({
      after: previewAfter,
      recipientEmail: contactEmail,
      subject: contactSubject,
    });
    await expectResponsiveDocument(page);
  }
});

for (const viewport of RESPONSIVE_VIEWPORTS) {
  test(`captures guarded public loading, error, and not-found states at ${viewport.width}px`, async ({
    browserErrors,
    page,
  }, testInfo) => {
    await page.setViewportSize(viewport);

    const loadingResponse = await page.goto("/loading-smoke", {
      waitUntil: "commit",
    });
    expect(loadingResponse?.status()).toBe(200);
    const loadingStatus = page.getByRole("status", {
      name: "Loading this page",
    });
    await expect(loadingStatus).toBeVisible();
    await expectResponsiveDocument(page);
    await captureEvidence(page, testInfo, `public-loading-${viewport.width}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "The loading fixture completed.",
      })
    ).toBeVisible({ timeout: 10_000 });

    await page.addInitScript(() => {
      const state = window as typeof window & {
        __DARKFACTORY_E2E_FALSE_ERROR_SUCCESS__?: boolean;
        __DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__?: number;
      };
      state.__DARKFACTORY_E2E_FALSE_ERROR_SUCCESS__ = false;
      state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ = 0;
      const fixtureMessage = "E2E recoverable public error fixture";
      const reportConsoleError = console.error.bind(console);
      let sawFixtureError = false;
      console.error = (...values: unknown[]): void => {
        const first = values[0];
        const isFixtureError =
          values.length === 1 &&
          ((first instanceof Error && first.message === fixtureMessage) ||
            (typeof first === "string" &&
              first.startsWith(`Error: ${fixtureMessage}\n`) &&
              first.includes("at RecoverableErrorFixture")));
        if (isFixtureError) {
          sawFixtureError = true;
          state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ =
            (state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0) + 1;
          reportConsoleError(`Error: ${fixtureMessage}`);
          return;
        }
        if (
          sawFixtureError &&
          values.length === 1 &&
          typeof first === "string" &&
          first.startsWith("The above error occurred in a React component:") &&
          first.includes("at RecoverableErrorFixture")
        ) {
          state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ =
            (state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0) + 1;
          reportConsoleError(`React component error: ${fixtureMessage}`);
          return;
        }
        reportConsoleError(...values);
      };
      document.addEventListener(
        "DOMContentLoaded",
        () => {
          const recordFalseSuccess = (): void => {
            if (
              document.body?.textContent?.includes(
                "The error fixture recovered."
              )
            ) {
              state.__DARKFACTORY_E2E_FALSE_ERROR_SUCCESS__ = true;
            }
          };
          const observer = new MutationObserver(recordFalseSuccess);
          observer.observe(document.body, {
            childList: true,
            subtree: true,
          });
          recordFalseSuccess();
        },
        { once: true }
      );
    });
    browserErrors.allowConsoleError({
      message: "Error: E2E recoverable public error fixture",
      pathname: "/error-smoke",
    });
    browserErrors.allowConsoleError({
      message: "React component error: E2E recoverable public error fixture",
      pathname: "/error-smoke",
    });
    const errorResponse = await page.goto("/error-smoke");
    expect(errorResponse?.status()).toBe(200);
    await waitForStableDocument(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "This page needs another attempt.",
      })
    ).toBeVisible();
    expect(
      await page.evaluate(() => {
        const state = window as typeof window & {
          __DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__?: number;
        };
        return state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0;
      })
    ).toBe(2);
    expect(
      await page.evaluate(() => {
        const state = window as typeof window & {
          __DARKFACTORY_E2E_FALSE_ERROR_SUCCESS__?: boolean;
        };
        return state.__DARKFACTORY_E2E_FALSE_ERROR_SUCCESS__ ?? false;
      })
    ).toBe(false);
    await expect(
      page.locator('section[aria-labelledby="public-error-actions-title"]')
    ).toBeFocused();
    await expectResponsiveDocument(page);
    expect(
      await page.evaluate(() =>
        window.sessionStorage.getItem("darkfactory:e2e:public-error-recovered")
      )
    ).toBe("1");
    await captureEvidence(page, testInfo, `public-error-${viewport.width}`);
    await page.evaluate(() => {
      window.sessionStorage.setItem(
        "darkfactory:e2e:public-error-recovered",
        "1"
      );
    });
    const recoveryButton = page.getByRole("button", { name: "Try again" });
    await recoveryButton.focus();
    await expect(recoveryButton).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "The error fixture recovered.",
      })
    ).toBeVisible();

    const notFoundPath = `/not-a-darkfactory-route-${viewport.width}`;
    browserErrors.allowHttpError({
      method: "GET",
      pathname: notFoundPath,
      status: 404,
    });
    const notFoundResponse = await page.goto(notFoundPath);
    expect(notFoundResponse?.status()).toBe(404);
    await waitForStableDocument(page);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "That page is not available.",
      })
    ).toBeVisible();
    await expectResponsiveDocument(page);
    await captureEvidence(page, testInfo, `public-not-found-${viewport.width}`);
  });
}

test("canonical legal aliases redirect and guarded fixtures stay out of navigation", async ({
  page,
}) => {
  const aliases = [
    { canonical: "/legal/privacy", legacy: "/privacy" },
    { canonical: "/legal/terms", legacy: "/terms" },
  ] as const;

  for (const alias of aliases) {
    const redirectResponse = await page.request.get(alias.legacy, {
      maxRedirects: 0,
    });
    expect(redirectResponse.status()).toBe(307);
    // biome-ignore lint/complexity/useLiteralKeys: Playwright models response headers with an index signature.
    expect(redirectResponse.headers()["location"]).toBe(alias.canonical);

    const canonicalResponse = await page.goto(alias.legacy);
    expect(canonicalResponse?.status()).toBe(200);
    await expect(page).toHaveURL((url) => url.pathname === alias.canonical);
  }

  const homeResponse = await page.goto("/");
  await waitForStableDocument(page);
  expect(homeResponse?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the product. Keep the foundation legible.",
    })
  ).toBeVisible();
  await expect(page.locator('a[href="/loading-smoke"]')).toHaveCount(0);
  await expect(page.locator('a[href="/error-smoke"]')).toHaveCount(0);
});
