import { afterEach, describe, expect, it, vi } from "vitest"

import {
  getPortalSession,
  parsePortalSession,
  portalSignInHref,
  resolvePortalCallbackPath,
  resolvePortalAppUrl,
  safePortalCallbackPath,
} from "./server-session.ts"

const activeSession = {
  user: {
    id: "user-1",
    name: "Example Member",
    role: "member",
    status: "active",
  },
  session: {
    expiresAt: "2030-01-01T00:00:00.000Z",
  },
}
afterEach(function() { return vi.unstubAllEnvs() })

describe("resolvePortalAppUrl", function() {
  return it("uses one validated HTTPS application origin", function() {
    expect(resolvePortalAppUrl("https://portal.example.test").href).toBe(
      "https://portal.example.test/",
    )
    expect(() => resolvePortalAppUrl("http://portal.example.test")).toThrow(
      "Portal application URL must be a clean HTTPS origin",
    )
    return expect(() => resolvePortalAppUrl("https://user:secret@portal.example.test")).toThrow(
      "Portal application URL must be a clean HTTPS origin",
    )
  })
})

describe("parsePortalSession", function() {
  it("accepts only an active Better Auth session with a known role", function() {
    return expect(parsePortalSession(activeSession, new Date("2029-01-01T00:00:00.000Z"))).toEqual({
      userId: "user-1",
      name: "Example Member",
      role: "member",
      status: "active",
      expiresAt: new Date("2030-01-01T00:00:00.000Z"),
    })
  })

  return it.each([
    null,
    {},
    { ...activeSession, user: { ...activeSession.user, role: "owner" } },
    { ...activeSession, user: { ...activeSession.user, status: "suspended" } },
    { ...activeSession, user: { ...activeSession.user, status: "deactivated" } },
    { ...activeSession, session: { expiresAt: "not-a-date" } },
    { ...activeSession, session: { expiresAt: "2028-01-01T00:00:00.000Z" } },
  ])("rejects malformed, inactive, or expired session data", function(value) {
    return expect(parsePortalSession(value, new Date("2029-01-01T00:00:00.000Z"))).toBeNull()
  }
  )
})

describe("portal callback paths", function() {
  it("preserves a safe relative portal path and encodes it for sign in", function() {
    const headers = new Headers({ "x-pathname": "/feature-items/item-1?mode=edit" })
    expect(resolvePortalCallbackPath(headers)).toBe("/feature-items/item-1?mode=edit")
    return expect(portalSignInHref(headers)).toBe(
      "/sign-in?callbackURL=%2Ffeature-items%2Fitem-1%3Fmode%3Dedit",
    )
  })

  return it.each([
    "https://attacker.invalid/steal",
    "//attacker.invalid/steal",
    "/sign-in",
    "/features",
    "/feature-items/../../sign-in",
    "\\attacker.invalid\\steal",
  ])("falls back when the request path is unsafe", function(pathname) {
    return expect(resolvePortalCallbackPath(new Headers({ "x-pathname": pathname }))).toBe("/dashboard")
  }
  )
})

describe("getPortalSession", function() {
  it("forwards only the request cookie and trusted edge IP before validating the response", async function() {
    vi.stubEnv("APP_URL", "https://darkfactory.localhost")
    const fetchSession = vi.fn(async function(request: Request) {
      expect(request.url).toBe("https://darkfactory.localhost/api/auth/get-session")
      expect(request.headers.get("cookie")).toBe("better-auth.session_token=opaque")
      expect(request.headers.get("accept")).toBe("application/json")
      expect(request.headers.get("cf-connecting-ip")).toBe("203.0.113.42")
      expect([...request.headers.keys()]).toEqual([
        "accept",
        "cf-connecting-ip",
        "cookie",
      ])
      return Response.json(activeSession)
    }
    )

    await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      cfConnectingIp: "203.0.113.42",
      fetch: fetchSession,
      now: new Date("2029-01-01T00:00:00.000Z"),
    })).resolves.toMatchObject({ userId: "user-1", role: "member" })
  
    return expect(fetchSession).toHaveBeenCalledOnce()
  })
  
  it.each([
    new Response(null, { status: 401 }),
    Response.json({ unexpected: true }),
  ])("fails closed for missing or invalid session responses", async function(response) {
    return await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      fetch: vi.fn(async function() { return response }),
      now: new Date("2029-01-01T00:00:00.000Z"),
    })).resolves.toBeNull()
  }
  )

  it("fails closed when the session endpoint cannot be reached", async function() {
    return await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      fetch: vi.fn(async function() { throw new Error("connection details must stay private") }),
      now: new Date("2029-01-01T00:00:00.000Z"),
    })).resolves.toBeNull()
  })

  it("bounds a streaming response even when content-length is absent", async function() {
    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(10_000))
        return controller.enqueue(new Uint8Array(10_000))
      }
    })
    return await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      fetch: vi.fn(async function() { return new Response(oversized) }),
      now: new Date("2029-01-01T00:00:00.000Z"),
    })).resolves.toBeNull()
  })

  it("cancels a stalled response body at the same deadline", async function() {
    const stalled = new ReadableStream<Uint8Array>({
      start(controller) {
        return controller.enqueue(new TextEncoder().encode("{"))
      }
    })
    return await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      fetch: vi.fn(async function() { return new Response(stalled) }),
      now: new Date("2029-01-01T00:00:00.000Z"),
      timeoutMs: 5,
    })).resolves.toBeNull()
  })

  it("aborts a hanging session request within the configured deadline", async function() {
    const fetchSession = vi.fn((request: Request) => new Promise<Response>((resolve) => {
      request.signal.addEventListener("abort", () => resolve(new Response(null, { status: 504 })))
      return
    }
    ))
    await expect(getPortalSession({
      cookieHeader: "better-auth.session_token=opaque",
      fetch: fetchSession,
      now: new Date("2029-01-01T00:00:00.000Z"),
      timeoutMs: 5,
    })).resolves.toBeNull()
    return expect(fetchSession.mock.calls[0]?.[0].signal.aborted).toBe(true)
  })

  it("accepts the canonical fallback and rejects every non-origin URL shape", function() {
    expect(resolvePortalAppUrl("").protocol).toBe("https:")
    const results=[];for (const configured of [
      "https://portal.example.test/path",
      "https://portal.example.test?query=1",
      "https://portal.example.test#fragment",
      "not a URL",
    ]) {
      results.push(expect(() => resolvePortalAppUrl(configured)).toThrow(
        "Portal application URL must be a clean HTTPS origin",
      ))
    };return results;
  })

  it("accepts Date expirations and trims bounded administrator names", function() {
    const expiresAt = new Date("2030-01-01T00:00:00.000Z")
    return expect(parsePortalSession({
      user: {
        id: "admin-1",
        name: "  Example Admin  ",
        role: "admin",
        status: "active",
      },
      session: { expiresAt },
    }, new Date("2029-01-01T00:00:00.000Z"))).toEqual({
      userId: "admin-1",
      name: "Example Admin",
      role: "admin",
      status: "active",
      expiresAt,
    })
  })

  it.each([
    [],
    { ...activeSession, user: [] },
    { ...activeSession, session: [] },
    { ...activeSession, user: { ...activeSession.user, id: "" } },
    {
      ...activeSession,
      user: { ...activeSession.user, id: "x".repeat(257) },
    },
    { ...activeSession, user: { ...activeSession.user, name: " " } },
    {
      ...activeSession,
      user: { ...activeSession.user, name: "x".repeat(201) },
    },
    { ...activeSession, session: { expiresAt: 123 } },
    { ...activeSession, session: { expiresAt: new Date(Number.NaN) } },
    {
      ...activeSession,
      session: { expiresAt: "2029-01-01T00:00:00.000Z" },
    },
  ])("rejects malformed session field boundaries", function(value) {
    return expect(
      parsePortalSession(value, new Date("2029-01-01T00:00:00.000Z")),
    ).toBeNull()
  }
  )

  it("validates callback values directly and selects the first safe request header", function() {
    for (const value of [
      null,
      "",
      "dashboard",
      "//attacker.invalid/path",
      "/dashboard#fragment",
      "/dashboard\\nested",
      "/dashboard\u0000",
      `/${"x".repeat(2_048)}`,
    ]) {
      expect(safePortalCallbackPath(value)).toBeNull()
    }
    expect(safePortalCallbackPath("/admin/users?cursor=next")).toBe(
      "/admin/users?cursor=next",
    )
    expect(safePortalCallbackPath("/operator/runs/run-1?view=timeline")).toBeNull()

    const fallbackHeaders = new Headers({
      "x-pathname": "/public",
      "x-invoke-path": "/account/security?tab=sessions",
      "next-url": "/dashboard",
    })
    expect(resolvePortalCallbackPath(fallbackHeaders)).toBe(
      "/account/security?tab=sessions",
    )
    fallbackHeaders.set("x-pathname", "/admin/users")
    return expect(resolvePortalCallbackPath(fallbackHeaders)).toBe("/admin/users")
  })

  it("does not call the session endpoint without a usable cookie", async function() {
    const fetchSession = vi.fn(async () => Response.json(activeSession))

    await expect(getPortalSession({
      cookieHeader: null,
      fetch: fetchSession,
    })).resolves.toBeNull()
    await expect(getPortalSession({
      cookieHeader: "   ",
      fetch: fetchSession,
    })).resolves.toBeNull()
    return expect(fetchSession).not.toHaveBeenCalled()
  })

  it("fails closed for bodyless, empty, malformed, and declared-oversized responses", async function() {
    const responses = [
      () => new Response(null),
      () => new Response(null, {
        headers: { "content-length": "16385" },
      }),
      () => new Response(""),
      () => new Response("{"),
      () => new Response(JSON.stringify(activeSession), {
        headers: { "content-length": "16385" },
      }),
    ]

    const results1=[];for (const response of responses) {
      results1.push(await expect(getPortalSession({
        cookieHeader: "better-auth.session_token=opaque",
        fetch: vi.fn(async () => response()),
        now: new Date("2029-01-01T00:00:00.000Z"),
      })).resolves.toBeNull())
    };return results1;
  })

  it("clamps finite deadlines and uses the default for non-finite input", async function() {
    const results2=[];for (const timeoutMs of [-10, 20_000, Number.NaN]) {
      results2.push(await expect(getPortalSession({
        cookieHeader: "better-auth.session_token=opaque",
        fetch: vi.fn(async () => new Response(
          JSON.stringify(activeSession),
          { headers: { "content-length": "not-declared" } },
        )),
        now: new Date("2029-01-01T00:00:00.000Z"),
        timeoutMs,
      })).resolves.toMatchObject({
        userId: "user-1",
        role: "member",
      }))
    };return results2;
  })

  it("uses the global session transport when no fetch override is supplied", async function() {
    const fetchSession = vi.fn(async () => Response.json(activeSession))
    vi.stubGlobal("fetch", fetchSession)
    try {
      await expect(getPortalSession({
        cookieHeader: "better-auth.session_token=opaque",
        now: new Date("2029-01-01T00:00:00.000Z"),
      })).resolves.toMatchObject({ userId: "user-1", role: "member" })
      return expect(fetchSession).toHaveBeenCalledOnce()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it("cancels a response body that arrives only after the session deadline", async function() {
    vi.useFakeTimers()
    const cancel = vi.fn()
    try {
      const pending = getPortalSession({
        cookieHeader: "better-auth.session_token=opaque",
        fetch: (request) => new Promise<Response>((resolve) => {
          request.signal.addEventListener(
            "abort",
            () => void resolve(new Response(new ReadableStream<Uint8Array>({ cancel }))),
            { once: true },
          )
          return
        }
        ),
        timeoutMs: 5,
      })

      await vi.advanceTimersByTimeAsync(5)

      await expect(pending).resolves.toBeNull()
      return expect(cancel).toHaveBeenCalledOnce()
    }
    finally {
      vi.useRealTimers()
    }
  })

  return it("fails closed if URL parsing throws after callback prevalidation", function() {
    const NativeUrl = URL
    class ThrowingUrl extends NativeUrl {
      constructor(value: string | URL, base?: string | URL) {
        if (value === "/dashboard") throw new TypeError("URL parser unavailable")
        super(value, base)
      }
    }
    vi.stubGlobal("URL", ThrowingUrl)
    try {
      return expect(safePortalCallbackPath("/dashboard")).toBeNull()
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
