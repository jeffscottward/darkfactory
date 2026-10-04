import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { createApiClient } from "@darkfactory/api";
import { type Appearance, THEME_NAMES } from "@darkfactory/ui/themes";
import type { BrowserContext, Cookie, Page, TestInfo } from "@playwright/test";

import {
  E2E_IDENTITIES,
  type E2EIdentity,
  expect,
  expectHydrated,
  signInAs,
  test,
} from "./fixtures.ts";
import { clearContactThrottle, resetDatabase } from "./helpers/database.ts";

const CREDENTIAL_ARTIFACT_POLICY = {
  screenshot: "off",
  trace: "off",
  video: "off",
} as const;
const FORBIDDEN_A11Y_BINARY_FRAGMENTS = [
  ["screen", "shotArtifactPath"].join(""),
  ["page.screen", "shot("].join(""),
  [".p", "ng"].join(""),
] as const;

test.use(CREDENTIAL_ARTIFACT_POLICY);
// Each file starts from the seeded identities, whatever ran before it.
test.beforeAll(() => resetDatabase());

const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

const PUBLIC_ROUTES = [
  { name: "home", path: "/" },
  { name: "features", path: "/features" },
  { name: "solutions", path: "/solutions" },
  { name: "resources", path: "/resources" },
  { name: "about", path: "/about" },
  { name: "contact", path: "/contact" },
  { name: "privacy", path: "/legal/privacy" },
  { name: "terms", path: "/legal/terms" },
] as const;

const AXE_VIEWPORTS = [
  { height: 812, name: "mobile", width: 375 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

const THEME_TRIGGER_NAME = /^Appearance settings(?: unavailable)?$/;
const FONT_RESOURCE_PATTERN_SOURCE = String.raw`\.(?:woff2?|ttf)(?:\?|$)`;
interface AxeRuleRecord {
  readonly description: string;
  readonly help: string;
  readonly helpUrl: string;
  readonly id: string;
  readonly impact?: string | null;
  readonly nodes: readonly unknown[];
  readonly tags: readonly string[];
}

const summarizeAxeRules = (rules: readonly AxeRuleRecord[]) =>
  rules.map((rule) => ({
    description: rule.description,
    help: rule.help,
    helpUrl: rule.helpUrl,
    id: rule.id,
    impact: rule.impact ?? null,
    nodeCount: rule.nodes.length,
    tags: [...rule.tags],
  }));

const EXPECTED_ERROR_FIXTURE_MESSAGE = "E2E recoverable public error fixture";

const installExpectedErrorConsoleNormalization = async (
  page: Page
): Promise<void> => {
  await page.addInitScript((fixtureMessage) => {
    const state = window as typeof window & {
      __DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__?: number;
    };
    state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ = 0;
    const reportConsoleError = console.error.bind(console);
    let fixtureFollowupPending = false;
    console.error = (...values: unknown[]): void => {
      const first = values[0];
      const isFixtureError =
        !fixtureFollowupPending &&
        values.length === 1 &&
        ((first instanceof Error && first.message === fixtureMessage) ||
          (typeof first === "string" &&
            first.startsWith(`Error: ${fixtureMessage}\n`) &&
            first.includes("at RecoverableErrorFixture")));
      if (isFixtureError) {
        fixtureFollowupPending = true;
        state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ =
          (state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0) + 1;
        reportConsoleError(`Error: ${fixtureMessage}`);
        return;
      }
      const isFixtureComponentError =
        fixtureFollowupPending &&
        values.length === 1 &&
        typeof first === "string" &&
        first.startsWith("The above error occurred in a React component:") &&
        (first.includes("at RecoverableErrorFixture") ||
          first.includes("/recoverable-error-fixture-"));
      if (isFixtureComponentError) {
        fixtureFollowupPending = false;
        console.error = reportConsoleError;
        state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ =
          (state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0) + 1;
        reportConsoleError(`React component error: ${fixtureMessage}`);
        return;
      }
      if (fixtureFollowupPending) {
        fixtureFollowupPending = false;
        console.error = reportConsoleError;
      }
      reportConsoleError(...values);
    };
  }, EXPECTED_ERROR_FIXTURE_MESSAGE);
};

const waitForStableDocument = async (page: Page): Promise<void> => {
  await expectHydrated(page.locator("main"));
  await page.evaluate(async () => {
    await Promise.all([
      document.fonts.load('16px "Public Sans Variable"'),
      document.fonts.load('16px "Manrope Variable"'),
    ]);
    await document.fonts.ready;
  });
  // Public and auth shells expose the standalone picker; the portal folds it into the user menu.
  const appearanceControl = page
    .locator("#application-theme-trigger, #user-menu-trigger")
    .first();
  await expect(appearanceControl).toBeVisible();
  if ((await appearanceControl.getAttribute("id")) === "user-menu-trigger") {
    await expect(appearanceControl).toHaveAttribute(
      "data-hydration-state",
      "ready"
    );
  } else {
    await expect(appearanceControl).toHaveAccessibleName("Appearance settings");
  }
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
};

const runAxe = async (
  page: Page,
  testInfo: TestInfo,
  artifactName: string,
  authenticated = false
): Promise<void> => {
  const results = await new AxeBuilder({ page })
    .withTags([...AXE_TAGS])
    .analyze();
  const evidence = {
    incomplete: summarizeAxeRules(results.incomplete),
    incompleteCount: results.incomplete.length,
    passCount: results.passes.length,
    ...(authenticated
      ? {}
      : { passedRules: summarizeAxeRules(results.passes) }),
    pathname: new URL(results.url).pathname,
    testEngine: results.testEngine,
    testRunner: results.testRunner,
    violationCount: results.violations.length,
    violations: summarizeAxeRules(results.violations),
  };
  const body = JSON.stringify(evidence, null, 2);

  await testInfo.attach(`${artifactName}-violations.json`, {
    body: Buffer.from(body),
    contentType: "application/json",
  });

  expect(
    results.passes.length,
    `${artifactName} must execute real axe rules`
  ).toBeGreaterThan(0);
  expect(
    summarizeAxeRules(results.violations),
    `${artifactName} must have zero WCAG violations`
  ).toEqual([]);
  expect(
    summarizeAxeRules(results.incomplete),
    `${artifactName} must have no untriaged incomplete rules`
  ).toEqual([]);
};

const assertDocumentContracts = async (
  page: Page,
  publicLandmarks = true
): Promise<void> => {
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("main")).toHaveCount(1);
  if (publicLandmarks) {
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.locator("main#main-content")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
  }

  const documentState = await page.evaluate((fontPatternSource) => {
    const fontResourcePattern = new RegExp(fontPatternSource, "u");
    const fontResourceUrls = performance
      .getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => fontResourcePattern.test(url));
    return {
      bodyFontLoaded: document.fonts.check('16px "Public Sans Variable"'),
      clientWidth: document.documentElement.clientWidth,
      declaredFontFamilies: [
        ...new Set(
          Array.from(document.fonts, (font) =>
            font.family.replaceAll('"', "").replaceAll("'", "")
          )
        ),
      ],
      fontResourceUrls,
      fontStatus: document.fonts.status,
      headingFontLoaded: document.fonts.check('16px "Manrope Variable"'),
      origin: window.location.origin,
      scrollWidth: document.documentElement.scrollWidth,
    };
  }, FONT_RESOURCE_PATTERN_SOURCE);

  expect(documentState.scrollWidth).toBeLessThanOrEqual(
    documentState.clientWidth + 1
  );
  expect(documentState.fontStatus).toBe("loaded");
  expect(documentState.bodyFontLoaded).toBe(true);
  expect(documentState.headingFontLoaded).toBe(true);
  expect(documentState.declaredFontFamilies).toContain("Public Sans Variable");
  expect(documentState.declaredFontFamilies).toContain("Manrope Variable");
  expect(documentState.fontResourceUrls.length).toBeGreaterThanOrEqual(1);
  expect(
    documentState.fontResourceUrls.every(
      (url) => new URL(url).origin === documentState.origin
    ),
    `Font resources must be local: ${documentState.fontResourceUrls.join(", ")}`
  ).toBe(true);

  const undersizedTargets = await page
    .locator(
      'a[href], button:not([disabled]), input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [role="button"], [role="menuitemradio"]'
    )
    .evaluateAll((elements) =>
      elements.flatMap((element) => {
        if (element.closest('[aria-hidden="true"], [inert]') !== null) {
          return [];
        }
        const target =
          element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? (element.labels?.[0] ?? element)
            : element;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        if (
          rect.width === 0 ||
          rect.height === 0 ||
          style.display === "none" ||
          style.visibility === "hidden"
        ) {
          return [];
        }
        if (rect.width + 0.5 >= 44 && rect.height + 0.5 >= 44) {
          return [];
        }
        return [
          {
            height: rect.height,
            label:
              element.getAttribute("aria-label") ??
              element.textContent?.trim().slice(0, 80) ??
              element.tagName,
            tag: element.tagName,
            width: rect.width,
          },
        ];
      })
    );
  expect(
    undersizedTargets,
    `Visible interactive targets must be at least 44x44: ${JSON.stringify(undersizedTargets, null, 2)}`
  ).toEqual([]);

  const motionOffenders = await page
    .locator("body *")
    .evaluateAll((elements) => {
      const milliseconds = (duration: string): number => {
        const value = Number.parseFloat(duration);
        return duration.trim().endsWith("ms") ? value : value * 1000;
      };
      return elements.flatMap((element) => {
        const style = getComputedStyle(element);
        const durations = [style.animationDuration, style.transitionDuration]
          .flatMap((value) => value.split(","))
          .map(milliseconds);
        const maximum = Math.max(...durations);
        return maximum > 0.1
          ? [
              {
                animationDuration: style.animationDuration,
                tag: element.tagName,
                transitionDuration: style.transitionDuration,
              },
            ]
          : [];
      });
    });
  expect(
    motionOffenders,
    `Reduced-motion styles must collapse motion durations: ${JSON.stringify(motionOffenders.slice(0, 10), null, 2)}`
  ).toEqual([]);
};

test("@a11y axe evidence schema excludes DOM content and account data", async ({
  page,
}) => {
  const summarized = summarizeAxeRules([
    {
      description: "Rule description",
      help: "Rule help",
      helpUrl: "https://dequeuniversity.com/rules/example",
      id: "example-rule",
      impact: "serious",
      nodes: [
        {
          html: "<td>Admin User admin@domain.test</td>",
          target: ["td"],
        },
      ],
      tags: ["wcag2aa"],
    },
  ]);
  const serialized = JSON.stringify(summarized);
  expect(summarized[0]?.nodeCount).toBe(1);
  expect(serialized).not.toContain("Admin User");
  expect(serialized).not.toContain("admin@domain.test");
  expect(serialized).not.toContain('"html"');
  expect(serialized).not.toContain('"target"');
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the product. Keep the foundation legible.",
    })
  ).toBeVisible();
});

test("@a11y authenticated evidence disables credential-bearing browser artifacts", async ({
  page,
}) => {
  expect(CREDENTIAL_ARTIFACT_POLICY).toEqual({
    screenshot: "off",
    trace: "off",
    video: "off",
  });
  const source = await readFile(new URL(import.meta.url), "utf8");
  for (const fragment of FORBIDDEN_A11Y_BINARY_FRAGMENTS) {
    expect(source).not.toContain(fragment);
  }
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the product. Keep the foundation legible.",
    })
  ).toBeVisible();
});

for (const route of PUBLIC_ROUTES) {
  for (const viewport of AXE_VIEWPORTS) {
    test(`@a11y ${route.name} has no WCAG violations at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await waitForStableDocument(page);
      await assertDocumentContracts(page);
      await runAxe(page, testInfo, `public-${route.name}-${viewport.name}`);
    });
  }
}

const AUTH_FORM_ROUTES = [
  { name: "sign-in", path: "/sign-in" },
  { name: "sign-up", path: "/sign-up" },
  { name: "forgot-password", path: "/forgot-password" },
] as const;

for (const route of AUTH_FORM_ROUTES) {
  for (const viewport of AXE_VIEWPORTS) {
    test(`@a11y ${route.name} form has no WCAG violations at ${viewport.width}px`, async ({
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await waitForStableDocument(page);
      await assertDocumentContracts(page, false);
      await runAxe(page, testInfo, `auth-${route.name}-${viewport.name}`);
    });
  }
}

for (const viewport of AXE_VIEWPORTS) {
  test(`@a11y guarded public states have no WCAG violations at ${viewport.width}px`, async ({
    browserErrors,
    page,
  }, testInfo) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);

    await page.goto("/loading-smoke", { waitUntil: "commit" });
    await expect(
      page.getByRole("status", { name: "Loading this page" })
    ).toBeVisible();
    await assertDocumentContracts(page);
    await runAxe(page, testInfo, `public-loading-${viewport.name}`);
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "The loading fixture completed.",
      })
    ).toBeVisible({ timeout: 10_000 });
    await installExpectedErrorConsoleNormalization(page);
    browserErrors.allowConsoleError({
      message: `Error: ${EXPECTED_ERROR_FIXTURE_MESSAGE}`,
      pathname: "/error-smoke",
    });
    browserErrors.allowConsoleError({
      message: `React component error: ${EXPECTED_ERROR_FIXTURE_MESSAGE}`,
      pathname: "/error-smoke",
    });

    browserErrors.allowHttpError({
      method: "GET",
      pathname: "/error-smoke",
      status: 500,
    });
    browserErrors.allowPageError({
      message: "E2E recoverable public error fixture",
      pathname: "/error-smoke",
    });
    await page.goto("/error-smoke");
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
    const unrelatedReactConsoleMessage =
      "The above error occurred in a React component: UnrelatedFixture";
    browserErrors.allowConsoleError({
      message: unrelatedReactConsoleMessage,
      pathname: "/error-smoke",
    });
    await page.evaluate(
      (message) => console.error(message),
      unrelatedReactConsoleMessage
    );
    expect(
      await page.evaluate(() => {
        const state = window as typeof window & {
          __DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__?: number;
        };
        return state.__DARKFACTORY_E2E_EXPECTED_ERROR_CONSOLES__ ?? 0;
      })
    ).toBe(2);
    // The production build shows no development error overlay.
    await expect(
      page.getByRole("dialog", { name: "Runtime Error" })
    ).toBeHidden();
    await assertDocumentContracts(page);
    await runAxe(page, testInfo, `public-error-${viewport.name}`);

    const notFoundPath = `/a11y-not-found-${viewport.width}`;
    browserErrors.allowHttpError({
      method: "GET",
      pathname: notFoundPath,
      status: 404,
    });
    await page.goto(notFoundPath);
    await waitForStableDocument(page);
    await assertDocumentContracts(page);
    await runAxe(page, testInfo, `public-not-found-${viewport.name}`);
  });
}

test("@a11y keyboard skip link, focus order, mobile dialog, theme menu, and contact focus", async ({
  page,
}) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto("/");
  await waitForStableDocument(page);

  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await page.keyboard.press("Tab");
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("main#main-content")).toBeFocused();

  await page.goto("/");
  await waitForStableDocument(page);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "DarkFactory" })
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const themeTrigger = page.getByRole("button", { name: THEME_TRIGGER_NAME });
  await expect(themeTrigger).toBeFocused();
  await page.keyboard.press("Tab");
  const navigationTrigger = page.getByRole("button", {
    name: "Open navigation",
  });
  await expect(navigationTrigger).toBeFocused();

  await navigationTrigger.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Navigation" });
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => element.contains(document.activeElement))
    )
    .toBe(true);
  const dialogFocusables = dialog.locator(
    'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  const firstDialogTarget = dialogFocusables.first();
  const lastDialogTarget = dialogFocusables.last();
  await lastDialogTarget.focus();
  await page.keyboard.press("Tab");
  await expect(firstDialogTarget).toBeFocused();
  await firstDialogTarget.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(lastDialogTarget).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(navigationTrigger).toBeFocused();

  await themeTrigger.focus();
  await themeTrigger.press("ArrowDown");
  const themeMenu = page.getByRole("menu");
  await expect(themeMenu).toBeVisible();
  await expect(page.getByRole("menuitem").first()).toBeFocused();
  await expect(page.getByRole("menuitem").first()).toHaveAttribute(
    "aria-haspopup",
    "menu"
  );
  await page.keyboard.press("Escape");
  await expect(themeMenu).toBeHidden();
  await expect(themeTrigger).toBeFocused();

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
});

test("@a11y open mobile navigation has no serious or critical violations", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ height: 812, width: 375 });
  await page.goto("/");
  await waitForStableDocument(page);
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  await runAxe(page, testInfo, "public-mobile-navigation-open");
});

test("@a11y contact invalid, pending, and success states pass axe", async ({
  page,
}, testInfo) => {
  // This test really submits; each attempt, retries included, needs a fresh throttle budget.
  await clearContactThrottle();
  await page.setViewportSize({ height: 812, width: 375 });
  let releaseRequest = (): void => undefined;
  const requestGate = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  await page.route("**/api/orpc/contact/submit", async (route) => {
    await requestGate;
    await route.continue();
  });

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
  await runAxe(page, testInfo, "public-contact-invalid");

  await page.locator("#name").fill("Ada Accessibility");
  await page
    .locator("#email")
    .fill(`ada.accessibility+${testInfo.retry}@example.test`);
  await page.locator("#subject").fill("Accessibility matrix");
  await page
    .locator("#message")
    .fill("Verify the real pending and previewed contact states.");
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
  await expect(
    page.getByRole("button", { name: "Sending message" })
  ).toBeDisabled();
  await runAxe(page, testInfo, "public-contact-pending");

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
  await runAxe(page, testInfo, "public-contact-previewed");
});

const AUTHENTICATED_SURFACES = [
  {
    heading: "Dashboard",
    identity: E2E_IDENTITIES.alice,
    name: "member-dashboard",
    path: "/dashboard",
  },
  {
    expectedPath: "/account/profile",
    heading: "Profile",
    identity: E2E_IDENTITIES.alice,
    name: "account-redirect",
    path: "/account",
  },
  {
    heading: "Profile",
    identity: E2E_IDENTITIES.alice,
    name: "account-profile",
    path: "/account/profile",
  },
  {
    heading: "Addresses",
    identity: E2E_IDENTITIES.alice,
    name: "account-address",
    path: "/account/address",
  },
  {
    heading: "Preferences",
    identity: E2E_IDENTITIES.alice,
    name: "account-preferences",
    path: "/account/preferences",
  },
  {
    heading: "Security",
    identity: E2E_IDENTITIES.alice,
    name: "account-security",
    path: "/account/security",
  },
  {
    heading: "Feature items",
    identity: E2E_IDENTITIES.alice,
    name: "feature-list",
    path: "/feature-items",
  },
  {
    heading: "Create feature item",
    identity: E2E_IDENTITIES.alice,
    name: "feature-create",
    path: "/feature-items/new",
  },
  {
    heading: "Feature item details",
    identity: E2E_IDENTITIES.alice,
    name: "feature-detail",
    path: "/feature-items/30000000-0000-4000-8000-000000000002",
  },
  {
    heading: "Feature item details",
    identity: E2E_IDENTITIES.bob,
    name: "feature-archived",
    path: "/feature-items/30000000-0000-4000-8000-000000000003",
    stateText: "Archived records cannot be edited.",
  },
  {
    heading: "Users",
    identity: E2E_IDENTITIES.admin,
    name: "admin-users",
    path: "/admin/users",
  },
] as const;
const authenticatedCookies = new Map<string, readonly Cookie[]>();

const ensureAuthenticated = async (
  context: BrowserContext,
  page: Page,
  identity: E2EIdentity
): Promise<void> => {
  const cookies = authenticatedCookies.get(identity.id);
  if (cookies === undefined) {
    await signInAs(page, identity);
    authenticatedCookies.set(
      identity.id,
      (await context.storageState()).cookies
    );
    return;
  }
  await context.addCookies(cookies);
};

for (const surface of AUTHENTICATED_SURFACES) {
  for (const viewport of AXE_VIEWPORTS) {
    test(`@a11y authenticated ${surface.name} has no WCAG violations at ${viewport.width}px`, async ({
      context,
      page,
    }, testInfo) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.setViewportSize(viewport);
      await ensureAuthenticated(context, page, surface.identity);
      const expectedPath =
        "expectedPath" in surface ? surface.expectedPath : surface.path;
      if (new URL(page.url()).pathname !== expectedPath) {
        await page.goto(surface.path);
      }
      await waitForStableDocument(page);
      expect(new URL(page.url()).pathname).toBe(expectedPath);
      await expect(page.locator("#user-menu-trigger")).toHaveAccessibleName(
        surface.identity.name
      );
      await expect(
        page.getByRole("heading", { level: 1, name: surface.heading })
      ).toBeVisible();
      if ("stateText" in surface) {
        await expect(
          page.getByText(surface.stateText, { exact: true })
        ).toBeVisible();
      }
      await assertDocumentContracts(page, false);
      await runAxe(
        page,
        testInfo,
        `authenticated-${surface.name}-${viewport.name}`,
        true
      );
    });
  }
}

// Every concrete theme must pass the same WCAG AA axe gate as the default.
// Anonymous surfaces read the theme cookie; the trusted portal reads the DB preference.
const CONCRETE_THEMES = THEME_NAMES.filter((theme) => theme !== "system");
const THEME_COOKIE_NAME = "darkfactory-theme";
// Bob's seeded preference (packages/db/src/seeds/preferences.ts); restored after each theme.
const BOB_SEED_APPEARANCE: Appearance = {
  density: "compact",
  fontSize: "small",
  radius: "none",
  theme: "tokyo-night",
};

const themeApiFor = (context: BrowserContext, baseURL: string) =>
  createApiClient({
    baseUrl: baseURL,
    fetch: async (request: Request): Promise<Response> => {
      const method = request.method.toUpperCase();
      const response = await context.request.fetch(request.url, {
        data:
          method === "GET" || method === "HEAD"
            ? undefined
            : Buffer.from(await request.arrayBuffer()),
        failOnStatusCode: false,
        headers: {
          ...Object.fromEntries(request.headers.entries()),
          origin: new URL(request.url).origin,
          "sec-fetch-site": "same-origin",
        },
        method,
        timeout: 10_000,
      });
      return new Response(Uint8Array.from(await response.body()), {
        headers: response.headers(),
        status: response.status(),
        statusText: response.statusText(),
      });
    },
  });

const storeTrustedAppearance = async (
  context: BrowserContext,
  baseURL: string,
  appearance: Appearance
): Promise<void> => {
  const api = themeApiFor(context, baseURL);
  const current = await api.preferences.theme.get({});
  await api.preferences.theme.update({
    ...appearance,
    expectedUpdatedAt: current.updatedAt,
  });
};

for (const theme of CONCRETE_THEMES) {
  test(`@a11y ${theme} theme has no WCAG violations on home, sign-in, dashboard, and the open user menu`, async ({
    baseURL,
    context,
    page,
  }, testInfo) => {
    if (baseURL === undefined) {
      throw new Error("Theme accessibility evidence requires baseURL.");
    }
    const appearance: Appearance = {
      density: "default",
      fontSize: "default",
      radius: "small",
      theme,
    };
    const root = page.locator("html");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize({ height: 900, width: 1440 });
    await context.addCookies([
      {
        name: THEME_COOKIE_NAME,
        url: baseURL,
        value: encodeURIComponent(
          `${appearance.theme}:${appearance.fontSize}:${appearance.density}:${appearance.radius}`
        ),
      },
    ]);

    for (const route of [
      { name: "home", path: "/", publicLandmarks: true },
      { name: "sign-in", path: "/sign-in", publicLandmarks: false },
    ] as const) {
      const response = await page.goto(route.path);
      expect(response?.status()).toBe(200);
      await waitForStableDocument(page);
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(root).toHaveAttribute("data-theme-authority", "anonymous");
      await assertDocumentContracts(page, route.publicLandmarks);
      await runAxe(page, testInfo, `theme-${theme}-${route.name}`);
    }

    await ensureAuthenticated(context, page, E2E_IDENTITIES.bob);
    let failure: unknown;
    try {
      await storeTrustedAppearance(context, baseURL, appearance);
      await page.goto("/dashboard");
      await waitForStableDocument(page);
      await expect(root).toHaveAttribute("data-theme-authority", "trusted");
      await expect(root).toHaveAttribute("data-theme", theme);
      await expect(
        page.getByRole("heading", { level: 1, name: "Dashboard" })
      ).toBeVisible();
      await assertDocumentContracts(page, false);
      await runAxe(page, testInfo, `theme-${theme}-dashboard`, true);

      const userMenuTrigger = page.locator("#user-menu-trigger");
      await userMenuTrigger.focus();
      await userMenuTrigger.press("Enter");
      const userMenu = page.locator("#user-menu-content");
      await expect(userMenu).toBeVisible();
      const themeSubmenuTrigger = page.locator("#user-menu-theme-trigger");
      await themeSubmenuTrigger.focus();
      await themeSubmenuTrigger.press("ArrowRight");
      const themeOptions = page.getByRole("group", {
        exact: true,
        name: "Theme",
      });
      await expect(
        themeOptions.getByRole("menuitemradio", { checked: true })
      ).toHaveAttribute("data-state", "checked");
      await expect(
        themeOptions.locator(`.theme-swatch[data-theme-swatch="${theme}"]`)
      ).toBeVisible();
      // Every popup reference on the open menu must resolve to a rendered menu.
      expect(
        await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '[aria-haspopup="menu"][aria-controls]'
            ),
          ].flatMap((element) => {
            const target = document.getElementById(
              element.getAttribute("aria-controls") ?? ""
            );
            return target?.getAttribute("role") === "menu"
              ? []
              : [element.id || element.tagName];
          })
        )
      ).toEqual([]);
      await runAxe(page, testInfo, `theme-${theme}-user-menu-open`, true);
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await expect(userMenu).toBeHidden();
    } catch (error) {
      failure = error;
    }
    try {
      await storeTrustedAppearance(context, baseURL, BOB_SEED_APPEARANCE);
    } catch (error) {
      failure ??= error;
    }
    if (failure !== undefined) {
      throw failure;
    }
  });
}
