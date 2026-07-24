import { randomUUID } from "node:crypto";

import type { Browser, Cookie, Page, Response } from "@playwright/test";

import {
  E2E_IDENTITIES,
  expect,
  signInAs,
  test,
  waitForPreviewLink,
} from "./fixtures";
import { assertNoSensitiveData } from "./helpers/sensitive-data";

const SAFE_ACCOUNT_EMAIL_MESSAGE =
  "If the address can receive this email, a message is on its way. Check your inbox and spam folder.";
const STARTING_PASSWORD = "BrowserAuth123!";
const REPLACEMENT_PASSWORD = "BrowserReset123!";
const SECURE_COOKIE_NAME_PATTERN = /^__Secure-/u;
const RESET_LINK_PATH_PATTERN =
  /^\/api\/auth\/reset-password\/[A-Za-z0-9_-]+$/u;
const TOKEN_TEXT_PATTERN = /token=/iu;
const generatedIdentityId = randomUUID();
const generatedIdentity = Object.freeze({
  email: `auth-${generatedIdentityId}@domain.test`,
  name: `Auth Browser ${generatedIdentityId.slice(0, 8)}`,
});
let passedRuntimeChecks = 0;
let runtimeReady = false;

let consumedResetLink: URL | undefined;
let consumedResetToken: string | undefined;

const recordRuntimeCheck = (): void => {
  passedRuntimeChecks += 1;
};

const expectBrowserResponse = (
  response: Response,
  pathname: string,
  status: number
): void => {
  expect(response.request().method()).toBe("POST");
  expect(new URL(response.url()).pathname).toBe(pathname);
  expect(response.status()).toBe(status);
  expect(response.headers()["content-type"]).toContain("application/json");
};

const assertPageDoesNotExposeSensitiveData = async (
  page: Page,
  sensitiveValues: readonly string[]
): Promise<void> => {
  await expect
    .poll(async () => {
      try {
        return await page.evaluate((values) => {
          const surface = [
            window.location.href,
            document.body.innerText,
            document.documentElement.innerHTML,
          ].join("\n");
          return values.some(
            (value) => value.length > 0 && surface.includes(value)
          );
        }, sensitiveValues);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Execution context was destroyed")
        ) {
          return true;
        }
        throw error;
      }
    })
    .toBe(false);
};

const navigateToPrivateLink = async (page: Page, link: URL): Promise<void> => {
  await page.evaluate((href) => {
    window.location.assign(href);
  }, link.href);
};

const waitForAuthResponse = (page: Page, pathname: string): Promise<Response> =>
  page.waitForResponse((response) => {
    const url = new URL(response.url());
    return response.request().method() === "POST" && url.pathname === pathname;
  });

const signInThroughUi = async ({
  email,
  page,
  password,
}: {
  email: string;
  page: Page;
  password: string;
}): Promise<Readonly<{ response: Response; sessionCookie: Cookie }>> => {
  await page.getByLabel("Email address", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const responsePromise = waitForAuthResponse(page, "/api/auth/sign-in/email");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  const response = await responsePromise;
  expectBrowserResponse(response, "/api/auth/sign-in/email", 200);
  const sessionCookie = await expectCanonicalSessionCookie(page, response);
  await page.waitForURL((url) => url.pathname !== "/sign-in");
  await page.waitForLoadState("networkidle");
  await assertPageDoesNotExposeSensitiveData(page, [
    email,
    password,
    sessionCookie.value,
  ]);
  return { response, sessionCookie };
};

const expectCanonicalSessionCookie = async (
  page: Page,
  response: Response
): Promise<Cookie> => {
  const setCookie = await response.headerValue("set-cookie");
  const hasCanonicalHeader =
    setCookie?.includes("__Secure-") &&
    setCookie.includes("HttpOnly") &&
    setCookie.includes("Secure") &&
    setCookie.includes("SameSite=Lax") &&
    setCookie.includes("Path=/");
  if (!hasCanonicalHeader) {
    throw new Error("Session cookie header contract failed.");
  }

  const sessionCookies = (await page.context().cookies()).filter((cookie) =>
    cookie.name.includes("session_token")
  );
  const sessionCookie =
    sessionCookies.length === 1 ? sessionCookies[0] : undefined;
  if (
    sessionCookie === undefined ||
    !SECURE_COOKIE_NAME_PATTERN.test(sessionCookie.name) ||
    !sessionCookie.httpOnly ||
    !sessionCookie.secure ||
    sessionCookie.sameSite !== "Lax" ||
    sessionCookie.path !== "/"
  ) {
    throw new Error("Browser session cookie contract failed.");
  }
  return sessionCookie;
};

const expectRevokedSessionCookie = async ({
  baseURL,
  browser,
  cookie,
}: {
  baseURL: string;
  browser: Browser;
  cookie: Cookie;
}): Promise<void> => {
  const context = await browser.newContext({ baseURL });
  try {
    await context.addCookies([cookie]);
    const page = await context.newPage();
    const browserFailures: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserFailures.push(`console: ${message.text()}`);
      }
    });
    page.on("pageerror", (error) => {
      browserFailures.push(`pageerror: ${error.message}`);
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(
      new URL("/sign-in?callbackURL=%2Fdashboard", baseURL).href
    );
    const sessionResult = await page.evaluate(async () => {
      const response = await fetch("/api/auth/get-session", {
        credentials: "include",
        headers: { accept: "application/json" },
      });
      return {
        body: (await response.json()) as unknown,
        status: response.status,
      };
    });
    expect(sessionResult).toEqual({ body: null, status: 200 });
    expect(browserFailures).toEqual([]);
  } finally {
    await context.close();
  }
};

const expectDashboardFor = async (
  page: Page,
  identity: { name: string; role: "admin" | "member" }
): Promise<void> => {
  await expect(page).toHaveURL((url) => url.pathname === "/dashboard");
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: `Welcome back, ${identity.name}`,
    })
  ).toBeVisible();
  await expect(
    page.getByText(
      identity.role === "admin" ? "Administrator access" : "Member access",
      { exact: true }
    )
  ).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Administration navigation" })
  ).toHaveCount(identity.role === "admin" ? 1 : 0);
};

test.use({ screenshot: "off", trace: "off", video: "off" });

test.describe("DF-113 auth browser journeys", () => {
  test.describe.configure({ mode: "serial" });

  test.afterAll(async ({ browser: _browser }, testInfo) => {
    const evidence = JSON.stringify(
      {
        complete: passedRuntimeChecks === 6 && runtimeReady,
        passedChecks: passedRuntimeChecks,
        runtimeReady,
      },
      null,
      2
    );
    await testInfo.attach("df-113-auth-runtime.json", {
      body: Buffer.from(`${evidence}\n`),
      contentType: "application/json",
    });
  });

  test("keeps auth and recovery controls responsive and keyboard operable", async ({
    page,
  }) => {
    const states = [
      { path: "/sign-in", submit: "Sign in" },
      { path: "/sign-up", submit: "Create account" },
      { path: "/forgot-password", submit: "Send reset link" },
      { path: "/verify-email", submit: "Send verification email" },
    ] as const;

    for (const width of [375, 1440]) {
      await page.setViewportSize({ height: 900, width });
      for (const state of states) {
        await page.goto(state.path);
        const submit = page.getByRole("button", {
          name: state.submit,
          exact: true,
        });
        await expect(submit).toBeVisible();
        const layout = await page.evaluate(() => ({
          clientWidth: document.documentElement.clientWidth,
          controls: Array.from(
            document.querySelectorAll<HTMLElement>(
              "main input:not([type=hidden]), main button"
            )
          )
            .filter((element) => element.offsetParent !== null)
            .map((element) => {
              const bounds = element.getBoundingClientRect();
              return { height: bounds.height, width: bounds.width };
            }),
          scrollWidth: document.documentElement.scrollWidth,
        }));
        expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 1);
        expect(layout.controls.length).toBeGreaterThan(0);
        for (const control of layout.controls) {
          expect(control.height).toBeGreaterThanOrEqual(44);
          expect(control.width).toBeGreaterThanOrEqual(44);
        }
      }

      await page.goto("/reset-password");
      const recoveryLink = page.getByRole("link", {
        name: "Request a new link",
        exact: true,
      });
      await expect(recoveryLink).toBeVisible();
      const recoveryLayout = await recoveryLink.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return {
          clientWidth: document.documentElement.clientWidth,
          height: bounds.height,
          scrollWidth: document.documentElement.scrollWidth,
          width: bounds.width,
        };
      });
      expect(recoveryLayout.scrollWidth).toBeLessThanOrEqual(
        recoveryLayout.clientWidth + 1
      );
      expect(recoveryLayout.height).toBeGreaterThanOrEqual(44);
      expect(recoveryLayout.width).toBeGreaterThanOrEqual(44);
    }

    await page.setViewportSize({ height: 900, width: 375 });
    await page.goto("/sign-in");
    const signInEmail = page.getByLabel("Email address", { exact: true });
    const signInPassword = page.getByLabel("Password", { exact: true });
    await signInEmail.focus();
    await page.keyboard.press("Tab");
    await expect(signInPassword).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(signInEmail).toBeFocused();
    await signInEmail.fill("invalid");
    await signInEmail.press("Enter");
    await expect(signInEmail).toBeFocused();
    await expect(page.getByText("Enter a valid email address.")).toBeVisible();

    await page.goto("/sign-up");
    const signUpName = page.getByLabel("Name", { exact: true });
    const signUpEmail = page.getByLabel("Email address", { exact: true });
    const signUpPassword = page.getByLabel("Password", { exact: true });
    const signUpConfirm = page.getByLabel("Confirm password", { exact: true });
    const passwordToggles = page.getByRole("button", {
      name: "Show password",
      exact: true,
    });
    const createAccount = page.getByRole("button", {
      name: "Create account",
      exact: true,
    });
    await signUpName.focus();
    await page.keyboard.press("Tab");
    await expect(signUpEmail).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(signUpPassword).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(passwordToggles.nth(0)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(signUpConfirm).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(passwordToggles.nth(1)).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(createAccount).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(passwordToggles.nth(1)).toBeFocused();
    await signUpName.fill("Keyboard User");
    await signUpEmail.fill("keyboard@example.test");
    await signUpPassword.fill("KeyboardOnly123!");
    await signUpConfirm.fill("KeyboardMismatch123!");
    await signUpConfirm.press("Enter");
    await expect(signUpConfirm).toBeFocused();
    await expect(page.getByText("Passwords do not match.")).toBeVisible();

    for (const state of [
      {
        path: "/forgot-password",
        submit: "Send reset link",
      },
      {
        path: "/verify-email",
        submit: "Send verification email",
      },
    ] as const) {
      await page.goto(state.path);
      const email = page.getByLabel("Email address", { exact: true });
      await email.focus();
      await email.press("Enter");
      await expect(email).toBeFocused();
      await expect(page.getByText("Enter your email address.")).toBeVisible();
      await expect(
        page.getByRole("button", { name: state.submit, exact: true })
      ).toBeVisible();
    }
  });

  test("redirects an anonymous protected request to an exact safe callback", async ({
    baseURL,
    page,
  }) => {
    if (baseURL === undefined) {
      throw new Error("Auth E2E requires the canonical Playwright base URL.");
    }
    runtimeReady = true;
    const protectedPath = "/feature-items?status=active";
    const expectedSignInPath = "/sign-in?callbackURL=%2Fdashboard";

    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/feature-items" &&
        url.search === "?status=active"
      );
    });
    await page.goto(protectedPath);
    const response = await responsePromise;
    expect(response.status()).toBe(307);
    const location = await response.headerValue("location");
    expect(location).not.toBeNull();
    expect(new URL(location ?? "", baseURL).pathname).toBe("/sign-in");
    expect(new URL(location ?? "", baseURL).search).toBe(
      "?callbackURL=%2Fdashboard"
    );
    await expect(page).toHaveURL(
      (url) =>
        url.pathname === "/sign-in" &&
        `${url.pathname}${url.search}` === expectedSignInPath
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Welcome back." })
    ).toBeVisible();

    recordRuntimeCheck();
  });

  test("creates and verifies a unique account through a private preview link", async ({
    baseURL,
    page,
  }) => {
    if (baseURL === undefined) {
      throw new Error("Auth E2E requires the canonical Playwright base URL.");
    }
    const previewAfter = Date.now() - 1000;

    await page.goto("/sign-up");
    await page.getByLabel("Name", { exact: true }).fill(generatedIdentity.name);
    await page
      .getByLabel("Email address", { exact: true })
      .fill(generatedIdentity.email);
    await page.getByLabel("Password", { exact: true }).fill(STARTING_PASSWORD);
    await page
      .getByLabel("Confirm password", { exact: true })
      .fill(STARTING_PASSWORD);

    const signUpResponsePromise = waitForAuthResponse(
      page,
      "/api/auth/sign-up/email"
    );
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    const signUpResponse = await signUpResponsePromise;
    expectBrowserResponse(signUpResponse, "/api/auth/sign-up/email", 200);
    assertNoSensitiveData(await signUpResponse.json(), [STARTING_PASSWORD]);
    await expect(page.getByRole("status")).toHaveText(
      SAFE_ACCOUNT_EMAIL_MESSAGE
    );

    const verificationLink = await waitForPreviewLink({
      after: previewAfter,
      appOrigin: baseURL,
      operation: "verify-email",
      recipient: generatedIdentity,
    });
    expect(verificationLink.origin).toBe(baseURL);
    expect(verificationLink.pathname).toBe("/api/auth/verify-email");
    expect(verificationLink.username).toBe("");
    expect(verificationLink.password).toBe("");
    const verificationToken = verificationLink.searchParams.get("token");
    if (verificationToken === null) {
      throw new Error("Verification preview link was invalid.");
    }

    const verificationResponsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        response.request().method() === "GET" &&
        url.pathname === "/api/auth/verify-email"
      );
    });
    await navigateToPrivateLink(page, verificationLink);
    const verificationResponse = await verificationResponsePromise;
    expect(verificationResponse.status()).toBe(302);
    const verificationLocation =
      await verificationResponse.headerValue("location");
    expect(verificationLocation).not.toBeNull();
    assertNoSensitiveData(verificationLocation, [verificationToken]);
    expect(new URL(verificationLocation ?? "", baseURL).href).toBe(
      new URL("/verify-email?verified=1", baseURL).href
    );
    await expect(page).toHaveURL(
      new URL("/verify-email?verified=1", baseURL).href
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Verification link processed.",
      })
    ).toBeVisible();
    await expect(page.getByRole("status")).toContainText(
      "The link was processed. Sign in to confirm the account status."
    );
    await expect(page.locator("body")).not.toContainText(TOKEN_TEXT_PATTERN);
    await assertPageDoesNotExposeSensitiveData(page, [
      verificationToken,
      STARTING_PASSWORD,
      generatedIdentity.email,
    ]);

    recordRuntimeCheck();
  });

  test("signs in the verified account, enforces secure cookies, and clears logout", async ({
    baseURL,
    browser,
    page,
  }) => {
    if (baseURL === undefined) {
      throw new Error("Auth E2E requires the canonical Playwright base URL.");
    }
    const callbackPath = "/feature-items?status=active";
    await page.goto(`/sign-in?callbackURL=${encodeURIComponent(callbackPath)}`);
    await expect(page).toHaveURL(
      new URL(
        "/sign-in?callbackURL=%2Ffeature-items%3Fstatus%3Dactive",
        baseURL
      ).href
    );

    const { sessionCookie } = await signInThroughUi({
      email: generatedIdentity.email,
      page,
      password: STARTING_PASSWORD,
    });
    await expect(page).toHaveURL(new URL(callbackPath, baseURL).href);

    await page.goto("/dashboard");
    await expectDashboardFor(page, {
      name: generatedIdentity.name,
      role: "member",
    });
    await assertPageDoesNotExposeSensitiveData(page, [
      STARTING_PASSWORD,
      generatedIdentity.email,
      sessionCookie.value,
    ]);

    const signOutResponsePromise = waitForAuthResponse(
      page,
      "/api/auth/strict-sign-out"
    );
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    const signOutResponse = await signOutResponsePromise;
    expectBrowserResponse(signOutResponse, "/api/auth/strict-sign-out", 200);
    const clearCookie = await signOutResponse.headerValue("set-cookie");
    const hasCanonicalClearingHeader =
      clearCookie?.includes(`${sessionCookie.name}=`) &&
      clearCookie.includes("Max-Age=0") &&
      clearCookie.includes("HttpOnly") &&
      clearCookie.includes("Secure") &&
      clearCookie.includes("SameSite=Lax") &&
      clearCookie.includes("Path=/");
    if (!hasCanonicalClearingHeader) {
      throw new Error("Session cookie clearing contract failed.");
    }
    await expect(page).toHaveURL(new URL("/sign-in", baseURL).href);
    const remainingSessionCookieCount = (await page.context().cookies()).filter(
      (cookie) => cookie.name === sessionCookie.name
    ).length;
    if (remainingSessionCookieCount !== 0) {
      throw new Error("Browser retained the signed-out session cookie.");
    }
    await expectRevokedSessionCookie({
      baseURL,
      browser,
      cookie: sessionCookie,
    });

    await page.goto("/dashboard");
    await expect(page).toHaveURL(
      new URL("/sign-in?callbackURL=%2Fdashboard", baseURL).href
    );

    for (const unsafeCallback of [
      "https://evil.example/feature-items",
      "//evil.example/feature-items",
    ]) {
      await page.goto(
        `/sign-in?callbackURL=${encodeURIComponent(unsafeCallback)}`
      );
      await signInThroughUi({
        email: generatedIdentity.email,
        page,
        password: STARTING_PASSWORD,
      });
      await expectDashboardFor(page, {
        name: generatedIdentity.name,
        role: "member",
      });
      await page.context().clearCookies();
    }

    recordRuntimeCheck();
  });

  test("signs in every canonical seed and renders its role-authorized dashboard", async ({
    page,
  }) => {
    for (const identity of Object.values(E2E_IDENTITIES)) {
      const signInResponsePromise = waitForAuthResponse(
        page,
        "/api/auth/sign-in/email"
      );
      await signInAs(page, identity);
      const signInResponse = await signInResponsePromise;
      expectBrowserResponse(signInResponse, "/api/auth/sign-in/email", 200);
      const sessionCookie = await expectCanonicalSessionCookie(
        page,
        signInResponse
      );
      await assertPageDoesNotExposeSensitiveData(page, [
        identity.email,
        identity.password,
        sessionCookie.value,
      ]);
      await expectDashboardFor(page, identity);
      await page.context().clearCookies();
    }

    recordRuntimeCheck();
  });

  test("resets a password safely, revokes old sessions, and rejects the old password", async ({
    baseURL,
    browser,
    browserErrors,
    page,
  }) => {
    if (baseURL === undefined) {
      throw new Error("Auth E2E requires the canonical Playwright base URL.");
    }
    const oldSessionCookies: Cookie[] = [];

    try {
      for (let index = 0; index < 2; index += 1) {
        await page.context().clearCookies();
        await page.goto("/sign-in");
        await signInThroughUi({
          email: generatedIdentity.email,
          page,
          password: STARTING_PASSWORD,
        });
        const sessionCookies = (await page.context().cookies()).filter(
          (cookie) => cookie.name.includes("session_token")
        );
        if (sessionCookies.length !== 1) {
          throw new Error("Expected one old browser session cookie.");
        }
        const sessionCookie = sessionCookies[0];
        if (sessionCookie === undefined) {
          throw new Error("Expected the old browser session cookie.");
        }
        oldSessionCookies.push(sessionCookie);
      }
      if (new Set(oldSessionCookies.map((cookie) => cookie.value)).size !== 2) {
        throw new Error("Old browser sessions were not distinct.");
      }
      await page.context().clearCookies();

      const previewAfter = Date.now() - 1000;
      await page.goto("/forgot-password");
      await page
        .getByLabel("Email address", { exact: true })
        .fill(generatedIdentity.email);
      const knownResponsePromise = waitForAuthResponse(
        page,
        "/api/auth/request-password-reset"
      );
      await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
      const knownResponse = await knownResponsePromise;
      expectBrowserResponse(
        knownResponse,
        "/api/auth/request-password-reset",
        200
      );
      const knownBody = await knownResponse.json();
      assertNoSensitiveData(knownBody, [
        generatedIdentity.email,
        STARTING_PASSWORD,
      ]);
      await expect(page.getByRole("status")).toHaveText(
        SAFE_ACCOUNT_EMAIL_MESSAGE
      );

      await page.goto("/forgot-password");
      await page
        .getByLabel("Email address", { exact: true })
        .fill(`missing-${generatedIdentityId}@domain.test`);
      const unknownResponsePromise = waitForAuthResponse(
        page,
        "/api/auth/request-password-reset"
      );
      await page
        .getByRole("button", { name: "Send reset link", exact: true })
        .click();
      const unknownResponse = await unknownResponsePromise;
      expectBrowserResponse(
        unknownResponse,
        "/api/auth/request-password-reset",
        200
      );
      const unknownBody = await unknownResponse.json();
      expect(unknownBody).toEqual(knownBody);
      assertNoSensitiveData(unknownBody, [
        `missing-${generatedIdentityId}@domain.test`,
        STARTING_PASSWORD,
      ]);
      await expect(page.getByRole("status")).toHaveText(
        SAFE_ACCOUNT_EMAIL_MESSAGE
      );

      consumedResetLink = await waitForPreviewLink({
        after: previewAfter,
        appOrigin: baseURL,
        operation: "reset-password",
        recipient: generatedIdentity,
      });
      expect(consumedResetLink.origin).toBe(baseURL);
      expect(consumedResetLink.pathname).toMatch(RESET_LINK_PATH_PATTERN);
      expect(consumedResetLink.username).toBe("");
      expect(consumedResetLink.password).toBe("");
      consumedResetToken = consumedResetLink.pathname.split("/").at(-1);
      if (consumedResetToken === undefined) {
        throw new Error("Reset preview link was invalid.");
      }

      const resetEntryResponsePromise = page.waitForResponse((response) => {
        const url = new URL(response.url());
        return (
          response.request().method() === "GET" &&
          url.pathname.startsWith("/api/auth/reset-password/")
        );
      });
      await navigateToPrivateLink(page, consumedResetLink);
      const resetEntryResponse = await resetEntryResponsePromise;
      expect(resetEntryResponse.status()).toBe(302);
      await expect(page).toHaveURL(new URL("/reset-password", baseURL).href);
      await expect(
        page.getByRole("heading", { level: 1, name: "Set a new password." })
      ).toBeVisible();
      await expect(page.locator("body")).not.toContainText(TOKEN_TEXT_PATTERN);
      await assertPageDoesNotExposeSensitiveData(page, [
        consumedResetToken,
        STARTING_PASSWORD,
        generatedIdentity.email,
      ]);

      const newPassword = page.getByLabel("New password", { exact: true });
      const confirmNewPassword = page.getByLabel("Confirm new password", {
        exact: true,
      });
      const resetToggles = page.getByRole("button", {
        name: "Show password",
        exact: true,
      });
      const updatePassword = page.getByRole("button", {
        name: "Update password",
        exact: true,
      });
      await newPassword.focus();
      await page.keyboard.press("Tab");
      await expect(resetToggles.nth(0)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(confirmNewPassword).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(resetToggles.nth(1)).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(updatePassword).toBeDisabled();
      await page.keyboard.press("Shift+Tab");
      await expect(resetToggles.nth(1)).toBeFocused();
      await newPassword.fill("KeyboardOnly123!");
      await confirmNewPassword.fill("KeyboardMismatch123!");
      await confirmNewPassword.press("Tab");
      await expect(page.getByText("Passwords do not match.")).toBeVisible();
      await newPassword.clear();
      await confirmNewPassword.clear();

      await page
        .getByLabel("New password", { exact: true })
        .fill(REPLACEMENT_PASSWORD);
      await page
        .getByLabel("Confirm new password", { exact: true })
        .fill(REPLACEMENT_PASSWORD);
      await confirmNewPassword.press("Tab");
      await expect(updatePassword).toBeEnabled();
      const resetResponsePromise = waitForAuthResponse(
        page,
        "/api/auth/reset-password"
      );
      await page
        .getByRole("button", { name: "Update password", exact: true })
        .click();
      const resetResponse = await resetResponsePromise;
      expectBrowserResponse(resetResponse, "/api/auth/reset-password", 200);
      assertNoSensitiveData(await resetResponse.json(), [
        REPLACEMENT_PASSWORD,
        consumedResetToken,
      ]);
      await expect(page).toHaveURL(new URL("/sign-in?reset=1", baseURL).href);
      await expect(page.getByRole("status")).toHaveText(
        "Your password was updated. Sign in with the new password."
      );
      await assertPageDoesNotExposeSensitiveData(page, [
        consumedResetToken,
        STARTING_PASSWORD,
        REPLACEMENT_PASSWORD,
        generatedIdentity.email,
      ]);

      for (const cookie of oldSessionCookies) {
        await expectRevokedSessionCookie({ baseURL, browser, cookie });
      }

      browserErrors.allowHttpError({
        method: "POST",
        pathname: "/api/auth/sign-in/email",
        status: 401,
      });
      browserErrors.allowConsoleError({
        message:
          "Failed to load resource: the server responded with a status of 401 (Unauthorized)",
        pathname: "/sign-in",
      });
      browserErrors.allowConsoleError({
        message:
          "Failed to load resource: the server responded with a status of 401 ()",
        pathname: "/sign-in",
      });
      await page.goto("/sign-in");
      await page
        .getByLabel("Email address", { exact: true })
        .fill(generatedIdentity.email);
      await page
        .getByLabel("Password", { exact: true })
        .fill(STARTING_PASSWORD);
      const rejectedPasswordPromise = waitForAuthResponse(
        page,
        "/api/auth/sign-in/email"
      );
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      const rejectedPassword = await rejectedPasswordPromise;
      expectBrowserResponse(rejectedPassword, "/api/auth/sign-in/email", 401);
      const rejectedPasswordBody = await rejectedPassword.json();
      assertNoSensitiveData(rejectedPasswordBody, [STARTING_PASSWORD]);
      expect(rejectedPasswordBody).toMatchObject({
        code: "INVALID_EMAIL_OR_PASSWORD",
      });
      await expect(
        page.getByRole("alert").filter({
          hasText:
            "The email or password was not accepted. Check both fields and try again.",
        })
      ).toContainText(
        "The email or password was not accepted. Check both fields and try again."
      );

      await signInThroughUi({
        email: generatedIdentity.email,
        page,
        password: REPLACEMENT_PASSWORD,
      });
      await expectDashboardFor(page, {
        name: generatedIdentity.name,
        role: "member",
      });
    } finally {
      await page.context().clearCookies();
    }

    recordRuntimeCheck();
  });

  test("scrubs reset tokens and renders safe consumed, invalid, and expired link states", async ({
    baseURL,
    page,
  }) => {
    if (baseURL === undefined || consumedResetLink === undefined) {
      throw new Error(
        "The serial reset journey did not produce a consumed link."
      );
    }

    await navigateToPrivateLink(page, consumedResetLink);
    await expect(page).toHaveURL(new URL("/reset-password", baseURL).href);
    await expect(
      page.getByRole("alert").filter({
        hasText: "This password reset link is invalid or has expired.",
      })
    ).toContainText("This password reset link is invalid or has expired.");
    await expect(page.locator("body")).not.toContainText(TOKEN_TEXT_PATTERN);
    if (consumedResetToken === undefined) {
      throw new Error("The serial reset journey did not retain its token.");
    }
    await assertPageDoesNotExposeSensitiveData(page, [
      consumedResetToken,
      STARTING_PASSWORD,
      REPLACEMENT_PASSWORD,
      generatedIdentity.email,
    ]);

    await page.goto("/reset-password?token=invalid&error=INVALID_TOKEN");
    await expect(page).toHaveURL(new URL("/reset-password", baseURL).href);
    await expect(
      page.getByRole("alert").filter({
        hasText: "This password reset link is invalid or has expired.",
      })
    ).toContainText("This password reset link is invalid or has expired.");

    for (const state of [
      {
        code: "INVALID_TOKEN",
        message:
          "This verification link is invalid or has already been used. Request another below.",
      },
      {
        code: "TOKEN_EXPIRED",
        message: "This verification link has expired. Request another below.",
      },
    ]) {
      await page.goto(`/verify-email?error=${state.code}`);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Verification link needs attention.",
        })
      ).toBeVisible();
      await expect(
        page.getByRole("alert").filter({ hasText: state.message })
      ).toContainText(state.message);
      await expect(
        page.getByRole("button", {
          name: "Send verification email",
          exact: true,
        })
      ).toBeVisible();
    }

    recordRuntimeCheck();
  });
});
