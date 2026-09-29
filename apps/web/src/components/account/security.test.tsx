import { createAuthClient } from "@darkfactory/auth/client"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import {
  createBrowserSecurityGateway,
  createSecurityGateway,
  safeSecurityFeedback,
  securityFailureKind,
  toSafeSessions,
} from "./security-client.ts"
import { PasswordForm, SecurityPanel } from "./security-panel.tsx"

const session = {
  id: "session-current",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  expiresAt: new Date("2026-02-01T00:00:00.000Z"),
  userAgent: "Example Browser on Example OS",
  ipAddress: "192.0.2.1",
  token: "never-render-this-session-token",
  userId: "user-1",
}

describe("supported Better Auth security gateway", function() {
  it("uses typed session, revoke-other, and change-password methods", async function() {
    const auth = {
      getSession: vi.fn(async function() { return ({ data: { session, user: {} }, error: null }) }),
      listSessions: vi.fn(async function() { return ({ data: [session], error: null }) }),
      revokeOtherSessions: vi.fn(async function() { return ({ data: { status: true }, error: null }) }),
      changePassword: vi.fn(async function() { return ({ data: { token: null }, error: null }) }),
    }
    const gateway = createSecurityGateway(auth as never)

    await expect(gateway.listSessions()).resolves.toEqual({
      currentSessionId: "session-current",
      sessions: expect.arrayContaining([
        expect.objectContaining({ id: "session-current", isCurrent: true }),
      ]),
    })
    await expect(gateway.revokeOtherSessions()).resolves.toBeUndefined()
    await expect(gateway.changePassword({
      currentPassword: "current-password",
      newPassword: "new-password-long-enough",
      revokeOtherSessions: true,
    })).resolves.toBeUndefined()
    expect(auth.revokeOtherSessions).toHaveBeenCalledOnce()
    return expect(auth.changePassword).toHaveBeenCalledWith({
      currentPassword: "current-password",
      newPassword: "new-password-long-enough",
      revokeOtherSessions: true,
    })
  })

  it("correlates current identity through the real Better Auth browser client", async function() {
    const observedUrls: URL[] = []
    const fetchRequest = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input
            : input.url,
      )
      observedUrls.push(url)
      const body = url.pathname.endsWith("/get-session")
        ? { session, user: { id: "user-1" } }
        : url.pathname.endsWith("/list-sessions")
          ? [session]
          : null
      return new Response(JSON.stringify(body), {
        headers: { "content-type": "application/json" },
        status: body === null ? 404 : 200,
      })
    }
    )
    vi.stubGlobal("fetch", fetchRequest)
    try {
      const gateway = createSecurityGateway(
        createAuthClient("https://darkfactory.localhost/api/auth"),
      )
      await expect(gateway.listSessions()).resolves.toMatchObject({
        currentSessionId: "session-current",
        sessions: [expect.objectContaining({ isCurrent: true })],
      })
      expect(fetchRequest).toHaveBeenCalledTimes(2)
      const getSessionUrl = observedUrls.find((url) => {
        return url.pathname.endsWith("/get-session")
      }
      )
      return expect(getSessionUrl?.searchParams.get("disableCookieCache")).toBe("true")
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it("maps raw session records to metadata that cannot render tokens", function() {
    const safe = toSafeSessions([session], "session-current")
    expect(safe[0]).toMatchObject({ id: "session-current", isCurrent: true })
    expect(JSON.stringify(safe)).not.toContain(session.token)
    return expect(JSON.stringify(safe)).not.toContain("token")
  })

  it("sanitizes authentication failures", function() {
    expect(safeSecurityFeedback(new Error("password=secret token=opaque"))).not.toContain("secret")
    return expect(safeSecurityFeedback({ code: "UNAUTHORIZED" })).toContain("Sign in")
  })

  it("drops malformed sessions, normalizes supported dates, and marks only the correlated session current", function() {
    const safe = toSafeSessions([
      null,
      "not-a-session",
      { ...session, id: "" },
      { ...session, id: "bad-created", createdAt: "not-a-date" },
      { ...session, id: "bad-updated", updatedAt: Number.NaN },
      { ...session, id: "bad-expiry", expiresAt: {} },
      {
        id: "session-other",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: 1_767_312_000_000,
        expiresAt: "2026-02-01T00:00:00.000Z",
        userAgent: "   ",
      },
    ], "session-current")
    expect(safe).toHaveLength(1)
    expect(safe[0]).toMatchObject({
      id: "session-other",
      isCurrent: false,
      userAgent: null,
    })
    expect(safe[0]?.createdAt).toBeInstanceOf(Date)
    expect(safe[0]?.updatedAt).toBeInstanceOf(Date)
    return expect(safe[0]?.expiresAt).toBeInstanceOf(Date)
  })

  it("tolerates missing session data but rejects every Better Auth operation failure", async function() {
    const emptyGateway = createSecurityGateway({
      getSession: vi.fn(async function() { return ({ data: null, error: null }) }),
      listSessions: vi.fn(async function() { return ({ data: { unexpected: true }, error: null }) }),
      revokeOtherSessions: vi.fn(async function() { return ({ data: null, error: null }) }),
      changePassword: vi.fn(async function() { return ({ data: null, error: null }) }),
    } as never)
    await expect(emptyGateway.listSessions()).resolves.toEqual({
      currentSessionId: null,
      sessions: [],
    })

    const currentFailure = { code: "UNAUTHORIZED" }
    await expect(createSecurityGateway({
      getSession: vi.fn(async function() { return ({ data: null, error: currentFailure }) }),
      listSessions: vi.fn(async function() { return ({ data: [], error: null }) }),
    } as never).listSessions()).rejects.toBe(currentFailure)

    const sessionsFailure = { code: "FORBIDDEN" }
    await expect(createSecurityGateway({
      getSession: vi.fn(async function() { return ({ data: null, error: null }) }),
      listSessions: vi.fn(async function() { return ({ data: [], error: sessionsFailure }) }),
    } as never).listSessions()).rejects.toBe(sessionsFailure)

    const revokeFailure = { status: 403 }
    await expect(createSecurityGateway({
      revokeOtherSessions: vi.fn(async function() { return ({ data: null, error: revokeFailure }) }),
    } as never).revokeOtherSessions()).rejects.toBe(revokeFailure)

    const passwordFailure = { status: 401 }
    return await expect(createSecurityGateway({
      changePassword: vi.fn(async function() { return ({ data: null, error: passwordFailure }) }),
    } as never).changePassword({
      currentPassword: "current-password",
      newPassword: "new-password-long-enough",
    })).rejects.toBe(passwordFailure)
  })

  it.each([
    [{ code: "UNAUTHORIZED" }, "unauthorized", "Sign in again"],
    [{ status: 401 }, "unauthorized", "Sign in again"],
    [{ code: "FORBIDDEN" }, "forbidden", "not permitted"],
    [{ status: 403 }, "forbidden", "not permitted"],
    [{ code: 401 }, "retryable", "Try again"],
    [null, "retryable", "Try again"],
  ] as const)("maps supported security failure %j to %s", function(error, kind, message) {
    expect(securityFailureKind(error)).toBe(kind)
    return expect(safeSecurityFeedback(error)).toContain(message)
  }
  )

  return it("constructs the browser security gateway without starting a request", function() {
    return expect(() => createBrowserSecurityGateway()).not.toThrow()
  })
})

describe("security page states and actions", function() {
  it("marks the current session and never offers to revoke it", function() {
    const html = renderToStaticMarkup(
      <SecurityPanel
        state={{
          type: "ready",
          sessions: toSafeSessions([session], "session-current"),
        }}
      />,
    )
    expect(html).toContain("Current session")
    expect(html).toContain("Example Browser on Example OS")
    expect(html).toContain("Sign out other sessions")
    expect(html).toContain("<span>Current session</span>")
    expect(html).not.toContain("Revoke current")
    expect(html).not.toContain(session.token)
    return expect(html).not.toContain("192.0.2.1")
  })

  it.each([
    [{ type: "loading" } as const, "Loading sessions"],
    [{ type: "error", kind: "retryable", message: "Sessions could not be loaded." } as const, "Sessions could not be loaded"],
    [{ type: "ready", sessions: [] } as const, "No active sessions were returned"],
  ])("renders supported %s state", function(state, expected) {
    return expect(renderToStaticMarkup(<SecurityPanel state={state} />)).toContain(expected)
  }
  )

  it.each([
    ["unauthorized", "/sign-in?callbackURL=%2Faccount%2Fsecurity", "Sign in"],
    ["forbidden", "href=\"/account\"", "Back to account"],
    ["retryable", "Try again", "Try again"],
  ] as const)("renders the accessible %s recovery path", function(kind, destination, action) {
    const html = renderToStaticMarkup(
      <SecurityPanel state={{ type: "error", kind, message: "Security details are unavailable." }} />,
    )
    expect(html).toContain("role=\"alert\"")
    expect(html).toContain("Security details are unavailable")
    expect(html).toContain(destination)
    return expect(html).toContain(action)
  }
  )

  it("renders unknown agents safely and disables bulk revocation for the only active session", function() {
    const html = renderToStaticMarkup(
      <SecurityPanel
        state={{
          type: "ready",
          sessions: [{ ...toSafeSessions([session], "session-current")[0]!, userAgent: null }],
        }}
      />,
    )
    expect(html).toContain("Unidentified browser")
    expect(html).toContain("This is the only active session")
    return expect(html).toContain("disabled")
  })

  return it("renders supported password fields without ever echoing values", function() {
    const html = renderToStaticMarkup(<PasswordForm onSave={vi.fn()} />)
    expect(html).toContain("name=\"currentPassword\"")
    expect(html).toContain("name=\"newPassword\"")
    expect(html).toContain("name=\"confirmPassword\"")
    expect(html).toContain("type=\"password\"")
    expect(html).toContain("Change password")
    expect(html).toContain("disabled")
    expect(html).toContain("autoComplete=\"current-password\"")
    expect(html).toContain("autoComplete=\"new-password\"")
    return expect(html).toContain("Sign out other sessions")
  })
})
