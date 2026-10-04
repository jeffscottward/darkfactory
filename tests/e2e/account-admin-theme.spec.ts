import {
  type AdminUserSummaryOutput,
  type ApiClient,
  createApiClient,
} from "@darkfactory/api";
import {
  type Appearance,
  DENSITY_OPTIONS,
  FONT_SIZE_OPTIONS,
  RADIUS_OPTIONS,
  THEME_NAMES,
  THEME_OPTIONS,
  type ThemeName,
} from "@darkfactory/ui/themes";
import type {
  APIRequestContext,
  Browser,
  BrowserContext,
  Locator,
  Page,
} from "@playwright/test";

import {
  type ColorScheme,
  type ConcreteThemeName,
  THEME_TOKENS,
} from "../../packages/ui/src/theme-tokens.ts";
import {
  E2E_IDENTITIES,
  expect,
  expectHydrated,
  signInAs,
  test,
} from "./fixtures.ts";
import { resetDatabase } from "./helpers/database.ts";

// Each file starts from the seeded identities, whatever ran before it.
test.beforeAll(() => resetDatabase());

const THEME_COOKIE_NAME = "darkfactory-theme";
const THEME_STORAGE_KEY = "darkfactory.anonymous-ui.v2";
const ANONYMOUS_SNAPSHOT_VERSION = 2;
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
const API_REQUEST_TIMEOUT_MILLISECONDS = 10_000;

const ACCOUNT_PROFILE_URL = /\/account\/profile$/;

type AppearancePreference = Appearance;
type AppearanceKey = keyof AppearancePreference;

const DEFAULT_APPEARANCE: AppearancePreference = {
  density: "default",
  fontSize: "default",
  radius: "small",
  theme: "system",
};
// Seeded DB preference for Alice (packages/db/src/seeds/preferences.ts).
const ALICE_SEED_APPEARANCE: AppearancePreference = {
  density: "comfortable",
  fontSize: "large",
  radius: "medium",
  theme: "nord",
};

// Computed results of the appearance variables in packages/ui/src/styles.css at a 16px root:
// body font-size = 1rem * --font-scale, padding = --spacing * 4, radius-md = 0.5rem * --radius-scale.
const BODY_FONT_SIZE_PX = {
  default: 15,
  large: 17,
  small: 14,
} as const satisfies Record<AppearancePreference["fontSize"], number>;
const SPACING_X4_PX = {
  comfortable: 16,
  compact: 12,
  default: 14,
} as const satisfies Record<AppearancePreference["density"], number>;
const RADIUS_MD_PX = {
  large: 12,
  medium: 8,
  none: 0,
  small: 4,
} as const satisfies Record<AppearancePreference["radius"], number>;

const APPEARANCE_ATTRIBUTES = [
  ["data-theme", "theme"],
  ["data-font-size", "fontSize"],
  ["data-density", "density"],
  ["data-radius", "radius"],
] as const satisfies readonly (readonly [string, AppearanceKey])[];

const APPEARANCE_SETTINGS = {
  density: { label: "Density", options: DENSITY_OPTIONS },
  fontSize: { label: "Font size", options: FONT_SIZE_OPTIONS },
  radius: { label: "Roundness", options: RADIUS_OPTIONS },
  theme: { label: "Theme", options: THEME_OPTIONS },
} as const;

const APPEARANCE_MENUS = {
  picker: {
    content: "#application-theme-content",
    idPrefix: "application-theme",
    trigger: "#application-theme-trigger",
  },
  user: {
    content: "#user-menu-content",
    idPrefix: "user-menu",
    trigger: "#user-menu-trigger",
  },
} as const;
type AppearanceMenu = keyof typeof APPEARANCE_MENUS;

type AppearanceMetrics = Readonly<{
  bodyFontSize: number;
  radiusMd: number;
  spacingX4: number;
}>;

type ThemeProbe = Readonly<{
  firstPaint: null | Readonly<{
    attributes: Readonly<Record<string, string | null>>;
    backgroundColor: string;
    color: string;
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
  appearance: AppearancePreference;
  authority: "anonymous" | "trusted";
  case: string;
  backgroundColor: string;
  concreteTheme: ConcreteThemeName;
  cookieMatches: boolean;
  cookieStatus: string | null;
  firstPaint: ThemeProbe["firstPaint"];
  metrics: AppearanceMetrics;
  nonTextRatios: Readonly<Record<string, number>>;
  tokenRatios: Readonly<Record<string, number>>;
  color: string;
  contrastRatio: number;
  effectiveScheme: string;
  localStorage: string | null;
  mutationCount: number;
}>;

type LayoutEvidence = Readonly<{
  case: string;
  clientWidth: number;
  scrollWidth: number;
  viewportWidth: number;
}>;

const optionLabel = (key: AppearanceKey, value: string): string => {
  const match = APPEARANCE_SETTINGS[key].options.find(
    (candidate) => candidate.value === value
  );
  if (match === undefined) {
    throw new Error(`Unknown ${key} appearance option: ${value}`);
  }
  return match.label;
};

/** Cookie wire format `<theme>:<fontSize>:<density>:<radius>`, URI-encoded. */
const encodedAppearance = (preference: AppearancePreference): string =>
  encodeURIComponent(
    `${preference.theme}:${preference.fontSize}:${preference.density}:${preference.radius}`
  );

/** The localStorage snapshot (`darkfactory.anonymous-ui.v2`) for a preference. */
const storedAppearance = (preference: AppearancePreference): string =>
  JSON.stringify({ version: ANONYMOUS_SNAPSHOT_VERSION, ...preference });

/** "system" resolves to the default light or dark theme from prefers-color-scheme. */
const concreteTheme = (
  theme: ThemeName,
  systemScheme: ColorScheme
): ConcreteThemeName => {
  if (theme !== "system") {
    return theme;
  }
  return systemScheme === "dark" ? "default-dark" : "default-light";
};

const hexToRgb = (hex: string): string => {
  const [red, green, blue] = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16)
  );
  return `rgb(${red}, ${green}, ${blue})`;
};

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
    const observedAttributes = [
      "data-theme",
      "data-font-size",
      "data-density",
      "data-radius",
    ];
    const instrumentedWindow = window as typeof window & {
      __DF_THEME_PROBE__?: {
        firstPaint: null | {
          attributes: Record<string, string | null>;
          backgroundColor: string;
          color: string;
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
    const startProbe = (): void => {
      const root = document.documentElement;
      if (root === null) {
        return;
      }
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
        attributeFilter: observedAttributes,
        attributeOldValue: true,
        attributes: true,
      });
      requestAnimationFrame(() => {
        const paintedElement = document.body ?? root;
        const paintedStyle = getComputedStyle(paintedElement);
        probe.firstPaint = {
          attributes: Object.fromEntries(
            observedAttributes.map((name) => [name, root.getAttribute(name)])
          ),
          backgroundColor: paintedStyle.backgroundColor,
          color: paintedStyle.color,
          time: performance.now(),
        };
      });
    };
    if (document.documentElement === null) {
      const rootObserver = new MutationObserver(() => {
        if (document.documentElement === null) {
          return;
        }
        rootObserver.disconnect();
        startProbe();
      });
      rootObserver.observe(document, { childList: true });
    } else {
      startProbe();
    }
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
  backgroundToken: string;
  color: string;
  contrastRatio: number;
  effectiveScheme: string;
  foregroundToken: string;
  nonTextRatios: Readonly<Record<string, number>>;
  tokenRatios: Readonly<Record<string, number>>;
}> =>
  page.evaluate(() => {
    // The production CSS minifier shortens colors such as #ffffff to #fff.
    const longHex = (value: string): string => {
      const normalized = value.trim().toLowerCase();
      return /^#[0-9a-f]{3}$/u.test(normalized)
        ? `#${[...normalized.slice(1)].map((digit) => digit + digit).join("")}`
        : normalized;
    };
    const channels = (value: string): readonly number[] => {
      const normalized = longHex(value);
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
    return {
      backgroundColor,
      backgroundToken: longHex(rootStyle.getPropertyValue("--background")),
      color,
      contrastRatio: ratio(color, backgroundColor),
      effectiveScheme: rootStyle.colorScheme,
      foregroundToken: longHex(rootStyle.getPropertyValue("--foreground")),
      nonTextRatios,
      tokenRatios,
    };
  });

/** Pixel results of the font-size, density, and roundness variables on the live document. */
const appearanceMetrics = async (page: Page): Promise<AppearanceMetrics> =>
  page.evaluate(() => {
    const sample = document.createElement("div");
    sample.setAttribute("aria-hidden", "true");
    sample.style.cssText =
      "position:absolute;visibility:hidden;pointer-events:none;padding:calc(var(--spacing) * 4);border-radius:var(--radius-md)";
    document.body.append(sample);
    const sampleStyle = getComputedStyle(sample);
    const metrics = {
      bodyFontSize: Number.parseFloat(getComputedStyle(document.body).fontSize),
      radiusMd: Number.parseFloat(sampleStyle.borderTopLeftRadius),
      spacingX4: Number.parseFloat(sampleStyle.paddingTop),
    };
    sample.remove();
    return metrics;
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

const readThemeProbe = async (page: Page): Promise<ThemeProbe> =>
  page.evaluate(() => {
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

const assertAppearance = async (
  page: Page,
  expected: AppearancePreference,
  options: Readonly<{
    authority: "anonymous" | "trusted";
    case: string;
    cookieStatus: "invalid" | "missing" | "valid";
    checkFirstPaint?: boolean;
    localStorage?: AppearancePreference | null;
    systemScheme?: ColorScheme;
  }>
): Promise<void> => {
  const root = page.locator("html");
  for (const [attribute, key] of APPEARANCE_ATTRIBUTES) {
    await expect(root).toHaveAttribute(attribute, expected[key]);
  }
  await expect(root).toHaveAttribute("data-theme-authority", options.authority);
  await expect(root).toHaveAttribute(
    "data-theme-cookie-status",
    options.cookieStatus
  );
  await expect.poll(() => cookieValue(page)).toBe(encodedAppearance(expected));
  if (options.localStorage !== undefined) {
    const expectedStorage =
      options.localStorage === null
        ? null
        : JSON.parse(storedAppearance(options.localStorage));
    await expect
      .poll(async () => {
        const stored = await localTheme(page);
        return stored === null ? null : JSON.parse(stored);
      })
      .toEqual(expectedStorage);
  }

  const resolvedTheme = concreteTheme(
    expected.theme,
    options.systemScheme ?? "light"
  );
  const themeTokens = THEME_TOKENS[resolvedTheme];
  await expect
    .poll(async () => {
      const current = await readableContrast(page);
      return {
        backgroundColor: current.backgroundColor,
        backgroundToken: current.backgroundToken,
        color: current.color,
        effectiveScheme: current.effectiveScheme,
        foregroundToken: current.foregroundToken,
      };
    }, `${options.case} renders ${resolvedTheme} colors`)
    .toEqual({
      backgroundColor: hexToRgb(themeTokens.tokens.background),
      backgroundToken: themeTokens.tokens.background.toLowerCase(),
      color: hexToRgb(themeTokens.tokens.foreground),
      effectiveScheme: themeTokens.colorScheme,
      foregroundToken: themeTokens.tokens.foreground.toLowerCase(),
    });
  const contrast = await readableContrast(page);
  expect(contrast.contrastRatio).toBeGreaterThanOrEqual(4.5);
  for (const [token, ratio] of Object.entries(contrast.tokenRatios)) {
    expect(ratio, `${token} semantic token contrast`).toBeGreaterThanOrEqual(
      4.5
    );
  }
  for (const [token, ratio] of Object.entries(contrast.nonTextRatios)) {
    expect(ratio, `${token} non-text contrast`).toBeGreaterThanOrEqual(3);
  }

  const metrics = await appearanceMetrics(page);
  expect(metrics, `${options.case} appearance metrics`).toEqual({
    bodyFontSize: BODY_FONT_SIZE_PX[expected.fontSize],
    radiusMd: RADIUS_MD_PX[expected.radius],
    spacingX4: SPACING_X4_PX[expected.density],
  });

  if (options.checkFirstPaint !== false) {
    await expect
      .poll(async () => (await readThemeProbe(page)).firstPaint)
      .not.toBeNull();
  }
  const probe = await readThemeProbe(page);
  if (options.checkFirstPaint !== false) {
    expect(probe.firstPaint).toMatchObject({
      attributes: Object.fromEntries(
        APPEARANCE_ATTRIBUTES.map(([attribute, key]) => [
          attribute,
          expected[key],
        ])
      ),
      backgroundColor: contrast.backgroundColor,
      color: contrast.color,
    });
    const lateFlashMutations = probe.mutations.filter((mutation) => {
      if (probe.firstPaint === null || mutation.time <= probe.firstPaint.time) {
        return false;
      }
      const entry = APPEARANCE_ATTRIBUTES.find(
        ([attribute]) => attribute === mutation.attribute
      );
      return entry === undefined || mutation.oldValue !== expected[entry[1]];
    });
    expect(
      lateFlashMutations,
      "appearance must not correct after first paint"
    ).toEqual([]);
  }
  runtimeEvidence.push({
    appearance: expected,
    authority: options.authority,
    backgroundColor: contrast.backgroundColor,
    case: options.case,
    color: contrast.color,
    concreteTheme: resolvedTheme,
    contrastRatio: contrast.contrastRatio,
    cookieMatches: (await cookieValue(page)) === encodedAppearance(expected),
    cookieStatus: await root.getAttribute("data-theme-cookie-status"),
    effectiveScheme: contrast.effectiveScheme,
    firstPaint: probe.firstPaint,
    localStorage: await localTheme(page),
    metrics,
    mutationCount: probe.mutations.length,
    nonTextRatios: contrast.nonTextRatios,
    tokenRatios: contrast.tokenRatios,
  });
};

/** Opens the standalone picker or the portal user menu and waits for its content. */
const openAppearanceMenu = async (
  page: Page,
  menu: AppearanceMenu
): Promise<Locator> => {
  const ids = APPEARANCE_MENUS[menu];
  const trigger = page.locator(ids.trigger);
  const content = page.locator(ids.content);
  await expectHydrated(trigger);
  if (menu === "user") {
    await expect(trigger).toHaveAttribute("data-hydration-state", "ready");
  }
  await expect(trigger).toBeEnabled();
  // A trigger replaced during hydration can swallow the first click; retry while closed.
  await expect(async () => {
    if (!(await content.isVisible())) {
      await trigger.click();
    }
    await expect(content).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  return content;
};

const selectAppearance = async (
  page: Page,
  menu: AppearanceMenu,
  key: AppearanceKey,
  value: string
): Promise<void> => {
  const ids = APPEARANCE_MENUS[menu];
  const content = await openAppearanceMenu(page, menu);
  const subTrigger = page.locator(`#${ids.idPrefix}-${key}-trigger`);
  await expect(subTrigger).toHaveRole("menuitem");
  await expect(subTrigger).toHaveAttribute("aria-haspopup", "menu");
  await subTrigger.focus();
  await subTrigger.press("ArrowRight");
  const option = page
    .getByRole("group", { exact: true, name: APPEARANCE_SETTINGS[key].label })
    .getByRole("menuitemradio", { exact: true, name: optionLabel(key, value) });
  await expect(option).toBeVisible();
  await option.click();
  await expect(content).toBeHidden();
  const attribute = APPEARANCE_ATTRIBUTES.find(
    ([, candidate]) => candidate === key
  );
  if (attribute !== undefined) {
    await expect(page.locator("html")).toHaveAttribute(attribute[0], value);
  }
};

const waitForAccountPage = async (
  page: Page,
  heading: string
): Promise<void> => {
  await expect(
    page.getByRole("heading", { level: 1, name: heading })
  ).toBeVisible();
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
  await expect(
    page.getByRole("button", { name: "Add an address" })
  ).toBeVisible();
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

const sameOriginRequestHeaders = (
  request: Request
): Record<string, string> => ({
  ...Object.fromEntries(request.headers.entries()),
  origin: new URL(request.url).origin,
  "sec-fetch-site": "same-origin",
});

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
      headers: sameOriginRequestHeaders(request),
      method,
      timeout: API_REQUEST_TIMEOUT_MILLISECONDS,
    });
    return new Response(Uint8Array.from(await response.body()), {
      headers: response.headers(),
      status: response.status(),
      statusText: response.statusText(),
    });
  };

const apiFor = (context: BrowserContext, baseURL: string): ApiClient =>
  createApiClient({
    baseUrl: baseURL,
    fetch: playwrightFetch(context.request),
  });

const serializeAdminListRequest = (
  baseURL: string,
  input: Readonly<{ cursor: string; limit: number }>
): Promise<Request> => {
  let resolveRequest!: (request: Request) => void;
  const captured = new Promise<Request>((resolve) => {
    resolveRequest = resolve;
  });
  const serializer = createApiClient({
    baseUrl: baseURL,
    fetch: (request) => {
      resolveRequest(request.clone());
      return Promise.resolve(
        new Response(JSON.stringify({ json: null }), {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      );
    },
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
    headers: sameOriginRequestHeaders(request),
    method,
    timeout: API_REQUEST_TIMEOUT_MILLISECONDS,
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
      test.setTimeout(120_000);
      await signInAs(page, E2E_IDENTITIES.alice);
      await restoreAliceAccount(page);

      try {
        await page.goto("/account/profile");
        await waitForAccountPage(page, "Profile");
        await page.locator("#displayName").fill("Alice Browser Evidence");
        await page.getByRole("button", { name: "Save profile" }).click();
        await expect(page.getByText("Profile saved.")).toBeVisible();
        await page.reload();
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
        await page.reload();
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
        await page.reload();
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
          await expect(freshPage).toHaveURL(ACCOUNT_PROFILE_URL);
          await waitForAccountPage(freshPage, "Profile");
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

        await page.reload();
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
      page,
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
        const memberSidebarLinks = memberPage
          .getByRole("navigation", { name: "Portal navigation" })
          .getByRole("link");
        await expect(memberSidebarLinks).toHaveCount(1);
        await expect(memberSidebarLinks.first()).toHaveAttribute(
          "href",
          "/dashboard"
        );
        const memberMenu = await openAppearanceMenu(memberPage, "user");
        await expect(
          memberMenu.getByRole("group", { exact: true, name: "Account" })
        ).toBeVisible();
        await expect(
          memberMenu.getByRole("group", { name: "Administration" })
        ).toHaveCount(0);
        await expect(
          memberMenu.getByRole("menuitem", { exact: true, name: "Users" })
        ).toHaveCount(0);
        await memberPage.keyboard.press("Escape");
        await expect(memberMenu).toBeHidden();
        await expect(
          memberPage.getByRole("link", { exact: true, name: "Users" })
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

      const adminContext = page.context();
      const adminPage = page;
      const assertAdminRuntime = monitorSecondaryPage(adminPage);
      await signInAs(adminPage, E2E_IDENTITIES.admin);
      await adminPage.goto("/admin/users");
      await expect(
        adminPage.getByRole("heading", { level: 1, name: "Users" })
      ).toBeVisible();
      const adminMenu = await openAppearanceMenu(adminPage, "user");
      const adminUsersItem = adminMenu
        .getByRole("group", { exact: true, name: "Administration" })
        .getByRole("menuitem", { exact: true, name: "Users" });
      await expect(adminUsersItem).toHaveAttribute("href", "/admin/users");
      await expect(adminUsersItem).toHaveAttribute("aria-current", "page");
      await adminPage.keyboard.press("Escape");
      await expect(adminMenu).toBeHidden();
      const directoryList = adminPage.locator("main").getByRole("list");
      const directoryItems = directoryList.getByRole("listitem");
      await expect(directoryItems).toHaveCount(CANONICAL_ADMIN_ORDER.length);
      for (const identity of Object.values(E2E_IDENTITIES)) {
        const canonicalItem = directoryItems.filter({
          hasText: identity.name,
        });
        await expect(canonicalItem).toBeVisible();
        await expect(
          canonicalItem.getByText(titleCase(identity.role), { exact: true })
        ).toBeVisible();
      }

      const searchInput = adminPage.getByRole("searchbox", {
        name: "Search users",
      });
      await expect(searchInput).toBeVisible();
      await searchInput.fill("Alice", { timeout: 5000 });
      await adminPage
        .getByRole("button", { exact: true, name: "Search" })
        .click({ timeout: 5000 });
      await expect(directoryItems).toHaveCount(1);
      await expect(
        directoryList.getByText(E2E_IDENTITIES.alice.name, { exact: true })
      ).toBeVisible();
      await adminPage.getByRole("button", { name: "Clear search" }).click();
      await expect(directoryItems).toHaveCount(CANONICAL_ADMIN_ORDER.length);

      const adminSessionResponse = await adminContext.request.get(
        "/api/auth/get-session"
      );
      const adminSessionBody = (await adminSessionResponse.json()) as {
        user?: { id?: unknown; role?: unknown };
      };
      expect({
        id: adminSessionBody.user?.id,
        role: adminSessionBody.user?.role,
      }).toEqual({
        id: E2E_IDENTITIES.admin.id,
        role: E2E_IDENTITIES.admin.role,
      });

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
      const rawPage = await executeRawRequest(adminContext.request, rawRequest);
      expect(rawPage.status).toBe(200);
      expect(rawPage.body).toMatchObject({
        json: {
          items: [expect.objectContaining({ id: expect.any(String) })],
        },
      });
      const rawSecondPage = rawPage.body as {
        json: { items: readonly { id: string }[] };
      };
      expect(rawSecondPage.json.items[0]?.id).not.toBe(firstPage.items[0]?.id);

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
    });

    test("mobile portal navigation and user menu remain complete and width-safe at 375px", async ({
      baseURL,
      browser,
      page,
    }) => {
      const resolvedBaseURL = requireBaseURL(baseURL);
      await page.setViewportSize({ height: 812, width: 375 });
      const memberPage = page;
      const assertMemberRuntime = monitorSecondaryPage(memberPage);
      await signInAs(memberPage, E2E_IDENTITIES.alice);
      await memberPage.goto("/account/profile");
      await waitForAccountPage(memberPage, "Profile");
      const memberTrigger = memberPage.getByRole("button", {
        name: "Open portal navigation",
      });
      await expect(memberTrigger).toHaveAttribute(
        "popovertarget",
        "portal-navigation"
      );
      await expect(memberTrigger).toBeEnabled();
      await assertTouchTarget(memberTrigger);
      await memberTrigger.focus();
      await memberTrigger.press("Enter");
      const portalNavigation = memberPage.getByRole("navigation", {
        name: "Mobile portal navigation",
      });
      await expect(portalNavigation).toBeVisible();
      const memberDialog = memberPage.getByRole("dialog", {
        name: "Navigation",
      });
      await expect(memberDialog).toBeVisible();
      const portalLinks = portalNavigation.getByRole("link");
      await expect(portalLinks).toHaveCount(1);
      await expect(portalLinks.first()).toHaveAttribute("href", "/dashboard");
      await expect(portalLinks.first()).toContainText("Overview");
      await assertTouchTarget(portalLinks.first());
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
      await memberPage.keyboard.press("Escape");
      await expect(memberDialog).toBeHidden();
      await expect(memberTrigger).toBeFocused();

      const assertMenuWithinViewport = async (
        targetPage: Page,
        menu: Locator,
        caseName: string
      ): Promise<void> => {
        const box = await menu.boundingBox();
        expect(box, `${caseName} menu must render`).not.toBeNull();
        expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
        expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
          (targetPage.viewportSize()?.width ?? 0) + 1
        );
        await assertNoHorizontalOverflow(targetPage, caseName);
      };

      const memberUserTrigger = memberPage.locator("#user-menu-trigger");
      await expectHydrated(memberUserTrigger);
      await expect(memberUserTrigger).toHaveAttribute(
        "data-hydration-state",
        "ready"
      );
      await expect(memberUserTrigger).toHaveAccessibleName(
        E2E_IDENTITIES.alice.name
      );
      await assertTouchTarget(memberUserTrigger);
      await memberUserTrigger.focus();
      await memberUserTrigger.press("Enter");
      const memberMenu = memberPage.locator("#user-menu-content");
      await expect(memberMenu).toBeVisible();
      await expect(memberMenu).toHaveRole("menu");
      const accountGroup = memberMenu.getByRole("group", {
        exact: true,
        name: "Account",
      });
      for (const [label, href] of [
        ["Profile", "/account/profile"],
        ["Address", "/account/address"],
        ["Preferences", "/account/preferences"],
        ["Security", "/account/security"],
      ] as const) {
        const accountItem = accountGroup.getByRole("menuitem", {
          exact: true,
          name: label,
        });
        await expect(accountItem).toHaveAttribute("href", href);
        await assertTouchTarget(accountItem);
      }
      await expect(
        accountGroup.getByRole("menuitem", { exact: true, name: "Profile" })
      ).toHaveAttribute("aria-current", "page");
      await expect(
        memberMenu.getByRole("group", { name: "Administration" })
      ).toHaveCount(0);
      await expect(
        memberMenu.getByRole("menuitem", { exact: true, name: "Sign out" })
      ).toBeVisible();
      await assertMenuWithinViewport(
        memberPage,
        memberMenu,
        "account-mobile-375"
      );
      await memberPage.keyboard.press("Escape");
      await expect(memberMenu).toBeHidden();
      await expect(memberUserTrigger).toBeFocused();
      assertMemberRuntime();

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
        await expect(
          adminPage.getByRole("heading", { level: 1, name: "Users" })
        ).toBeVisible();
        const adminUserTrigger = adminPage.locator("#user-menu-trigger");
        await expectHydrated(adminUserTrigger);
        await expect(adminUserTrigger).toHaveAttribute(
          "data-hydration-state",
          "ready"
        );
        await expect(adminUserTrigger).toHaveAccessibleName(
          E2E_IDENTITIES.admin.name
        );
        await assertTouchTarget(adminUserTrigger);
        await adminUserTrigger.focus();
        await adminUserTrigger.press("ArrowDown");
        const adminMenu = adminPage.locator("#user-menu-content");
        await expect(adminMenu).toBeVisible();
        const usersItem = adminMenu
          .getByRole("group", { exact: true, name: "Administration" })
          .getByRole("menuitem", { exact: true, name: "Users" });
        await expect(usersItem).toHaveAttribute("href", "/admin/users");
        await expect(usersItem).toHaveAttribute("aria-current", "page");
        await assertTouchTarget(usersItem);
        for (const item of await adminMenu
          .getByRole("group", { exact: true, name: "Account" })
          .getByRole("menuitem")
          .all()) {
          await assertTouchTarget(item);
        }
        await assertMenuWithinViewport(
          adminPage,
          adminMenu,
          "admin-mobile-375"
        );
        await adminPage.keyboard.press("Escape");
        await expect(adminMenu).toBeHidden();
        await expect(adminUserTrigger).toBeFocused();
        await adminUserTrigger.press("Enter");
        await expect(adminMenu).toBeVisible();
        await usersItem.press("Enter");
        await expect(adminMenu).toBeHidden();
        await expect(adminPage).toHaveURL(/\/admin\/users$/);
        await assertNoHorizontalOverflow(adminPage, "admin-mobile-375-closed");
        assertAdminRuntime();
      } finally {
        await adminContext.close();
      }
    });

    test("anonymous appearance precedence, all 11 themes, font size, density, and roundness persist without flash", async ({
      baseURL,
      browser,
      page,
    }) => {
      test.setTimeout(240_000);
      const resolvedBaseURL = requireBaseURL(baseURL);
      const localPreference: AppearancePreference = {
        density: "compact",
        fontSize: "large",
        radius: "large",
        theme: "rose-pine",
      };
      const cookiePreference: AppearancePreference = {
        density: "comfortable",
        fontSize: "small",
        radius: "none",
        theme: "catppuccin-latte",
      };
      const waitForAnonymousThemeReady = async (
        targetPage: Page
      ): Promise<void> => {
        await expect(
          targetPage.locator("#application-theme-trigger")
        ).toHaveAccessibleName("Appearance settings", { timeout: 5000 });
        await expect(targetPage.locator("html")).toHaveAttribute(
          "data-theme-authority",
          "anonymous",
          { timeout: 5000 }
        );
      };
      const gotoAnonymousThemeRoot = async (
        targetPage: Page
      ): Promise<void> => {
        await targetPage.goto("/", { waitUntil: "domcontentloaded" });
        await waitForAnonymousThemeReady(targetPage);
      };
      const reloadAnonymousTheme = async (targetPage: Page): Promise<void> => {
        await targetPage.reload({ waitUntil: "domcontentloaded" });
        await waitForAnonymousThemeReady(targetPage);
      };
      const closeContextBounded = async (
        context: BrowserContext,
        label: string
      ): Promise<void> => {
        let timer: NodeJS.Timeout | undefined;
        try {
          await Promise.race([
            context.close(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(`${label} context close exceeded 2 seconds.`)
                  ),
                2000
              );
            }),
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      const throwContextFailures = (
        failures: readonly unknown[],
        label: string
      ): void => {
        if (failures.length === 1) {
          throw failures[0];
        }
        if (failures.length > 1) {
          throw new AggregateError(
            failures,
            `${label} journey and context cleanup both failed.`
          );
        }
      };

      const localContext = page.context();
      await installThemeProbe(localContext);
      await localContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: storedAppearance(localPreference) }
      );
      const localPage = page;
      const assertLocalRuntime = monitorSecondaryPage(localPage);
      await gotoAnonymousThemeRoot(localPage);
      await assertAppearance(localPage, localPreference, {
        authority: "anonymous",
        case: "missing-cookie-uses-local-storage",
        cookieStatus: "missing",
        localStorage: localPreference,
      });
      assertLocalRuntime();

      const cookieContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      await cookieContext.addCookies([
        {
          name: THEME_COOKIE_NAME,
          url: resolvedBaseURL,
          value: encodedAppearance(cookiePreference),
        },
      ]);
      await cookieContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: storedAppearance(localPreference) }
      );
      const cookiePage = await cookieContext.newPage();
      const assertCookieRuntime = monitorSecondaryPage(cookiePage);
      const cookieFailures: unknown[] = [];
      try {
        await gotoAnonymousThemeRoot(cookiePage);
        await assertAppearance(cookiePage, cookiePreference, {
          authority: "anonymous",
          case: "valid-cookie-beats-local-storage",
          cookieStatus: "valid",
          localStorage: cookiePreference,
        });
        assertCookieRuntime();
      } catch (error) {
        cookieFailures.push(error);
      }
      try {
        await closeContextBounded(cookieContext, "Cookie precedence");
      } catch (error) {
        cookieFailures.push(error);
      }
      throwContextFailures(cookieFailures, "Cookie precedence");

      for (const [caseName, invalidValue] of [
        ["invalid-cookie-rejects-local-storage", "invalid"],
        // The retired two-part `<mode>:<palette>` format is invalid, not migrated.
        ["legacy-cookie-rejects-local-storage", "dark%3Aviolet"],
      ] as const) {
        const invalidContext = await newConfiguredContext(
          browser,
          resolvedBaseURL
        );
        await invalidContext.addCookies([
          {
            name: THEME_COOKIE_NAME,
            url: resolvedBaseURL,
            value: invalidValue,
          },
        ]);
        await invalidContext.addInitScript(
          ({ key, value }) => localStorage.setItem(key, value),
          { key: THEME_STORAGE_KEY, value: storedAppearance(localPreference) }
        );
        const invalidPage = await invalidContext.newPage();
        const assertInvalidRuntime = monitorSecondaryPage(invalidPage);
        const invalidFailures: unknown[] = [];
        try {
          await gotoAnonymousThemeRoot(invalidPage);
          await assertAppearance(invalidPage, DEFAULT_APPEARANCE, {
            authority: "anonymous",
            case: caseName,
            cookieStatus: "invalid",
            localStorage: DEFAULT_APPEARANCE,
          });
          assertInvalidRuntime();
        } catch (error) {
          invalidFailures.push(error);
        }
        try {
          await closeContextBounded(invalidContext, caseName);
        } catch (error) {
          invalidFailures.push(error);
        }
        throwContextFailures(invalidFailures, caseName);
      }

      const matrixContext = await newConfiguredContext(
        browser,
        resolvedBaseURL
      );
      const matrixPage = await matrixContext.newPage();
      const assertMatrixRuntime = monitorSecondaryPage(matrixPage);
      const matrixFailures: unknown[] = [];
      try {
        await matrixPage.emulateMedia({ colorScheme: "light" });
        await gotoAnonymousThemeRoot(matrixPage);
        await assertAppearance(matrixPage, DEFAULT_APPEARANCE, {
          authority: "anonymous",
          case: "initial-first-paint",
          cookieStatus: "missing",
          localStorage: DEFAULT_APPEARANCE,
        });

        // Keyboard: open the picker, move between submenus, choose a theme, close with Escape.
        const themeTrigger = matrixPage.getByRole("button", {
          exact: true,
          name: "Appearance settings",
        });
        const pickerMenu = matrixPage.locator("#application-theme-content");
        const themeSubTrigger = matrixPage.locator(
          "#application-theme-theme-trigger"
        );
        await expectHydrated(themeTrigger);
        await themeTrigger.focus();
        await themeTrigger.press("Enter");
        await expect(pickerMenu).toBeVisible();
        await expect(pickerMenu).toHaveRole("menu");
        const subTriggers = pickerMenu.locator('[aria-haspopup="menu"]');
        await expect(subTriggers).toHaveCount(4);
        for (const [index, key] of (
          ["theme", "fontSize", "density", "radius"] as const
        ).entries()) {
          await expect(subTriggers.nth(index)).toHaveRole("menuitem");
          await expect(subTriggers.nth(index)).toHaveAccessibleName(
            new RegExp(
              `^${APPEARANCE_SETTINGS[key].label}\\s*${optionLabel(key, DEFAULT_APPEARANCE[key])}$`,
              "u"
            )
          );
        }
        await expect(themeSubTrigger).toBeFocused();
        await matrixPage.keyboard.press("ArrowDown");
        await expect(
          matrixPage.locator("#application-theme-fontSize-trigger")
        ).toBeFocused();
        await matrixPage.keyboard.press("ArrowUp");
        await expect(themeSubTrigger).toBeFocused();
        await matrixPage.keyboard.press("ArrowRight");
        const themeGroup = matrixPage.getByRole("group", {
          exact: true,
          name: "Theme",
        });
        await expect(
          themeGroup.getByRole("menuitemradio", { exact: true, name: "System" })
        ).toBeFocused();
        await expect(themeGroup.getByRole("menuitemradio")).toHaveText(
          THEME_OPTIONS.map((option) => option.label)
        );
        for (const option of THEME_OPTIONS) {
          const item = themeGroup.getByRole("menuitemradio", {
            exact: true,
            name: option.label,
          });
          const swatch = item.locator(
            `.theme-swatch[data-theme-swatch="${option.value}"]`
          );
          const swatchBox = await swatch.boundingBox();
          const labelBox = await item
            .getByText(option.label, { exact: true })
            .boundingBox();
          expect(swatchBox?.width).toBeCloseTo(20, 0);
          expect(swatchBox?.height).toBeCloseTo(20, 0);
          expect(
            (labelBox?.x ?? 0) -
              ((swatchBox?.x ?? 0) + (swatchBox?.width ?? 0)),
            `${option.label} swatch gap`
          ).toBeGreaterThanOrEqual(12);
          await assertTouchTarget(item);
        }
        await matrixPage.keyboard.press("ArrowDown");
        await expect(
          themeGroup.getByRole("menuitemradio", {
            exact: true,
            name: "Default Dark",
          })
        ).toBeFocused();
        await matrixPage.keyboard.press("Enter");
        await expect(matrixPage.locator("html")).toHaveAttribute(
          "data-theme",
          "default-dark"
        );
        await expect(pickerMenu).toBeHidden();
        await expect(themeTrigger).toBeFocused();
        await themeTrigger.press("Enter");
        await expect(pickerMenu).toBeVisible();
        await matrixPage.keyboard.press("Escape");
        await expect(pickerMenu).toBeHidden();
        await expect(themeTrigger).toBeFocused();

        let current: AppearancePreference = {
          ...DEFAULT_APPEARANCE,
          theme: "default-dark",
        };
        for (const theme of THEME_NAMES) {
          await selectAppearance(matrixPage, "picker", "theme", theme);
          current = { ...current, theme };
          await reloadAnonymousTheme(matrixPage);
          await assertAppearance(matrixPage, current, {
            authority: "anonymous",
            case: `matrix-theme-${theme}${theme === "system" ? "-light" : ""}`,
            cookieStatus: "valid",
            localStorage: current,
          });
          if (theme === "system") {
            await matrixPage.emulateMedia({ colorScheme: "dark" });
            await reloadAnonymousTheme(matrixPage);
            await assertAppearance(matrixPage, current, {
              authority: "anonymous",
              case: "matrix-theme-system-dark",
              cookieStatus: "valid",
              localStorage: current,
              systemScheme: "dark",
            });
            await matrixPage.emulateMedia({ colorScheme: "light" });
          }
        }
        for (const key of ["fontSize", "density", "radius"] as const) {
          for (const option of APPEARANCE_SETTINGS[key].options) {
            await selectAppearance(matrixPage, "picker", key, option.value);
            current = { ...current, [key]: option.value };
            await reloadAnonymousTheme(matrixPage);
            await assertAppearance(matrixPage, current, {
              authority: "anonymous",
              case: `matrix-${key}-${option.value}`,
              cookieStatus: "valid",
              localStorage: current,
            });
          }
        }

        // The tightest combination still keeps 44px interactive targets.
        await selectAppearance(matrixPage, "picker", "fontSize", "small");
        await selectAppearance(matrixPage, "picker", "density", "compact");
        current = { ...current, density: "compact", fontSize: "small" };
        await assertAppearance(matrixPage, current, {
          authority: "anonymous",
          case: "final-compact-small-state",
          checkFirstPaint: false,
          cookieStatus: "valid",
          localStorage: current,
        });
        await assertTouchTarget(themeTrigger);
        await openAppearanceMenu(matrixPage, "picker");
        for (const item of await pickerMenu.getByRole("menuitem").all()) {
          await assertTouchTarget(item);
        }
        await matrixPage.keyboard.press("Escape");
        await expect(pickerMenu).toBeHidden();
        await assertNoHorizontalOverflow(matrixPage, "theme-desktop");
        assertMatrixRuntime();
      } catch (error) {
        matrixFailures.push(error);
      }
      try {
        await closeContextBounded(matrixContext, "Theme matrix");
      } catch (error) {
        matrixFailures.push(error);
      }
      throwContextFailures(matrixFailures, "Theme matrix");
    });

    test("trusted Alice DB appearance beats anonymous state on login and reload, persists through DB, and restores", async ({
      baseURL,
      browser,
      page,
    }, testInfo) => {
      test.setTimeout(120_000);
      const resolvedBaseURL = requireBaseURL(baseURL);
      const anonymousPreference: AppearancePreference = {
        density: "compact",
        fontSize: "small",
        radius: "none",
        theme: "catppuccin-latte",
      };
      const trustedChange: AppearancePreference = {
        density: "compact",
        fontSize: "small",
        radius: "large",
        theme: "gruvbox-dark",
      };
      const loginContext = page.context();
      await installThemeProbe(loginContext);
      const loginPage = page;
      const assertLoginRuntime = monitorSecondaryPage(loginPage);
      await signInAs(loginPage, E2E_IDENTITIES.alice);
      const loginRoot = loginPage.locator("html");
      await expect(loginRoot).toHaveAttribute(
        "data-theme-authority",
        "trusted"
      );
      for (const [attribute, key] of APPEARANCE_ATTRIBUTES) {
        await expect(loginRoot).toHaveAttribute(
          attribute,
          ALICE_SEED_APPEARANCE[key]
        );
      }
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
          value: encodedAppearance(anonymousPreference),
        },
      ]);
      await trustedContext.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: storedAppearance(anonymousPreference) }
      );
      const trustedPage = await trustedContext.newPage();
      const assertTrustedRuntime = monitorSecondaryPage(trustedPage);
      const trustedApi = apiFor(trustedContext, resolvedBaseURL);
      const cleanupApi = apiFor(loginContext, resolvedBaseURL);
      const selectTrustedAppearance = async (
        preference: AppearancePreference
      ): Promise<void> => {
        for (const [, key] of APPEARANCE_ATTRIBUTES) {
          await selectAppearance(trustedPage, "user", key, preference[key]);
          await expect(trustedPage.locator("#user-menu-trigger")).toBeEnabled();
        }
        await expect
          .poll(async () => trustedApi.preferences.theme.get({}))
          .toMatchObject({ ...preference });
      };
      let themeRestored = true;
      const failures: unknown[] = [];
      try {
        await trustedPage.goto("/dashboard", {
          waitUntil: "load",
        });
        await assertAppearance(trustedPage, ALICE_SEED_APPEARANCE, {
          authority: "trusted",
          case: "trusted-db-beats-cookie-and-local-storage",
          cookieStatus: "valid",
          localStorage: anonymousPreference,
        });

        themeRestored = false;
        await selectTrustedAppearance(trustedChange);
        await trustedPage.reload({ waitUntil: "load" });
        await assertAppearance(trustedPage, trustedChange, {
          authority: "trusted",
          case: "trusted-db-persists-reload",
          cookieStatus: "valid",
          localStorage: anonymousPreference,
        });
        await selectTrustedAppearance(ALICE_SEED_APPEARANCE);
        themeRestored = true;
        await trustedPage.reload({ waitUntil: "load" });
        await assertAppearance(trustedPage, ALICE_SEED_APPEARANCE, {
          authority: "trusted",
          case: "trusted-seed-restored",
          cookieStatus: "valid",
          localStorage: anonymousPreference,
        });
        await trustedPage.goto("/", { waitUntil: "load" });
        await assertAppearance(trustedPage, ALICE_SEED_APPEARANCE, {
          authority: "trusted",
          case: "trusted-public-restored",
          cookieStatus: "valid",
          localStorage: anonymousPreference,
        });
        await assertNoHorizontalOverflow(trustedPage, "trusted-public-desktop");
      } catch (error) {
        failures.push(error);
      }
      if (!themeRestored) {
        try {
          const stored = await cleanupApi.preferences.theme.get({});
          if (
            APPEARANCE_ATTRIBUTES.some(
              ([, key]) => stored[key] !== ALICE_SEED_APPEARANCE[key]
            )
          ) {
            await cleanupApi.preferences.theme.update({
              ...ALICE_SEED_APPEARANCE,
              expectedUpdatedAt: stored.updatedAt,
            });
          }
        } catch (error) {
          failures.push(error);
        }
      }
      try {
        assertTrustedRuntime();
      } catch (error) {
        failures.push(error);
      }
      try {
        await trustedContext.close();
      } catch (error) {
        failures.push(error);
      }
      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          "Trusted theme journey and cleanup both failed."
        );
      }
      assertLoginRuntime();
      const matrixCases = runtimeEvidence.filter((record) =>
        record.case.startsWith("matrix-theme-")
      );
      // Every theme once, plus "system" under both emulated color schemes.
      expect(matrixCases).toHaveLength(THEME_NAMES.length + 1);
      expect(
        new Set(matrixCases.map((record) => record.concreteTheme))
      ).toEqual(new Set(Object.keys(THEME_TOKENS)));
      expect(
        runtimeEvidence.filter(
          (record) => record.case === "initial-first-paint"
        )
      ).toHaveLength(1);
      const evidence = JSON.stringify(
        {
          artifactProfile: "no-binary",
          generatedAt: new Date().toISOString(),
          layout: layoutEvidence,
          theme: runtimeEvidence,
          themes: THEME_NAMES.length,
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
