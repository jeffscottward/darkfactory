import type { AdminUserSummaryOutput, ApiClient } from "@darkfactory/api";
import { createORPCClient } from "../../packages/api/node_modules/@orpc/client/dist/index.mjs";
import { RPCLink } from "../../packages/api/node_modules/@orpc/client/dist/adapters/fetch/index.mjs";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
} from "@playwright/test";

import { E2E_IDENTITIES, expect, signInAs, test } from "./fixtures";
const THEME_COOKIE_NAME = "darkfactory-theme";
const THEME_STORAGE_KEY = "darkfactory.anonymous-ui.v1";
const ACCOUNT_EVIDENCE_ADDRESS = "500 Browser Evidence Way";
const REMOVE_ADDRESS_NAME = /Remove .* address/;
const CONFIRM_REMOVE_ADDRESS_NAME = /Confirm removal of .* address/;
const ACCOUNT_SECURITY_URL = /\/account\/security$/;
const SIGN_IN_URL = /\/sign-in(?:\?|$)/;
const CANONICAL_ADMIN_ORDER = [
  E2E_IDENTITIES.bob,
  E2E_IDENTITIES.alice,
  E2E_IDENTITIES.admin,
] as const;
const DASHBOARD_URL = /\/dashboard$/;

const themeModes = ["light", "dark", "system"] as const;
const palettes = [
  "neutral",
  "slate",
  "blue",
  "cyan",
  "green",
  "amber",
  "orange",
  "red",
  "rose",
  "violet",
] as const;
type ThemeMode = (typeof themeModes)[number];
type Palette = (typeof palettes)[number];

type ThemePreference = Readonly<{
  themeMode: ThemeMode;
  palette: Palette;
}>;

type ThemeProbe = Readonly<{
  firstPaint: null | Readonly<{
    backgroundColor: string;
    color: string;
    mode: string | undefined;
    palette: string | undefined;
    time: number;
  }>;
  mutations: readonly Readonly<{
    attribute: string;
    newValue: string | null;
    oldValue: string | null;
    time: number;
  }>[];
}>;

type RuntimeEvidence = Readonly<{
  authority: "anonymous" | "trusted";
  case: string;
  backgroundColor: string;
  cookieMatches: boolean;
  cookieStatus: string | null;
  firstPaint: ThemeProbe["firstPaint"];
  nonTextRatios: Readonly<Record<string, number>>;
  tokenRatios: Readonly<Record<string, number>>;
  color: string;
  contrastRatio: number;
  effectiveScheme: "dark" | "light";
  localStorage: string | null;
  mode: string | null;
  mutationCount: number;
  palette: string | null;
}>;

type LayoutEvidence = Readonly<{
  case: string;
  clientWidth: number;
  scrollWidth: number;
  viewportWidth: number;
}>;

const runtimeEvidence: RuntimeEvidence[] = [];
const layoutEvidence: LayoutEvidence[] = [];

const titleCase = (value: string): string =>
  `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const requireBaseURL = (baseURL: string | undefined): string => {
  if (baseURL === undefined) {
    throw new Error(
      "The account/admin/theme journey requires Playwright baseURL."
    );
  }
  return baseURL;
};

const installThemeProbe = async (context: BrowserContext): Promise<void> => {
  await context.addInitScript(() => {
    const instrumentedWindow = window as typeof window & {
      __DF_THEME_PROBE__?: {
        firstPaint: null | {
          backgroundColor: string;
          color: string;
          mode: string | undefined;
          palette: string | undefined;
          time: number;
        };
        mutations: {
          attribute: string;
          newValue: string | null;
          oldValue: string | null;
          time: number;
        }[];
      };
    };
    const probe = { firstPaint: null, mutations: [] } as NonNullable<
      typeof instrumentedWindow.__DF_THEME_PROBE__
    >;
    instrumentedWindow.__DF_THEME_PROBE__ = probe;
    const root = document.documentElement;
    new MutationObserver((records) => {
      for (const record of records) {
        probe.mutations.push({
          attribute: record.attributeName ?? "",
          newValue: root.getAttribute(record.attributeName ?? ""),
          oldValue: record.oldValue,
          time: performance.now(),
        });
      }
    }).observe(root, {
      attributeFilter: ["data-mode", "data-palette"],
      attributeOldValue: true,
      attributes: true,
    });
    requestAnimationFrame(() => {
      const paintedElement = document.body ?? root;
      const paintedStyle = getComputedStyle(paintedElement);
      probe.firstPaint = {
        backgroundColor: paintedStyle.backgroundColor,
        color: paintedStyle.color,
        mode: root.getAttribute("data-mode") ?? undefined,
        palette: root.getAttribute("data-palette") ?? undefined,
        time: performance.now(),
      };
    });
  });
};

const monitorSecondaryPage = (page: Page): (() => void) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(`console: ${message.text()}`);
    }
  });
  page.on("response", (response) => {
    if (response.status() >= 400) {
      const url = new URL(response.url());
      errors.push(
        `http: ${response.request().method()} ${url.pathname} ${response.status()}`
      );
    }
  });
  return () => expect(errors, "secondary page runtime errors").toEqual([]);
};

const assertNoHorizontalOverflow = async (
  page: Page,
  caseName: string
): Promise<void> => {
  const width = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(width.scrollWidth).toBeLessThanOrEqual(width.clientWidth + 1);
  layoutEvidence.push({ case: caseName, ...width });
};

const assertTouchTarget = async (locator: Locator): Promise<void> => {
  const box = await locator.boundingBox();
  expect(box, "touch target must have a rendered box").not.toBeNull();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
};

const readableContrast = async (
  page: Page
): Promise<{
  backgroundColor: string;
  color: string;
  contrastRatio: number;
  effectiveScheme: "dark" | "light";
  nonTextRatios: Readonly<Record<string, number>>;
  tokenRatios: Readonly<Record<string, number>>;
}> =>
  page.evaluate(() => {
    const channels = (value: string): readonly number[] => {
      const normalized = value.trim();
      if (normalized.startsWith("#") && normalized.length === 7) {
        return [1, 3, 5].map((start) =>
          Number.parseInt(normalized.slice(start, start + 2), 16)
        );
      }
      const matches = normalized.match(/[\d.]+/gu);
      if (matches === null || matches.length < 3) {
        return [];
      }
      return matches.slice(0, 3).map(Number);
    };
    const luminance = (value: string): number => {
      const [red = 0, green = 0, blue = 0] = channels(value);
      const linear = [red, green, blue].map((channel) => {
        const normalized = channel / 255;
        return normalized <= 0.040_45
          ? normalized / 12.92
          : ((normalized + 0.055) / 1.055) ** 2.4;
      });
      return (
        0.2126 * (linear[0] ?? 0) +
        0.7152 * (linear[1] ?? 0) +
        0.0722 * (linear[2] ?? 0)
      );
    };
    const ratio = (first: string, second: string): number => {
      const lighter = Math.max(luminance(first), luminance(second));
      const darker = Math.min(luminance(first), luminance(second));
      return (lighter + 0.05) / (darker + 0.05);
    };
    const bodyStyle = getComputedStyle(document.body);
    const rootStyle = getComputedStyle(document.documentElement);
    const color = bodyStyle.color;
    const backgroundColor =
      channels(bodyStyle.backgroundColor).length >= 3 &&
      bodyStyle.backgroundColor !== "rgba(0, 0, 0, 0)"
        ? bodyStyle.backgroundColor
        : rootStyle.backgroundColor;
    const tokenPairs = {
      accent: ["--accent", "--accent-foreground"],
      background: ["--background", "--foreground"],
      destructive: ["--destructive", "--destructive-foreground"],
      info: ["--info-subtle", "--info-foreground"],
      muted: ["--muted", "--muted-foreground"],
      primary: ["--primary", "--primary-foreground"],
      primarySubtle: ["--primary-subtle", "--primary-subtle-foreground"],
      success: ["--success-subtle", "--success-foreground"],
      surface: ["--surface", "--foreground"],
      warning: ["--warning-subtle", "--warning-foreground"],
    } as const;
    const tokenRatios = Object.fromEntries(
      Object.entries(tokenPairs).map(([name, [background, foreground]]) => [
        name,
        ratio(
          rootStyle.getPropertyValue(background),
          rootStyle.getPropertyValue(foreground)
        ),
      ])
    );
    const nonTextRatios = Object.fromEntries(
      [
        ["border", "--border-strong"],
        ["destructiveBorder", "--destructive-border"],
        ["focusRing", "--ring"],
      ].map(([name, token]) => [
        name,
        ratio(
          rootStyle.getPropertyValue(token ?? ""),
          rootStyle.getPropertyValue("--background")
        ),
      ])
    );
    let effectiveScheme: "dark" | "light" = matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches
      ? "dark"
      : "light";
    const selectedMode = document.documentElement.getAttribute("data-mode");
    if (selectedMode === "dark" || selectedMode === "light") {
      effectiveScheme = selectedMode;
    }
    return {
      backgroundColor,
      color,
      contrastRatio: ratio(color, backgroundColor),
      effectiveScheme,
      nonTextRatios,
      tokenRatios,
    };
  });

const cookieValue = async (page: Page): Promise<string | null> =>
  page.evaluate((name) => {
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${name}=`));
    return cookie?.slice(name.length + 1) ?? null;
  }, THEME_COOKIE_NAME);

const localTheme = async (page: Page): Promise<string | null> =>
  page.evaluate((key) => localStorage.getItem(key), THEME_STORAGE_KEY);

const sessionToken = async (
  context: BrowserContext,
  baseURL: string
): Promise<string> => {
  const cookies = (await context.cookies(baseURL)).filter((candidate) =>
    candidate.name.endsWith("better-auth.session_token")
  );
  if (cookies.length !== 1) {
    throw new Error("Expected exactly one authenticated session cookie.");
  }
  const cookie = cookies[0];
  if (
    cookie === undefined ||
    !cookie.name.startsWith("__Secure-") ||
    !cookie.httpOnly ||
    !cookie.secure ||
    cookie.sameSite !== "Lax" ||
    cookie.path !== "/"
  ) {
    throw new Error("Authenticated session cookie attributes are not secure.");
  }
  return cookie.value;
};

const assertTheme = async (
  page: Page,
  expected: ThemePreference,
  options: Readonly<{
    authority: "anonymous" | "trusted";
    case: string;
    cookieStatus: "invalid" | "missing" | "valid";
    checkFirstPaint?: boolean;
    localStorage?: string | null;
  }>
): Promise<void> => {
  const root = page.locator("html");
  await expect(root).toHaveAttribute("data-mode", expected.themeMode);
  await expect(root).toHaveAttribute("data-palette", expected.palette);
  await expect(root).toHaveAttribute("data-theme-authority", options.authority);
  await expect(root).toHaveAttribute(
    "data-theme-cookie-status",
    options.cookieStatus
  );
  await expect
    .poll(() => cookieValue(page))
    .toBe(`${expected.themeMode}%3A${expected.palette}`);
  if (options.localStorage !== undefined) {
    await expect.poll(() => localTheme(page)).toBe(options.localStorage);
  }
  const contrast = await readableContrast(page);
  expect(contrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
  if (expected.themeMode !== "system") {
    expect(contrast.effectiveScheme).toBe(expected.themeMode);
  }
  for (const [token, ratio] of Object.entries(contrast.tokenRatios)) {
    expect(ratio, `${token} semantic token contrast`).toBeGreaterThanOrEqual(
      4.5
    );
  }
  for (const [token, ratio] of Object.entries(contrast.nonTextRatios)) {
    expect(ratio, `${token} non-text contrast`).toBeGreaterThanOrEqual(3);
  }
  if (options.checkFirstPaint !== false) {
    await expect
      .poll(() =>
        page.evaluate(() => {
          const instrumentedWindow = window as typeof window & {
            __DF_THEME_PROBE__?: ThemeProbe;
          };
          return instrumentedWindow.__DF_THEME_PROBE__?.firstPaint ?? null;
        })
      )
      .not.toBeNull();
  }
  const probe = await page.evaluate(() => {
    const instrumentedWindow = window as typeof window & {
      __DF_THEME_PROBE__?: ThemeProbe;
    };
    return (
      instrumentedWindow.__DF_THEME_PROBE__ ?? {
        firstPaint: null,
        mutations: [],
      }
    );
  });
  if (options.checkFirstPaint !== false) {
    expect(probe.firstPaint).toMatchObject({
      backgroundColor: contrast.backgroundColor,
      color: contrast.color,
      mode: expected.themeMode,
      palette: expected.palette,
    });
    const lateFlashMutations = probe.mutations.filter((mutation) => {
      if (probe.firstPaint === null || mutation.time <= probe.firstPaint.time) {
        return false;
      }
      let expectedValue: string | null = null;
      if (mutation.attribute === "data-mode") {
        expectedValue = expected.themeMode;
      } else if (mutation.attribute === "data-palette") {
        expectedValue = expected.palette;
      }
      return mutation.oldValue !== expectedValue;
    });
    expect(
      lateFlashMutations,
      "theme must not correct after first paint"
    ).toEqual([]);
  }
  runtimeEvidence.push({
    authority: options.authority,
    backgroundColor: contrast.backgroundColor,
    case: options.case,
    cookieMatches:
      (await cookieValue(page)) ===
      `${expected.themeMode}%3A${expected.palette}`,
    cookieStatus: await root.getAttribute("data-theme-cookie-status"),
    color: contrast.color,
    contrastRatio: contrast.contrastRatio,
    nonTextRatios: contrast.nonTextRatios,
    tokenRatios: contrast.tokenRatios,
    effectiveScheme: contrast.effectiveScheme,
    firstPaint: probe.firstPaint,
    localStorage: await localTheme(page),
    mode: await root.getAttribute("data-mode"),
    mutationCount: probe.mutations.length,
    palette: await root.getAttribute("data-palette"),
  });
};

const selectThemeOption = async (
  page: Page,
  groupName: "Color mode" | "Color palette",
  optionName: string
): Promise<void> => {
  await page
    .getByRole("button", { name: "Theme settings", exact: true })
    .click();
  const group = page.getByRole("group", { name: groupName });
  await expect(group).toBeVisible();
  await group
    .getByRole("menuitemradio", { name: optionName, exact: true })
    .click();
};

const waitForAccountPage = async (
  page: Page,
  heading: string
): Promise<void> => {
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible();
  await page.waitForLoadState("networkidle");
};

const setCheckbox = async (
  page: Page,
  selector: string,
  checked: boolean
): Promise<void> => {
  const checkbox = page.locator(selector);
  if ((await checkbox.isChecked()) !== checked) {
    await checkbox.click();
  }
};

const restoreAliceAccount = async (page: Page): Promise<void> => {
  await page.goto("/account/profile");
  await waitForAccountPage(page, "Profile");
  const displayName = page.locator("#displayName");
  if ((await displayName.inputValue()) !== "Alice Adams") {
    await displayName.fill("Alice Adams");
    await page.getByRole("button", { name: "Save profile" }).click();
    await expect(page.getByText("Profile saved.")).toBeVisible();
  }

  await page.goto("/account/address");
  await waitForAccountPage(page, "Addresses");
  const evidenceAddress = page.getByRole("listitem").filter({
    hasText: ACCOUNT_EVIDENCE_ADDRESS,
  });
  if ((await evidenceAddress.count()) > 0) {
    await evidenceAddress
      .getByRole("button", { name: REMOVE_ADDRESS_NAME })
      .click();
    await evidenceAddress
      .getByRole("button", { name: CONFIRM_REMOVE_ADDRESS_NAME })
      .click();
    await expect(page.getByText("Address removed.")).toBeVisible();
  }

  await page.goto("/account/preferences");
  await waitForAccountPage(page, "Preferences");
  await setCheckbox(page, "#emailNotifications", true);
  await setCheckbox(page, "#productUpdates", true);
  await setCheckbox(page, "#analyticsConsent", true);
  await setCheckbox(page, "#personalizationConsent", true);
  const visibility = page.locator("#profileVisibility");
  if ((await visibility.inputValue()) !== "members") {
    await visibility.selectOption("members");
  }
  const save = page.getByRole("button", { name: "Save preferences" });
  if (await save.isEnabled()) {
    await save.click();
    await expect(page.getByText("Preferences saved.")).toBeVisible();
  }
};

const playwrightFetch =
  (requestContext: APIRequestContext) =>
  async (request: Request): Promise<Response> => {
    const method = request.method.toUpperCase();
    const response = await requestContext.fetch(request.url, {
      data:
        method === "GET" || method === "HEAD"
          ? undefined
          : Buffer.from(await request.arrayBuffer()),
      failOnStatusCode: false,
      headers: Object.fromEntries(request.headers.entries()),
      method,
    });
    return new Response(Uint8Array.from(await response.body()), {
      headers: response.headers(),
      status: response.status(),
      statusText: response.statusText(),
    });
  };

const createE2EApiClient = (
  baseURL: string,
  fetchRequest: (request: Request) => Promise<Response>
): ApiClient => {
  const link = new RPCLink({
    url: () => new URL("/api/orpc", baseURL),
    fetch: fetchRequest,
  });
  return createORPCClient<ApiClient>(link);
};

const apiFor = (context: BrowserContext, baseURL: string): ApiClient =>
  createE2EApiClient(baseURL, playwrightFetch(context.request));

const serializeAdminListRequest = (
  baseURL: string,
  input: Readonly<{ cursor: string; limit: number }>
): Promise<Request> => {
  let resolveRequest!: (request: Request) => void;
  const captured = new Promise<Request>((resolve) => {
    resolveRequest = resolve;
  });
  const serializer = createE2EApiClient(baseURL, (request) => {
    resolveRequest(request.clone());
    return Promise.resolve(
      new Response(JSON.stringify({ json: null }), {
        headers: { "content-type": "application/json" },
        status: 200,
      })
    );
  });
  serializer.admin.users.list(input).catch(() => undefined);
  return captured;
};

const executeRawRequest = async (
  requestContext: APIRequestContext,
  request: Request
): Promise<Readonly<{ body: unknown; status: number }>> => {
  const method = request.method.toUpperCase();
  const response = await requestContext.fetch(request.url, {
    data:
      method === "GET" || method === "HEAD"
        ? undefined
        : Buffer.from(await request.arrayBuffer()),
    failOnStatusCode: false,
    headers: Object.fromEntries(request.headers.entries()),
    method,
  });
  return { body: await response.json(), status: response.status() };
};

const newConfiguredContext = async (
  browser: Browser,
  baseURL: string,
  options: Parameters<Browser["newContext"]>[0] = {}
): Promise<BrowserContext> => {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
    viewport: { height: 900, width: 1440 },
    ...options,
  });
  await installThemeProbe(context);
  return context;
};

test.describe
  .serial("DF-113/114 account, admin, and theme evidence", () => {
    test("Alice profile, address, and preferences persist across reload and a fresh context, then restore", async ({
      baseURL,
      browser,
      context,
      page,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      await signInAs(page, E2E_IDENTITIES.alice);
      await restoreAliceAccount(page);

      try {
        await page.goto("/account/profile");
        await waitForAccountPage(page, "Profile");
        await page.locator("#displayName").fill("Alice Browser Evidence");
        await page.getByRole("button", { name: "Save profile" }).click();
        await expect(page.getByText("Profile saved.")).toBeVisible();
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("#displayName")).toHaveValue(
          "Alice Browser Evidence"
        );

        await page.goto("/account/address");
        await waitForAccountPage(page, "Addresses");
        await page.getByRole("button", { name: "Add an address" }).click();
        await page.locator("#type").selectOption("work");
        await page.locator("#line1").fill(ACCOUNT_EVIDENCE_ADDRESS);
        await page.locator("#city").fill("Evidence City");
        await page.locator("#region").fill("VA");
        await page.locator("#postalCode").fill("22030");
        await page.locator("#country").fill("us");
        await page.getByRole("button", { name: "Create address" }).click();
        await expect(page.getByText("Address created.")).toBeVisible();
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.getByText(ACCOUNT_EVIDENCE_ADDRESS)).toBeVisible();

        await page.goto("/account/preferences");
        await waitForAccountPage(page, "Preferences");
        await setCheckbox(page, "#emailNotifications", false);
        await setCheckbox(page, "#productUpdates", false);
        await setCheckbox(page, "#analyticsConsent", false);
        await setCheckbox(page, "#personalizationConsent", false);
        await page.locator("#profileVisibility").selectOption("public");
        await page.getByRole("button", { name: "Save preferences" }).click();
        await expect(page.getByText("Preferences saved.")).toBeVisible();
        await page.reload({ waitUntil: "networkidle" });
        await expect(page.locator("#emailNotifications")).not.toBeChecked();
        await expect(page.locator("#productUpdates")).not.toBeChecked();
        await expect(page.locator("#analyticsConsent")).not.toBeChecked();
        await expect(page.locator("#personalizationConsent")).not.toBeChecked();
        await expect(page.locator("#profileVisibility")).toHaveValue("public");

        const originalSession = await sessionToken(context, resolvedBaseURL);
        const freshContext = await newConfiguredContext(
          browser,
          resolvedBaseURL
        );
        const freshPage = await freshContext.newPage();
        const assertFreshRuntime = monitorSecondaryPage(freshPage);
        try {
          await signInAs(freshPage, E2E_IDENTITIES.alice);
          const freshSession = await sessionToken(
            freshContext,
            resolvedBaseURL
          );
          expect(
            freshSession !== originalSession,
            "fresh browser context must create a distinct session"
          ).toBe(true);
          await freshPage.goto("/account/profile");
          await waitForAccountPage(freshPage, "Profile");
          await expect(freshPage.locator("#displayName")).toHaveValue(
            "Alice Browser Evidence"
          );
          await freshPage.goto("/account/address");
          await waitForAccountPage(freshPage, "Addresses");
          await expect(
            freshPage.getByText(ACCOUNT_EVIDENCE_ADDRESS)
          ).toBeVisible();
          await freshPage.goto("/account/preferences");
          await waitForAccountPage(freshPage, "Preferences");
          await expect(freshPage.locator("#profileVisibility")).toHaveValue(
            "public"
          );
          await freshPage.goto("/account");
          await expect(
            freshPage.getByRole("heading", { level: 1, name: "Your account" })
          ).toBeVisible();
          await assertNoHorizontalOverflow(freshPage, "account-desktop");
          assertFreshRuntime();
        } finally {
          await freshContext.close();
        }
      } finally {
        await restoreAliceAccount(page);
      }
    });

    test("revoking other Alice sessions invalidates the other browser while the current browser survives", async ({
      baseURL,
      browser,
      page,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      await signInAs(page, E2E_IDENTITIES.alice);
      const otherContext = await newConfiguredContext(browser, resolvedBaseURL);
      const otherPage = await otherContext.newPage();
      const assertOtherRuntime = monitorSecondaryPage(otherPage);
      try {
        await signInAs(otherPage, E2E_IDENTITIES.alice);
        await page.goto("/account/security");
        await waitForAccountPage(page, "Security");
        await expect(
          page.getByText("Current session", { exact: true })
        ).toBeVisible();
        await page
          .getByRole("button", { name: "Sign out other sessions" })
          .click();
        await expect(
          page.getByRole("alertdialog", {
            name: "Confirm signing out other sessions",
          })
        ).toBeVisible();
        await page.getByRole("button", { name: "Confirm sign out" }).click();
        await expect(
          page.getByText("Other sessions signed out.")
        ).toBeVisible();
        await expect(
          page.getByText(
            "This is the only active session. It cannot be revoked from this page."
          )
        ).toBeVisible();

        await page.reload({ waitUntil: "networkidle" });
        await expect(page).toHaveURL(ACCOUNT_SECURITY_URL);
        await expect(
          page.getByText("Current session", { exact: true })
        ).toBeVisible();

        await otherPage.goto("/dashboard");
        await expect(otherPage).toHaveURL(SIGN_IN_URL);
        assertOtherRuntime();
      } finally {
        await otherContext.close();
      }
    });

    test("member denial hides administration while admin UI, search, typed cursor, and raw cursor return canonical users", async ({
      baseURL,
      browser,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      const memberContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      const memberPage = await memberContext.newPage();
      const assertMemberRuntime = monitorSecondaryPage(memberPage);
      try {
        await signInAs(memberPage, E2E_IDENTITIES.alice);
        await memberPage.goto("/admin/users");
        await expect(memberPage).toHaveURL(DASHBOARD_URL);
        await expect(
          memberPage.getByRole("navigation", {
            name: "Administration navigation",
          })
        ).toHaveCount(0);
        await expect(
          memberPage.getByRole("link", { name: "Users", exact: true })
        ).toHaveCount(0);
        const memberApi = apiFor(memberContext, resolvedBaseURL);
        await expect(
          memberApi.admin.users.list({ limit: 1 })
        ).rejects.toMatchObject({
          code: "FORBIDDEN",
          status: 403,
        });
        assertMemberRuntime();
      } finally {
        await memberContext.close();
      }

      const adminContext = await newConfiguredContext(browser, resolvedBaseURL);
      const adminPage = await adminContext.newPage();
      const assertAdminRuntime = monitorSecondaryPage(adminPage);
      try {
        await signInAs(adminPage, E2E_IDENTITIES.admin);
        await adminPage.goto("/admin/users");
        await expect(
          adminPage.getByRole("heading", { level: 1, name: "Users" })
        ).toBeVisible();
        await adminPage.waitForLoadState("networkidle");
        const directoryList = adminPage.locator("main").getByRole("list");
        const directoryItems = directoryList.getByRole("listitem");
        expect(await directoryItems.count()).toBeGreaterThanOrEqual(3);
        for (const identity of Object.values(E2E_IDENTITIES)) {
          const canonicalItem = directoryItems.filter({
            hasText: identity.name,
          });
          await expect(canonicalItem).toBeVisible();
          await expect(
            canonicalItem.getByText(titleCase(identity.role), { exact: true })
          ).toBeVisible();
        }

        await adminPage.locator("#admin-user-query").fill("Alice");
        await adminPage
          .getByRole("button", { name: "Search", exact: true })
          .click();
        await expect(directoryItems).toHaveCount(1);
        await expect(
          directoryList.getByText(E2E_IDENTITIES.alice.name, { exact: true })
        ).toBeVisible();
        await adminPage.getByRole("button", { name: "Clear search" }).click();
        expect(await directoryItems.count()).toBeGreaterThanOrEqual(3);

        const adminApi = apiFor(adminContext, resolvedBaseURL);
        const completeDirectory = await adminApi.admin.users.list({
          limit: 100,
        });
        const canonicalUsers = completeDirectory.items.filter(
          (user: AdminUserSummaryOutput) =>
            CANONICAL_ADMIN_ORDER.some((identity) => identity.id === user.id)
        ) as AdminUserSummaryOutput[];
        expect(canonicalUsers.map((user) => user.id)).toEqual(
          CANONICAL_ADMIN_ORDER.map((identity) => identity.id)
        );
        expect(canonicalUsers.map((user) => user.role)).toEqual(
          CANONICAL_ADMIN_ORDER.map((identity) => identity.role)
        );
        const firstPage = await adminApi.admin.users.list({ limit: 1 });
        expect(firstPage.items).toHaveLength(1);
        expect(firstPage.nextCursor).toEqual(expect.any(String));
        const rawRequest = await serializeAdminListRequest(resolvedBaseURL, {
          cursor: firstPage.nextCursor ?? "missing-cursor",
          limit: 1,
        });
        expect(new URL(rawRequest.url).pathname).toBe(
          "/api/orpc/admin/users/list"
        );
        const rawPage = await executeRawRequest(
          adminContext.request,
          rawRequest
        );
        expect(rawPage.status).toBe(200);
        expect(rawPage.body).toMatchObject({
          json: {
            items: [expect.objectContaining({ id: expect.any(String) })],
          },
        });
        const rawSecondPage = rawPage.body as {
          json: { items: readonly { id: string }[] };
        };
        expect(rawSecondPage.json.items[0]?.id).not.toBe(
          firstPage.items[0]?.id
        );

        const typedSecondPage = await adminApi.admin.users.list({
          cursor: firstPage.nextCursor ?? undefined,
          limit: 1,
        });
        expect(typedSecondPage.items).toHaveLength(1);
        expect(typedSecondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
        expect(rawSecondPage.json.items[0]?.id).toBe(
          typedSecondPage.items[0]?.id
        );
        await assertNoHorizontalOverflow(adminPage, "admin-desktop");
        assertAdminRuntime();
      } finally {
        await adminContext.close();
      }
    });

    test("mobile account and admin navigation remains complete and width-safe at 375px", async ({
      baseURL,
      browser,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      const memberContext = await newConfiguredContext(
        browser,
        resolvedBaseURL,
        {
          viewport: { height: 812, width: 375 },
        }
      );
      const memberPage = await memberContext.newPage();
      const assertMemberRuntime = monitorSecondaryPage(memberPage);
      try {
        await signInAs(memberPage, E2E_IDENTITIES.alice);
        await memberPage.goto("/account/profile");
        await waitForAccountPage(memberPage, "Profile");
        const memberTrigger = memberPage.getByRole("button", {
          name: "Open portal navigation",
        });
        await assertTouchTarget(memberTrigger);
        await memberTrigger.focus();
        await memberTrigger.press("Enter");
        const accountNavigation = memberPage.getByRole("navigation", {
          name: "Mobile account navigation",
        });
        await expect(accountNavigation).toBeVisible();
        const memberDialog = memberPage.getByRole("dialog", {
          name: "Portal navigation",
        });
        await memberPage.keyboard.press("Tab");
        expect(
          await memberDialog.evaluate((dialog) =>
            dialog.contains(document.activeElement)
          )
        ).toBe(true);
        await memberPage.keyboard.press("Shift+Tab");
        expect(
          await memberDialog.evaluate((dialog) =>
            dialog.contains(document.activeElement)
          )
        ).toBe(true);
        for (const label of ["Profile", "Address", "Preferences", "Security"]) {
          const accountLink = accountNavigation.getByRole("link", {
            name: label,
            exact: true,
          });
          await expect(accountLink).toBeVisible();
          await assertTouchTarget(accountLink);
        }
        await expect(
          memberPage.getByRole("navigation", {
            name: "Mobile administration navigation",
          })
        ).toHaveCount(0);
        await memberPage.keyboard.press("Escape");
        await expect(memberDialog).toBeHidden();
        await expect(memberTrigger).toBeFocused();
        await memberTrigger.press("Enter");
        await expect(accountNavigation).toBeVisible();
        await assertNoHorizontalOverflow(memberPage, "account-mobile-375");
        assertMemberRuntime();
      } finally {
        await memberContext.close();
      }

      const adminContext = await newConfiguredContext(
        browser,
        resolvedBaseURL,
        {
          viewport: { height: 812, width: 375 },
        }
      );
      const adminPage = await adminContext.newPage();
      const assertAdminRuntime = monitorSecondaryPage(adminPage);
      try {
        await signInAs(adminPage, E2E_IDENTITIES.admin);
        await adminPage.goto("/admin/users");
        await adminPage.waitForLoadState("networkidle");
        const adminTrigger = adminPage.getByRole("button", {
          name: "Open portal navigation",
        });
        await assertTouchTarget(adminTrigger);
        await adminTrigger.focus();
        await adminTrigger.press("Enter");
        const adminNavigation = adminPage.getByRole("navigation", {
          name: "Mobile administration navigation",
        });
        const usersLink = adminNavigation.getByRole("link", {
          name: "Users",
          exact: true,
        });
        await expect(usersLink).toBeVisible();
        await assertTouchTarget(usersLink);
        const adminAccountNavigation = adminPage.getByRole("navigation", {
          name: "Mobile account navigation",
        });
        await expect(adminAccountNavigation).toBeVisible();
        for (const link of await adminAccountNavigation
          .getByRole("link")
          .all()) {
          await assertTouchTarget(link);
        }
        const adminDialog = adminPage.getByRole("dialog", {
          name: "Portal navigation",
        });
        await adminPage.keyboard.press("Tab");
        expect(
          await adminDialog.evaluate((dialog) =>
            dialog.contains(document.activeElement)
          )
        ).toBe(true);
        await adminPage.keyboard.press("Shift+Tab");
        expect(
          await adminDialog.evaluate((dialog) =>
            dialog.contains(document.activeElement)
          )
        ).toBe(true);
        await adminPage.keyboard.press("Escape");
        await expect(adminDialog).toBeHidden();
        await expect(adminTrigger).toBeFocused();
        await adminTrigger.press("Enter");
        await expect(adminNavigation).toBeVisible();
        await assertNoHorizontalOverflow(adminPage, "admin-mobile-375");
        assertAdminRuntime();
      } finally {
        await adminContext.close();
      }
    });

    test("anonymous theme precedence and every 3 mode by 10 palette combination persist without flash", async ({
      baseURL,
      browser,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      const localDarkRose = JSON.stringify({
        version: 1,
        themeMode: "dark",
        palette: "rose",
      });

      const localContext = await newConfiguredContext(browser, resolvedBaseURL);
      await localContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: localDarkRose }
      );
      const localPage = await localContext.newPage();
      const assertLocalRuntime = monitorSecondaryPage(localPage);
      try {
        await localPage.goto("/");
        await localPage.waitForLoadState("networkidle");
        await assertTheme(
          localPage,
          { themeMode: "dark", palette: "rose" },
          {
            authority: "anonymous",
            case: "missing-cookie-uses-local-storage",
            cookieStatus: "missing",
            localStorage: localDarkRose,
          }
        );
        assertLocalRuntime();
      } finally {
        await localContext.close();
      }

      const cookieContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      await cookieContext.addCookies([
        {
          name: THEME_COOKIE_NAME,
          url: resolvedBaseURL,
          value: "light%3Ablue",
        },
      ]);
      await cookieContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: localDarkRose }
      );
      const cookiePage = await cookieContext.newPage();
      const assertCookieRuntime = monitorSecondaryPage(cookiePage);
      try {
        await cookiePage.goto("/");
        await cookiePage.waitForLoadState("networkidle");
        await assertTheme(
          cookiePage,
          { themeMode: "light", palette: "blue" },
          {
            authority: "anonymous",
            case: "valid-cookie-beats-local-storage",
            cookieStatus: "valid",
            localStorage: JSON.stringify({
              version: 1,
              themeMode: "light",
              palette: "blue",
            }),
          }
        );
        assertCookieRuntime();
      } finally {
        await cookieContext.close();
      }

      const invalidContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      await invalidContext.addCookies([
        { name: THEME_COOKIE_NAME, url: resolvedBaseURL, value: "invalid" },
      ]);
      await invalidContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: localDarkRose }
      );
      const invalidPage = await invalidContext.newPage();
      const assertInvalidRuntime = monitorSecondaryPage(invalidPage);
      try {
        await invalidPage.goto("/");
        await invalidPage.waitForLoadState("networkidle");
        const defaultStorage = JSON.stringify({
          version: 1,
          themeMode: "system",
          palette: "neutral",
        });
        await assertTheme(
          invalidPage,
          { themeMode: "system", palette: "neutral" },
          {
            authority: "anonymous",
            case: "invalid-cookie-rejects-local-storage",
            cookieStatus: "invalid",
            localStorage: defaultStorage,
          }
        );
        assertInvalidRuntime();
      } finally {
        await invalidContext.close();
      }

      const matrixContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      const matrixPage = await matrixContext.newPage();
      const assertMatrixRuntime = monitorSecondaryPage(matrixPage);
      try {
        await matrixPage.emulateMedia({ colorScheme: "light" });
        await matrixPage.goto("/");
        await matrixPage.waitForLoadState("networkidle");
        const initialPreference = {
          themeMode: "system" as const,
          palette: "neutral" as const,
        };
        await assertTheme(matrixPage, initialPreference, {
          authority: "anonymous",
          case: "initial-first-paint",
          cookieStatus: "missing",
          localStorage: JSON.stringify({ version: 1, ...initialPreference }),
        });
        const themeTrigger = matrixPage.getByRole("button", {
          name: "Theme settings",
          exact: true,
        });
        await themeTrigger.focus();
        await themeTrigger.press("Enter");
        const themeMenu = matrixPage.getByRole("menu");
        await expect(themeMenu).toBeVisible();
        await matrixPage.keyboard.press("Home");
        await matrixPage.keyboard.press("ArrowDown");
        const darkModeItem = themeMenu.getByRole("menuitemradio", {
          name: "Dark",
          exact: true,
        });
        await expect(darkModeItem).toBeFocused();
        await matrixPage.keyboard.press("Enter");
        await expect(matrixPage.locator("html")).toHaveAttribute(
          "data-mode",
          "dark"
        );
        await expect(themeTrigger).toBeFocused();
        await themeTrigger.press("Enter");
        await matrixPage.keyboard.press("Home");
        const lightModeItem = themeMenu.getByRole("menuitemradio", {
          name: "Light",
          exact: true,
        });
        await expect(lightModeItem).toBeFocused();
        await matrixPage.keyboard.press("Space");
        await expect(matrixPage.locator("html")).toHaveAttribute(
          "data-mode",
          "light"
        );
        await expect(themeTrigger).toBeFocused();
        await themeTrigger.press("Enter");
        await expect(themeMenu).toBeVisible();
        await matrixPage.keyboard.press("Escape");
        await expect(themeMenu).toBeHidden();
        await expect(themeTrigger).toBeFocused();
        for (const mode of themeModes) {
          await selectThemeOption(matrixPage, "Color mode", titleCase(mode));
          for (const palette of palettes) {
            await selectThemeOption(
              matrixPage,
              "Color palette",
              titleCase(palette)
            );
            const preference = { themeMode: mode, palette };
            const storedPreference = JSON.stringify({
              version: 1,
              ...preference,
            });
            await matrixPage.reload({ waitUntil: "networkidle" });
            await assertTheme(matrixPage, preference, {
              authority: "anonymous",
              case: `matrix-${mode}-${palette}`,
              cookieStatus: "valid",
              localStorage: storedPreference,
            });
            if (mode === "system") {
              await matrixPage.emulateMedia({ colorScheme: "dark" });
              await matrixPage.reload({ waitUntil: "networkidle" });
              await assertTheme(matrixPage, preference, {
                authority: "anonymous",
                case: `system-effective-dark-${palette}`,
                cookieStatus: "valid",
                localStorage: storedPreference,
              });
              await matrixPage.emulateMedia({ colorScheme: "light" });
            }
          }
        }
        const darkUnderLight = {
          themeMode: "dark" as const,
          palette: "violet" as const,
        };
        await selectThemeOption(matrixPage, "Color mode", "Dark");
        await selectThemeOption(matrixPage, "Color palette", "Violet");
        await matrixPage.reload({ waitUntil: "networkidle" });
        await assertTheme(matrixPage, darkUnderLight, {
          authority: "anonymous",
          case: "explicit-dark-under-system-light",
          cookieStatus: "valid",
          localStorage: JSON.stringify({ version: 1, ...darkUnderLight }),
        });
        const lightUnderDark = {
          themeMode: "light" as const,
          palette: "violet" as const,
        };
        await selectThemeOption(matrixPage, "Color mode", "Light");
        await matrixPage.emulateMedia({ colorScheme: "dark" });
        await matrixPage.reload({ waitUntil: "networkidle" });
        await assertTheme(matrixPage, lightUnderDark, {
          authority: "anonymous",
          case: "explicit-light-under-system-dark",
          cookieStatus: "valid",
          localStorage: JSON.stringify({ version: 1, ...lightUnderDark }),
        });
        await matrixPage.emulateMedia({ colorScheme: "light" });
        await selectThemeOption(matrixPage, "Color mode", "Dark");
        await assertTheme(matrixPage, darkUnderLight, {
          authority: "anonymous",
          case: "final-dark-violet-state",
          checkFirstPaint: false,
          cookieStatus: "valid",
          localStorage: JSON.stringify({ version: 1, ...darkUnderLight }),
        });
        await assertNoHorizontalOverflow(matrixPage, "theme-desktop");
        assertMatrixRuntime();
      } finally {
        await matrixContext.close();
      }
    });

    test("trusted Alice DB theme beats anonymous state on login and reload, persists through DB, and restores", async ({
      baseURL,
      browser,
    }, testInfo) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      const loginContext = await newConfiguredContext(browser, resolvedBaseURL);
      const loginPage = await loginContext.newPage();
      const assertLoginRuntime = monitorSecondaryPage(loginPage);
      try {
        await signInAs(loginPage, E2E_IDENTITIES.alice);
        await expect(loginPage.locator("html")).toHaveAttribute(
          "data-theme-authority",
          "trusted"
        );
        await expect(loginPage.locator("html")).toHaveAttribute(
          "data-mode",
          "dark"
        );
        await expect(loginPage.locator("html")).toHaveAttribute(
          "data-palette",
          "violet"
        );
        const authenticatedState = await loginContext.storageState();
        const trustedContext = await newConfiguredContext(
          browser,
          resolvedBaseURL,
          {
            storageState: authenticatedState,
          }
        );
        await trustedContext.addCookies([
          {
            name: THEME_COOKIE_NAME,
            url: resolvedBaseURL,
            value: "light%3Ablue",
          },
        ]);
        const anonymousStorage = JSON.stringify({
          version: 1,
          themeMode: "light",
          palette: "blue",
        });
        await trustedContext.addInitScript(
          ({ key, value }) => localStorage.setItem(key, value),
          { key: THEME_STORAGE_KEY, value: anonymousStorage }
        );
        const trustedPage = await trustedContext.newPage();
        const assertTrustedRuntime = monitorSecondaryPage(trustedPage);
        const trustedApi = apiFor(trustedContext, resolvedBaseURL);
        try {
          await trustedPage.goto("/dashboard");
          await trustedPage.waitForLoadState("networkidle");
          await assertTheme(
            trustedPage,
            { themeMode: "dark", palette: "violet" },
            {
              authority: "trusted",
              case: "trusted-db-beats-cookie-and-local-storage",
              cookieStatus: "valid",
              localStorage: anonymousStorage,
            }
          );

          await selectThemeOption(trustedPage, "Color mode", "Light");
          await selectThemeOption(trustedPage, "Color palette", "Cyan");
          await expect(trustedPage.locator("html")).toHaveAttribute(
            "data-palette",
            "cyan"
          );
          await expect
            .poll(async () => trustedApi.preferences.theme.get({}))
            .toMatchObject({ themeMode: "light", palette: "cyan" });
          await expect
            .poll(() => cookieValue(trustedPage))
            .toBe("light%3Acyan");
          await expect
            .poll(() => localTheme(trustedPage))
            .toBe(anonymousStorage);

          await trustedPage.reload({ waitUntil: "networkidle" });
          await assertTheme(
            trustedPage,
            { themeMode: "light", palette: "cyan" },
            {
              authority: "trusted",
              case: "trusted-db-persists-reload",
              cookieStatus: "valid",
              localStorage: anonymousStorage,
            }
          );
          await selectThemeOption(trustedPage, "Color mode", "Dark");
          await selectThemeOption(trustedPage, "Color palette", "Violet");
          await expect
            .poll(async () => trustedApi.preferences.theme.get({}))
            .toMatchObject({ themeMode: "dark", palette: "violet" });
          await trustedPage.reload({ waitUntil: "networkidle" });
          await assertTheme(
            trustedPage,
            { themeMode: "dark", palette: "violet" },
            {
              authority: "trusted",
              case: "trusted-seed-restored",
              cookieStatus: "valid",
              localStorage: anonymousStorage,
            }
          );
          await trustedPage.goto("/");
          await trustedPage.waitForLoadState("networkidle");
          await assertTheme(
            trustedPage,
            { themeMode: "dark", palette: "violet" },
            {
              authority: "trusted",
              case: "trusted-public-restored",
              cookieStatus: "valid",
              localStorage: anonymousStorage,
            }
          );
          await assertNoHorizontalOverflow(
            trustedPage,
            "trusted-public-desktop"
          );
          assertTrustedRuntime();
        } finally {
          try {
            const current = await trustedApi.preferences.theme.get({});
            if (current.themeMode !== "dark" || current.palette !== "violet") {
              await trustedApi.preferences.theme.update({
                expectedUpdatedAt: current.updatedAt,
                themeMode: "dark",
                palette: "violet",
              });
            }
          } finally {
            await trustedContext.close();
          }
        }
        assertLoginRuntime();
      } finally {
        await loginContext.close();
      }
      expect(
        runtimeEvidence.filter((record) => record.case.startsWith("matrix-"))
      ).toHaveLength(themeModes.length * palettes.length);
      expect(
        runtimeEvidence.filter(
          (record) => record.case === "initial-first-paint"
        )
      ).toHaveLength(1);
      const evidence = JSON.stringify(
        {
          artifactProfile: "no-binary",
          combinations: themeModes.length * palettes.length,
          generatedAt: new Date().toISOString(),
          layout: layoutEvidence,
          theme: runtimeEvidence,
        },
        null,
        2
      );
      await testInfo.attach("account-admin-theme-runtime-matrix.json", {
        body: Buffer.from(evidence),
        contentType: "application/json",
      });
    });
  });
