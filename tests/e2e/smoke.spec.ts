import { expect, test } from "./fixtures";

const THEME_TRIGGER_NAME = "Theme settings";

const viewportCases = [
  { height: 812, name: "mobile", width: 375 },
  { height: 900, name: "desktop", width: 1440 },
] as const;

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

  await expect(page).toHaveTitle("Application foundation | DarkFactory");
  await expect(
    page
      .getByRole("banner")
      .getByRole("link", { name: "DarkFactory", exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Build the product. Keep the foundation legible.",
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
    name: "A small core with visible extension points.",
  });
  await expect(page).toHaveURL(
    new URL("/#foundation-capabilities", baseURL).href
  );
  await expect(capabilities).toBeVisible();
  await expect(capabilities).toBeFocused();
});

for (const viewport of viewportCases) {
  test(`public shell navigation works at ${viewport.name} width`, async ({
    page,
  }) => {
    await page.setViewportSize({
      height: viewport.height,
      width: viewport.width,
    });
    await page.goto("/", { waitUntil: "networkidle" });

    await expect(page.getByRole("navigation")).toHaveCount(
      viewport.name === "mobile" ? 1 : 2
    );
    const navigationTrigger = page.getByRole("button", {
      name: "Open navigation",
    });
    if (viewport.name === "mobile") {
      await expect(navigationTrigger).toBeVisible();
      await navigationTrigger.click();
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" })
      ).toBeVisible();
      await expect(
        page
          .getByRole("navigation", { name: "Mobile navigation" })
          .getByRole("link", { name: "Contact" })
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(
        page.getByRole("navigation", { name: "Mobile navigation" })
      ).toBeHidden();
    } else {
      await expect(navigationTrigger).toHaveCount(0);
      await expect(
        page.getByRole("navigation", { name: "Primary navigation" })
      ).toBeVisible();
    }

    const themeTrigger = page.getByRole("button", {
      name: THEME_TRIGGER_NAME,
    });
    await expect(themeTrigger).toBeVisible();
    await expect(themeTrigger).toBeEnabled();
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
