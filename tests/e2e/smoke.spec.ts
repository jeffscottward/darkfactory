import { expect, test, type Page } from "@playwright/test";

const THEME_TRIGGER_NAME = /^Theme settings(?: unavailable)?$/;

const viewportCases = [
  { height: 812, name: "mobile", width: 375 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

interface BrowserErrorCounts {
  consoleErrorCount: number;
  pageErrorCount: number;
}

const browserErrorsByPage = new WeakMap<Page, BrowserErrorCounts>();

test.beforeEach(({ page }) => {
  const browserErrors: BrowserErrorCounts = {
    consoleErrorCount: 0,
    pageErrorCount: 0,
  };
  browserErrorsByPage.set(page, browserErrors);

  page.on("pageerror", () => {
    browserErrors.pageErrorCount += 1;
  });
  page.on("console", (message) => {
    if (message.type() === "error") {
      browserErrors.consoleErrorCount += 1;
    }
  });
});

test.afterEach(({ page }) => {
  expect(browserErrorsByPage.get(page)).toEqual({
    consoleErrorCount: 0,
    pageErrorCount: 0,
  });
});

test("home page exposes its foundation identity and journey", async ({
  baseURL,
  page,
}) => {
  if (baseURL === undefined) {
    throw new Error(
      "Playwright baseURL must be configured for the smoke journey."
    );
  }

  await page.goto("/");

  await expect(page).toHaveTitle("DarkFactory");
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "DarkFactory", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Production structure without a borrowed business domain.",
    })
  ).toBeVisible();

  const foundationLink = page.getByRole("link", {
    name: "Read the foundation",
  });
  await expect(foundationLink).toHaveAttribute(
    "href",
    "#foundation-capabilities"
  );
  await foundationLink.click();

  const capabilities = page.getByRole("region", {
    name: "Boundaries you can see, test, and replace.",
  });
  await expect(page).toHaveURL(
    new URL("/#foundation-capabilities", baseURL).href
  );
  await expect(capabilities).toBeVisible();
  await expect(capabilities).toBeFocused();
});

for (const viewport of viewportCases) {
  test(`sole-route shell works at ${viewport.name} width`, async ({ page }) => {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Open navigation" })
    ).toHaveCount(0);

    const themeTrigger = page.getByRole("button", {
      name: THEME_TRIGGER_NAME,
    });
    await expect(themeTrigger).toBeVisible();
    await themeTrigger.focus();
    await expect(themeTrigger).toBeFocused();
    await themeTrigger.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(themeTrigger).toBeFocused();

    const documentWidth = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    expect(
      documentWidth.scrollWidth,
      `${viewport.name} document should not overflow horizontally`
    ).toBeLessThanOrEqual(documentWidth.clientWidth + 1);
  });
}
