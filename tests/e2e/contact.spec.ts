import { expect, test } from "@playwright/test";

test.describe("DF-076 public contact form", () => {
  test("validates, focuses, prevents duplicate submission, and preserves values on failure", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");

    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Talk to the people behind the system.",
      })
    ).toBeVisible();

    const form = page.locator("#contact-form");
    const name = page.locator("#name");
    const email = page.locator("#email");
    await name.fill(" ");
    await email.focus();
    await expect(page.getByText("Enter your name.")).toBeVisible();
    await email.fill("invalid");
    await page.locator("#subject").focus();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();
    await page.locator("#subject").fill(" ");
    await page.locator("#message").focus();
    await expect(page.getByText("Enter a subject.")).toBeVisible();
    await page.locator("#message").fill(" ");
    await name.focus();
    await expect(page.getByText("Enter a message.")).toBeVisible();
    await form.evaluate((element: HTMLFormElement) => element.requestSubmit());
    await expect(name).toBeFocused();
    await expect(page.getByRole("alert")).toHaveCount(1);
    await expect(page.getByRole("alert")).toContainText(
      "Review the highlighted fields. Your message was not submitted."
    );

    const values = {
      name: "Ada Browser",
      email: "ada.browser@example.test",
      subject: "Browser contact check",
      message: "Preserve these values when delivery fails.",
    };
    await page.locator("#name").fill(values.name);
    await page.locator("#email").fill(values.email);
    await page.locator("#subject").fill(values.subject);
    await page.locator("#message").fill(values.message);

    let submissions = 0;
    await page.route("**/api/orpc/contact/submit", async (route) => {
      submissions += 1;
      await page.waitForTimeout(250);
      await route.abort("failed");
    });

    await form.evaluate((element: HTMLFormElement) => {
      element.requestSubmit();
      element.requestSubmit();
    });
    await expect(
      page.getByRole("alert").filter({
        hasText:
          "Your message could not be submitted. It was not sent. Try again.",
      })
    ).toBeVisible();

    expect(submissions).toBe(1);
    await expect(page.locator("#name")).toHaveValue(values.name);
    await expect(page.locator("#email")).toHaveValue(values.email);
    await expect(page.locator("#subject")).toHaveValue(values.subject);
    await expect(page.locator("#message")).toHaveValue(values.message);

    const layout = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      submitHeight: document
        .querySelector<HTMLButtonElement>("#contact-form button[type=submit]")
        ?.getBoundingClientRect().height,
    }));
    expect(layout.scrollWidth).toBe(layout.viewport);
    expect(layout.submitHeight).toBeGreaterThanOrEqual(44);
  });

  test("reports sent, previewed, and not-delivered outcomes truthfully", async ({
    page,
  }) => {
    const values = {
      name: "Ada Outcomes",
      email: "ada.outcomes@example.test",
      subject: "Outcome check",
      message: "Report the exact delivery outcome.",
    };
    const scenarios = [
      {
        status: "sent",
        message: "Your message was sent.",
        resets: true,
      },
      {
        status: "previewed",
        message:
          "Your message was saved to the local email preview. It was not sent.",
        resets: false,
      },
      {
        status: "not-delivered",
        message:
          "Contact delivery is not configured. Your message was not sent.",
        resets: false,
      },
    ] as const;

    for (const scenario of scenarios) {
      await page.unroute("**/api/orpc/contact/submit");
      await page.route("**/api/orpc/contact/submit", (route) =>
        route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({ json: { status: scenario.status } }),
        })
      );
      await page.goto("/contact");
      await page.waitForLoadState("networkidle");
      await page.locator("#name").fill(values.name);
      await page.locator("#email").fill(values.email);
      await page.locator("#subject").fill(values.subject);
      await page.locator("#message").fill(values.message);
      await page.getByRole("button", { name: "Send message" }).click();
      await expect(page.getByText(scenario.message)).toBeVisible();
      await expect(page.locator("#name")).toHaveValue(
        scenario.resets ? "" : values.name
      );
    }
  });

  test("preserves input for typed 429 and 503 errors and permits retry", async ({
    page,
  }) => {
    const values = {
      name: "Ada Retry",
      email: "ada.retry@example.test",
      subject: "Retry check",
      message: "Keep these values until a successful retry.",
    };
    let code: "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE" | "sent" =
      "TOO_MANY_REQUESTS";
    await page.route("**/api/orpc/contact/submit", (route) => {
      if (code === "sent") {
        return route.fulfill({
          contentType: "application/json",
          status: 200,
          body: JSON.stringify({ json: { status: "sent" } }),
        });
      }
      const status = code === "TOO_MANY_REQUESTS" ? 429 : 503;
      return route.fulfill({
        contentType: "application/json",
        status,
        body: JSON.stringify({
          json: {
            defined: true,
            code,
            status,
            message: code,
          },
        }),
      });
    });
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");
    await page.locator("#name").fill(values.name);
    await page.locator("#email").fill(values.email);
    await page.locator("#subject").fill(values.subject);
    await page.locator("#message").fill(values.message);

    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText(
        "Too many messages were submitted. Try again in 15 minutes."
      )
    ).toBeVisible();
    await expect(page.locator("#message")).toHaveValue(values.message);

    code = "SERVICE_UNAVAILABLE";
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(
      page.getByText(
        "Email delivery is temporarily unavailable. Your message was not sent. Try again later."
      )
    ).toBeVisible();
    await expect(page.locator("#message")).toHaveValue(values.message);

    code = "sent";
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("Your message was sent.")).toBeVisible();
    await expect(page.locator("#message")).toHaveValue("");
  });

  test("disables the submit control and exposes loading text while pending", async ({
    page,
  }) => {
    await page.route("**/api/orpc/contact/submit", async (route) => {
      await page.waitForTimeout(500);
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({ json: { status: "sent" } }),
      });
    });
    await page.goto("/contact");
    await page.waitForLoadState("networkidle");
    await page.locator("#name").fill("Ada Pending");
    await page.locator("#email").fill("ada.pending@example.test");
    await page.locator("#subject").fill("Pending state");
    await page.locator("#message").fill("Keep this request pending briefly.");
    const submit = page.getByRole("button", { name: "Send message" });

    await submit.click();
    await expect(
      page.getByRole("button", { name: "Sending message" })
    ).toBeDisabled();
    await expect(page.getByText("Your message was sent.")).toBeVisible();
  });

  test("keeps touch targets and width safe across required viewports and reduced motion", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const width of [375, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/contact");
      await page.waitForLoadState("networkidle");
      const layout = await page.evaluate(() => ({
        viewport: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        submitHeight: document
          .querySelector<HTMLButtonElement>("#contact-form button[type=submit]")
          ?.getBoundingClientRect().height,
      }));
      expect(layout.scrollWidth).toBe(layout.viewport);
      expect(layout.submitHeight).toBeGreaterThanOrEqual(44);
    }
  });
});
