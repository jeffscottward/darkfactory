import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock("next/link", () => ({ default: "a" }));

import type { AuthFlowClient } from "./auth-flow.ts";
import { AuthPanel } from "./auth-panel.tsx";
import { EmailActionForm } from "./email-action-form.tsx";
import {
  captureAndScrubResetToken,
  scrubResetTokenMarkup,
} from "./reset-password-entry.tsx";
import { ResetPasswordForm } from "./reset-password-form.tsx";
import { destinationForSession, SessionRedirect } from "./session-redirect.tsx";
import {
  completeSuccessfulSignInNavigation,
  SignInForm,
} from "./sign-in-form.tsx";
import { SignUpForm } from "./sign-up-form.tsx";

const client: AuthFlowClient = {
  signInEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  signUpEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  requestPasswordReset: vi.fn().mockResolvedValue({ data: {}, error: null }),
  resetPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
  sendVerificationEmail: vi.fn().mockResolvedValue({ data: {}, error: null }),
  getSession: vi.fn().mockResolvedValue({ data: null, error: null }),
};

const markup = (
  component: Parameters<typeof renderToStaticMarkup>[0]
): string => {
  return renderToStaticMarkup(component);
};

describe("auth form surface", () => {
  it("provides stable editorial hierarchy without a generic nested card", () => {
    const html = markup(
      createElement(AuthPanel, {
        eyebrow: "Account access",
        title: "Welcome back.",
        description: "Use your DarkFactory account.",
        children: createElement("p", {}, "Form body"),
      })
    );

    expect(html).toContain("Account access");
    expect(html).toContain("Welcome back.");
    expect(html).toContain("font-heading");
    expect(html).toContain("border-y");
    return expect(html).not.toContain("shadow");
  });

  it("renders sign-in with associated fields, recovery links, status semantics, and full-size controls", () => {
    const html = markup(
      createElement(SignInForm, {
        auth: client,
        callbackURL: "/feature-items",
      })
    );

    expect(html).toContain('type="email"');
    expect(html).toContain('autoComplete="email"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('href="/forgot-password"');
    expect(html).toContain('href="/sign-up"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain("min-h-11");
    expect(html.match(/required=""/g)).toHaveLength(2);
    return expect(html.match(/aria-required="true"/g)).toHaveLength(2);
  });

  it("crosses the authenticated layout boundary with a full history-replacing navigation", () => {
    const replace = vi.fn();

    completeSuccessfulSignInNavigation(
      { status: "success", destination: "/dashboard" },
      replace
    );

    expect(replace).toHaveBeenCalledOnce();
    return expect(replace).toHaveBeenCalledWith("/dashboard");
  });

  it("does not navigate for non-redirecting success or error results", () => {
    const replace = vi.fn();

    completeSuccessfulSignInNavigation(
      { status: "success", message: "Check your inbox." },
      replace
    );
    completeSuccessfulSignInNavigation(
      { status: "error", message: "Sign-in failed." },
      replace
    );

    return expect(replace).not.toHaveBeenCalled();
  });
  it("renders sign-up with name, email, two password controls, and truthful verification guidance", () => {
    const html = markup(createElement(SignUpForm, { auth: client }));

    expect(html).toContain('autoComplete="name"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html.match(/Show password/g)).toHaveLength(2);
    expect(html).toContain("We will send a verification link");
    expect(html).toContain('href="/sign-in"');
    expect(html.match(/required=""/g)).toHaveLength(4);
    return expect(html.match(/aria-required="true"/g)).toHaveLength(4);
  });

  it("renders forgot and verification email actions as enumeration-safe forms", () => {
    const forgot = markup(
      createElement(EmailActionForm, {
        auth: client,
        operation: "password-reset",
      })
    );
    const verify = markup(
      createElement(EmailActionForm, {
        auth: client,
        operation: "email-verification",
      })
    );

    expect(forgot).toContain("Send reset link");
    expect(forgot).toContain("For your privacy");
    expect(verify).toContain("Send verification email");
    return expect(verify).toContain("For your privacy");
  });

  it("renders an invalid reset link as recovery instead of a password form", () => {
    const html = markup(
      createElement(ResetPasswordForm, {
        auth: client,
        token: undefined,
      })
    );

    expect(html).toContain("invalid or has expired");
    expect(html).toContain('href="/forgot-password"');
    return expect(html).not.toContain('name="newPassword"');
  });

  it("captures a reset token in memory and immediately removes query data from history", () => {
    const replaceState = vi.fn();
    const history = { state: { key: "value" }, replaceState };

    expect(
      captureAndScrubResetToken("?token=one-time-reset-token", history)
    ).toBe("one-time-reset-token");
    expect(replaceState).toHaveBeenCalledWith(
      history.state,
      "",
      "/reset-password"
    );

    expect(
      captureAndScrubResetToken(
        "?token=forged-token&error=INVALID_TOKEN",
        history
      )
    ).toBeUndefined();
    expect(captureAndScrubResetToken("", history)).toBeUndefined();
    return expect(replaceState).toHaveBeenLastCalledWith(
      history.state,
      "",
      "/reset-password"
    );
  });

  return it("removes hydrated route scripts that retain the captured reset token", () => {
    const sensitiveScript = {
      textContent: 'self.__next_f.push(["one-time-reset-token"])',
      remove: vi.fn(),
    };
    const safeScript = { textContent: "bootstrap()", remove: vi.fn() };

    scrubResetTokenMarkup("one-time-reset-token", {
      querySelectorAll: () => [sensitiveScript, safeScript],
    });

    expect(sensitiveScript.remove).toHaveBeenCalledOnce();
    expect(safeScript.remove).not.toHaveBeenCalled();

    const querySelectorAll = vi.fn(() => [sensitiveScript]);
    scrubResetTokenMarkup(undefined, { querySelectorAll });
    return expect(querySelectorAll).not.toHaveBeenCalled();
  });
});

describe("signed-in auth route redirect", () => {
  it("gates interactive auth children behind an initial session check", () => {
    const html = markup(
      createElement(
        SessionRedirect,
        { auth: client, callbackURL: "/dashboard" },
        createElement("button", { type: "button" }, "Interactive form")
      )
    );

    expect(html).toContain("Checking your session");
    return expect(html).not.toContain("Interactive form");
  });

  return it("uses the sanitized redirect-back destination only when a real session exists", () => {
    expect(
      destinationForSession(
        { data: { session: { id: "session-1" } }, error: null },
        "/feature-items"
      )
    ).toBe("/feature-items");
    expect(
      destinationForSession(
        { data: { session: { id: "session-1" } }, error: null },
        "https://attacker.test/steal"
      )
    ).toBe("/dashboard");
    expect(
      destinationForSession({ data: null, error: null }, "/dashboard")
    ).toBeNull();
    return expect(
      destinationForSession(
        { data: { session: { id: "session-1" } }, error: { code: "FAILED" } },
        "/dashboard"
      )
    ).toBeNull();
  });
});
