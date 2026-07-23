import { expect, test } from "@playwright/test";

test("home page exposes its identity and primary navigation", async ({
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
    page.getByRole("heading", { level: 1, name: "DarkFactory" })
  ).toBeVisible();

  const primaryNavigation = page.getByRole("navigation", { name: "Primary" });
  await expect(primaryNavigation).toBeVisible();

  const homeLink = primaryNavigation.getByRole("link", { name: "Home" });
  await expect(homeLink).toHaveAttribute("aria-current", "page");
  await homeLink.click();

  await expect(page).toHaveURL(new URL("/", baseURL).href);
  await expect(
    page.getByRole("heading", { level: 1, name: "DarkFactory" })
  ).toBeVisible();
});
