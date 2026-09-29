import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  betterAuth: vi.fn(),
  createAuthMiddleware: vi.fn(),
  drizzleAdapter: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  context: undefined as unknown,
}))

vi.mock("better-auth", () => ({ betterAuth: mocks.betterAuth }))
vi.mock("@better-auth/drizzle-adapter", () => ({
  drizzleAdapter: mocks.drizzleAdapter,
}))
vi.mock("better-auth/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("better-auth/api")>()
  return {
    ...actual,
    createAuthMiddleware: mocks.createAuthMiddleware,
  }
}
)
vi.mock("better-auth/crypto", () => ({
  hashPassword: mocks.hashPassword,
  verifyPassword: mocks.verifyPassword,
}))

import {
  AUTHORIZATION_ERROR_CODES,
  PASSWORD_RESET_DELIVERY_ERROR_CODE,
  createAuth,
  createAuthHandler,
  ensureDevelopmentSeedIdentity,
  requireRole,
  requireSession,
  type DarkFactoryAuth,
  type DevelopmentSeedIdentity,
} from "./server.ts"

const BASE_URL = "https://darkfactory.localhost"
const SAFE_SIGN_UP_RESPONSE = {
  status: true,
  message: "If this email can be registered, check your email for a verification link",
}
const SAFE_RESET_RESPONSE = {
  status: true,
  message: "If this email exists in our system, check your email for the reset link",
}

beforeEach(function() {
  mocks.context = undefined
  mocks.betterAuth.mockReset()
  mocks.createAuthMiddleware.mockReset()
  mocks.drizzleAdapter.mockReset()
  mocks.hashPassword.mockReset()
  mocks.verifyPassword.mockReset()

  mocks.betterAuth.mockImplementation((options: unknown) => ({
    options,
    $context: Promise.resolve(mocks.context),
  }))
  mocks.createAuthMiddleware.mockImplementation((middleware: unknown) => middleware)
  mocks.drizzleAdapter.mockReturnValue({ kind: "drizzle-adapter" })
  mocks.hashPassword.mockImplementation(async (password: unknown) => {
    return `hashed::${String(password)}`
  }
  )
  mocks.verifyPassword.mockResolvedValue(true)
  return undefined
}
)

afterEach(function() {
  vi.useRealTimers()
  vi.restoreAllMocks()
  return undefined
}
)

type MiddlewareContext = Readonly<{
  path: string
  body?: unknown
  context: unknown
}>

type CapturedAuthOptions = Readonly<{
  hooks: Readonly<{
    before: (context: MiddlewareContext) => Promise<unknown>
    after: (context: MiddlewareContext) => Promise<unknown>
  }>
  databaseHooks: Readonly<{
    user: Readonly<{
      create: Readonly<{
        after: (user: Readonly<{ id: string; name: string }>) => Promise<unknown>
      }>
    }>
    session: Readonly<{
      create: Readonly<{
        before: (session: Readonly<{ userId: string }>) => Promise<unknown>
      }>
    }>
  }>
}>

type ResourceState = Readonly<{
  profiles: Map<string, string>
  preferences: Set<string>
}>

const createResourceDatabase = (
  initialProfiles: Readonly<Record<string, string>> = {},
) => {
  const state: ResourceState = {
    profiles: new Map(Object.entries(initialProfiles)),
    preferences: new Set(),
  }
  const insert = vi.fn((_table: unknown) => ({
    values: vi.fn((value: Readonly<Record<string, unknown>>) => ({
      onConflictDoNothing: vi.fn(async () => {
        const userId = String(value["userId"])
        if ("displayName" in value) {
          if (!state.profiles.has(userId)) {
            return state.profiles.set(userId, String(value["displayName"]))
          };return
        }
        else {
          return state.preferences.add(userId)
        }
      }
      ),
    })),
  }))
  const database = {
    insert,
    transaction: vi.fn(),
  }
  database.transaction.mockImplementation(
    async (operation: (transaction: typeof database) => Promise<unknown>) => {
      return await operation(database)
    }
  )
  return { database, state, insert }
}

const createEmail = () => ({
  sendPasswordReset: vi.fn().mockResolvedValue({
    status: "previewed",
    provider: "preview",
    artifactPath: "/tmp/reset.html",
  }),
  sendEmailVerification: vi.fn().mockResolvedValue({
    status: "previewed",
    provider: "preview",
    artifactPath: "/tmp/verification.html",
  }),
})

const createConfiguredAuth = (database: unknown) => {
  return createAuth({
    database: database as never,
    secret: "auth-server-test-secret-at-least-thirty-two-characters",
    baseURL: BASE_URL,
    email: createEmail() as never,
    scheduleBackgroundTask: () => undefined,
    rateLimitEnabled: false,
  }) as unknown as { options: CapturedAuthOptions }
}

const sessionValue = (
  role: unknown = "member",
  status: unknown = "active",
) => ({
  user: {
    id: "user-1",
    name: "Member Example",
    email: "member@domain.test",
    emailVerified: true,
    image: undefined,
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
    role,
    status,
    token: "must-not-escape",
  },
  session: {
    id: "session-1",
    userId: "user-1",
    expiresAt: new Date("2025-02-01T00:00:00.000Z"),
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    updatedAt: new Date("2025-01-02T00:00:00.000Z"),
    ipAddress: undefined,
    userAgent: undefined,
    token: "must-not-escape",
  },
})

const authWithSession = (value: unknown) => ({
  api: { getSession: vi.fn().mockResolvedValue(value) },
}) as unknown as DarkFactoryAuth

const request = (path: string, method = "POST") => {
  return new Request(`${BASE_URL}${path}`, { method })
}

const handlerAuth = (
  response: Response,
  ...sessions: unknown[]
) => {
  const session = sessions.length === 0 ? null : sessions[0]
  const getSession = vi.fn().mockResolvedValue(session)
  const handler = vi.fn().mockResolvedValue(response)
  return {
    auth: { api: { getSession }, handler } as unknown as DarkFactoryAuth,
    getSession,
    handler,
  }
}

const jsonBody = async (response: Response) => {
  return await response.json() as Record<string, unknown>
}

describe("safe authorization sessions", function() {
  it("rejects a missing session with the stable authentication error", async function() {
    const headers = new Headers({ cookie: "better-auth.session_token=missing" })
    const getSession = vi.fn().mockResolvedValue(null)

    await expect(requireSession({ api: { getSession } } as never, headers)).rejects.toMatchObject({
      name: "AuthAuthorizationError",
      message: AUTHORIZATION_ERROR_CODES.AUTH_REQUIRED,
      code: AUTHORIZATION_ERROR_CODES.AUTH_REQUIRED,
      status: 401,
    })
    expect(getSession).toHaveBeenCalledOnce()
    return expect(getSession).toHaveBeenCalledWith({ headers })
  }
  )

  it("returns an authenticated active session", async function() {
    return await expect(
      requireSession(
        authWithSession(sessionValue("admin", "active")),
        new Headers(),
      ),
    ).resolves.toMatchObject({
      principal: { userId: "user-1", role: "admin", status: "active" },
    })
  }
  )

  it.each([
    ["suspended", AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED],
    ["deactivated", AUTHORIZATION_ERROR_CODES.ACCOUNT_DEACTIVATED],
  ] as const)("rejects a %s session before returning private identity data", async function(status, code) {
    return await expect(
      requireSession(authWithSession(sessionValue("member", status)), new Headers()),
    ).rejects.toMatchObject({
      name: "AuthAuthorizationError",
      message: code,
      code,
      status: 403,
    })
  }
  )

  it.each([
    ["role", sessionValue("owner", "active"), "Auth user has an invalid role"],
    ["status", sessionValue("member", "invited"), "Auth user has an invalid status"],
  ] as const)("rejects an invalid session %s", async function(_field, value, message) {
    return await expect(requireSession(authWithSession(value), new Headers())).rejects.toThrowError(message)
  }
  )

  it("returns only the normalized safe session contract", async function() {
    const result = await requireSession(
      authWithSession(sessionValue("member", "active")),
      new Headers(),
    )

    expect(result).toEqual({
      user: {
        id: "user-1",
        name: "Member Example",
        email: "member@domain.test",
        emailVerified: true,
        image: null,
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        role: "member",
        status: "active",
      },
      session: {
        id: "session-1",
        userId: "user-1",
        expiresAt: new Date("2025-02-01T00:00:00.000Z"),
        createdAt: new Date("2025-01-01T00:00:00.000Z"),
        updatedAt: new Date("2025-01-02T00:00:00.000Z"),
        ipAddress: null,
        userAgent: null,
      },
      principal: {
        userId: "user-1",
        role: "member",
        status: "active",
      },
    })
    return expect(JSON.stringify(result)).not.toContain("must-not-escape")
  }
  )

  return it("requires the exact role after validating the session", async function() {
    const auth = authWithSession(sessionValue("member", "active"))

    await expect(requireRole(auth, new Headers(), "admin")).rejects.toMatchObject({
      name: "AuthAuthorizationError",
      code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
      status: 403,
    })
    return await expect(requireRole(auth, new Headers(), "member")).resolves.toMatchObject({
      principal: { userId: "user-1", role: "member", status: "active" },
    })
  }
  )
}
)

const malformedPresentSessionCases = [
  ["primitive", function() { return ({ session: "active", traps: [] }) }],
  ["array", function() { return ({ session: [], traps: [] }) }],
  ["missing user", function() { return ({ session: {}, traps: [] }) }],
  ["null user", function() { return ({ session: { user: null }, traps: [] }) }],
  ["non-plain session", function() { return ({
    session: Object.create({ user: { status: "active" } }),
    traps: [],
  }) }],
  ["non-plain user", function() { return ({
    session: { user: Object.create({ status: "active" }) },
    traps: [],
  }) }],
  ["non-plain status container", function() { return ({
    session: { user: { status: Object("active") } },
    traps: [],
  }) }],
  ["session user accessor", function() {
    const accessor = vi.fn(function() {
      throw new Error("private session user accessor")
    }
    )
    const session = {}
    Object.defineProperty(session, "user", {
      enumerable: true,
      get: accessor,
    })
    return ({ session, traps: [accessor] })
  }
  ],
  ["user status accessor", function() {
    const accessor = vi.fn(function() {
      throw new Error("private user status accessor")
    }
    )
    const user = {}
    Object.defineProperty(user, "status", {
      enumerable: true,
      get: accessor,
    })
    return ({ session: { user }, traps: [accessor] })
  }
  ],
  ["session proxy", function() {
    const trap = vi.fn(function() {
      throw new Error("private session proxy trap")
    }
    )
    const session = new Proxy(
      { user: { status: "active" } },
      {
        getOwnPropertyDescriptor: trap,
        getPrototypeOf: trap,
        ownKeys: trap,
      },
    )
    return ({ session, traps: [trap] })
  }
  ],
  ["user proxy", function() {
    const trap = vi.fn(function() {
      throw new Error("private user proxy trap")
    }
    )
    const user = new Proxy(
      { status: "active" },
      {
        get: trap,
        getOwnPropertyDescriptor: trap,
        getPrototypeOf: trap,
        ownKeys: trap,
      },
    )
    return ({ session: { user }, traps: [trap] })
  }
  ],
] as const

describe("createAuth hooks", function() {
  it.each([
    "/sign-up/email",
    "/sign-in/email",
    "/request-password-reset",
    "/send-verification-email",
  ])("normalizes an email for %s without mutating the caller body", async function(path) {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before
    const body = { email: "  Member@Domain.TEST  ", password: "unchanged" }

    const result = await before({ path, body, context: {} })

    expect(result).toEqual({
      context: {
        path,
        body: { email: "member@domain.test", password: "unchanged" },
        context: {},
      },
    })
    return expect(body).toEqual({ email: "  Member@Domain.TEST  ", password: "unchanged" })
  }
  )

  it.each([
    ["unrelated path", "/change-password", { email: " Member@Domain.TEST " }],
    ["missing email", "/sign-up/email", { name: "Member" }],
    ["non-string email", "/request-password-reset", { email: null }],
    ["already normalized", "/sign-in/email", { email: "member@domain.test" }],
  ] as const)("leaves %s request bodies unchanged", async function(_case, path, body) {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    return await expect(before({ path, body, context: {} })).resolves.toBeUndefined()
  }
  )

  it("normalizes email after admitting an active current session", async function() {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    const result = await before({
      path: "/sign-in/email",
      body: { email: "  ACTIVE@Domain.TEST  ", password: "unchanged" },
      context: { session: { user: { status: "active" } } },
    })

    return expect(result).toEqual({
      context: {
        path: "/sign-in/email",
        body: { email: "active@domain.test", password: "unchanged" },
        context: { session: { user: { status: "active" } } },
      },
    })
  }
  )


  it.each([
    ["suspended", AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED],
    ["deactivated", AUTHORIZATION_ERROR_CODES.ACCOUNT_DEACTIVATED],
  ] as const)("blocks a %s current session inside Better Auth", async function(status, code) {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    return await expect(before({
      path: "/change-password",
      context: { session: { user: { status } } },
    })).rejects.toMatchObject({
      body: { code, message: "Account is unavailable" },
    })
  }
  )

  it.each([
    ["missing status", undefined],
    ["unknown status", "pending"],
    ["non-string status", null],
  ] as const)("fails closed for a current session with %s inside Better Auth", async function(_case, status) {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    return await expect(before({
      path: "/change-password",
      context: { session: { user: { status } } },
    })).rejects.toMatchObject({
      body: {
        code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
        message: "Account is unavailable",
      },
    })
  }
  )

  it.each([
    ["undefined", undefined],
    ["null", null],
  ] as const)("admits a canonically absent %s current session", async function(_case, session) {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    return await expect(before({
      path: "/change-password",
      context: { session },
    })).resolves.toBeUndefined()
  }
  )

  it.each(malformedPresentSessionCases)(
    "fails closed for a malformed %s current session without leaking private failures",
    async function(_case, createCase) {
      const { database } = createResourceDatabase()
      const before = createConfiguredAuth(database).options.hooks.before
      const { session, traps } = createCase()

      await expect(before({
        path: "/change-password",
        context: { session },
      })).rejects.toMatchObject({
        body: {
          code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
          message: "Account is unavailable",
        },
      })
      if (_case.includes("proxy")) {
        expect(traps[0]).toHaveBeenCalledOnce()
      }
      else {
        for (const trap of traps) expect(trap).not.toHaveBeenCalled()
      }
      return undefined
    }
  )

  it("allows an inactive current session to sign out", async function() {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before

    return await expect(before({
      path: "/sign-out",
      context: { session: { user: { status: "suspended" } } },
    })).resolves.toBeUndefined()
  }
  )

  it("exempts sign out before reading a current-session accessor", async function() {
    const { database } = createResourceDatabase()
    const before = createConfiguredAuth(database).options.hooks.before
    const accessor = vi.fn(function() {
      throw new Error("private sign-out session accessor")
    }
    )
    const context = {}
    Object.defineProperty(context, "session", {
      enumerable: true,
      get: accessor,
    })

    await expect(before({
      path: "/sign-out",
      context,
    })).resolves.toBeUndefined()
    return expect(accessor).not.toHaveBeenCalled()
  }
  )

  it("provisions application resources after an email sign-in only", async function() {
    const { database, state } = createResourceDatabase()
    const after = createConfiguredAuth(database).options.hooks.after

    await after({
      path: "/sign-in/email",
      context: { newSession: { user: { id: "user-2", name: "Signed In Member" } } },
    })
    await after({
      path: "/sign-in/email",
      context: { newSession: null },
    })
    await after({
      path: "/sign-out",
      context: { newSession: { user: { id: "ignored", name: "Ignored" } } },
    })

    expect([...state.profiles]).toEqual([["user-2", "Signed In Member"]])
    return expect([...state.preferences]).toEqual(["user-2"])
  }
  )

  it("provisions application resources after Better Auth persists a new user", async function() {
    const { database, state } = createResourceDatabase()
    const afterUserCreate = createConfiguredAuth(database).options
      .databaseHooks.user.create.after

    await expect(afterUserCreate({
      id: "user-created",
      name: "Created Member",
    })).resolves.toBeUndefined()
    expect([...state.profiles]).toEqual([["user-created", "Created Member"]])
    return expect([...state.preferences]).toEqual(["user-created"])
  }
  )

  it.each([
    ["active", undefined],
    ["suspended", AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED],
    ["deactivated", AUTHORIZATION_ERROR_CODES.ACCOUNT_DEACTIVATED],
    ["unknown", AUTHORIZATION_ERROR_CODES.FORBIDDEN],
    [null, AUTHORIZATION_ERROR_CODES.FORBIDDEN],
  ] as const)("applies the session-create status gate for %s", async function(status, errorCode) {
    const rows = status === undefined ? [] : [{ status }]
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue(rows),
          })),
        })),
      })),
    }
    const beforeSessionCreate = createConfiguredAuth(database).options
      .databaseHooks.session.create.before
    const result = beforeSessionCreate({ userId: "user-status" })

    if (errorCode === undefined) {
      await expect(result).resolves.toBeUndefined()
    }
    else {
      await expect(result).rejects.toMatchObject({
        body: { code: errorCode, message: "Account is unavailable" },
      })
    }
    return undefined
  }
  )

  return it("fails closed when the session user lookup returns no row", async function() {
    const database = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    }
    const beforeSessionCreate = createConfiguredAuth(database).options
      .databaseHooks.session.create.before

    return await expect(
      beforeSessionCreate({ userId: "missing-user" }),
    ).rejects.toMatchObject({
      body: {
        code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
        message: "Account is unavailable",
      },
    })
  }
  )
}
)

describe("fetch-native auth handler status gate", function() {
  it.each([
    "/api/auth/ok",
    "/api/auth/sign-up/email",
    "/api/auth/sign-in/email",
    "/api/auth/sign-out",
    "/api/auth/request-password-reset",
    "/api/auth/send-verification-email",
    "/api/auth/verify-email",
    "/api/auth/reset-password",
    "/api/auth/reset-password/opaque-reset-token",
  ])("exempts %s so an inactive user can reach the recovery operation", async function(path) {
    const { auth, getSession, handler } = handlerAuth(
      new Response("delegated", { status: 422 }),
      { user: { status: "suspended" } },
    )

    const response = await createAuthHandler(auth)(request(path))

    expect(response.status).toBe(422)
    await expect(response.text()).resolves.toBe("delegated")
    expect(getSession).not.toHaveBeenCalled()
    return expect(handler).toHaveBeenCalledOnce()
  }
  )

  const sessionHandlerResponse = (
    body: string | undefined,
    status = 200,
    statusText = "OK",
    contentType: string | null = "application/json; charset=utf-8",
  ): Response => {
    const response = new Response(body, {
      status,
      statusText,
      headers: {
        ...(contentType === null ? {} : { "content-type": contentType }),
        "cache-control": "no-store",
        "set-cookie": "better-auth.session_data=refreshed; Path=/; HttpOnly",
        "x-auth-resolution": "handler",
      },
    })
    if (contentType === null) response.headers.delete("content-type")
    return response
  }

  it.each([
    ["active", JSON.stringify({
      session: { id: "active-session" },
      user: { status: "active" },
    }), 202, "Accepted"],
    ["null", "null", 200, "Session Missing"],
    ["empty", "   ", 200, "Session Missing"],
  ] as const)(
    "uses one handler resolution for a %s GET session response",
    async function(_case, body, status, statusText) {
      const { auth, getSession, handler } = handlerAuth(
        sessionHandlerResponse(body, status, statusText),
        { user: { status: "suspended" } },
      )

      const response = await createAuthHandler(auth)(
        request("/api/auth/get-session", "GET"),
      )

      expect(response.status).toBe(status)
      expect(response.statusText).toBe(statusText)
      expect(response.headers.get("cache-control")).toBe("no-store")
      expect(response.headers.get("set-cookie")).toBe(
        "better-auth.session_data=refreshed; Path=/; HttpOnly",
      )
      expect(response.headers.get("x-auth-resolution")).toBe("handler")
      await expect(response.text()).resolves.toBe(body)
      expect(getSession).not.toHaveBeenCalled()
      expect(handler).toHaveBeenCalledOnce()
      return undefined
    }
  )

  it.each([
    ["suspended", { user: { status: "suspended" } }, AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED],
    ["deactivated", { user: { status: "deactivated" } }, AUTHORIZATION_ERROR_CODES.ACCOUNT_DEACTIVATED],
    ["primitive", "present", AUTHORIZATION_ERROR_CODES.FORBIDDEN],
    ["missing user", {}, AUTHORIZATION_ERROR_CODES.FORBIDDEN],
    ["missing status", { user: {} }, AUTHORIZATION_ERROR_CODES.FORBIDDEN],
    ["unknown status", { user: { status: "pending" } }, AUTHORIZATION_ERROR_CODES.FORBIDDEN],
  ] as const)(
    "fails closed for a %s present GET session without a second lookup",
    async function(_case, session, code) {
      const { auth, getSession, handler } = handlerAuth(
        sessionHandlerResponse(JSON.stringify(session)),
        null,
      )

      const response = await createAuthHandler(auth)(
        request("/api/auth/get-session", "GET"),
      )

      expect(response.status).toBe(403)
      await expect(jsonBody(response)).resolves.toEqual({
        code,
        message: "Account is unavailable",
      })
      expect(getSession).not.toHaveBeenCalled()
      expect(handler).toHaveBeenCalledOnce()
      return undefined
    }
  )

  it("normalizes the JSON media type before applying the GET session gate", async function() {
    const { auth, getSession, handler } = handlerAuth(
      sessionHandlerResponse(
        JSON.stringify({
          session: { token: "must-not-escape" },
          user: { status: "suspended" },
        }),
        200,
        "OK",
        "Application/JSON ; Charset=UTF-8",
      ),
      null,
    )

    const response = await createAuthHandler(auth)(
      request("/api/auth/get-session", "GET"),
    )

    expect(response.status).toBe(403)
    await expect(jsonBody(response)).resolves.toEqual({
      code: AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED,
      message: "Account is unavailable",
    })
    expect(getSession).not.toHaveBeenCalled()
    return expect(handler).toHaveBeenCalledOnce()
  }
  )

  it.each([
    [
      "active",
      206,
      "Partial Content",
      {
        token: "root-token",
        session: { id: "active-session", token: "session-token" },
        user: { status: "active", token: "user-token" },
      },
      {
        session: { id: "active-session" },
        user: { status: "active" },
      },
      "application/json; charset=utf-8",
    ],
    [
      "non-OK",
      503,
      "Service Unavailable",
      {
        code: "SESSION_ADAPTER_UNAVAILABLE",
        message: "Session unavailable",
        token: "must-not-escape",
      },
      {
        code: "SESSION_ADAPTER_UNAVAILABLE",
        message: "Session unavailable",
      },
      "application/json ; charset=utf-8",
    ],
  ] as const)(
    "preserves metadata while sanitizing the %s GET session response",
    async function(_case, status, statusText, body, expectedBody, contentType) {
      const { auth, getSession, handler } = handlerAuth(
        sessionHandlerResponse(JSON.stringify(body), status, statusText, contentType),
        { user: { status: "suspended" } },
      )

      const response = await createAuthHandler(auth)(
        request("/api/auth/get-session", "GET"),
      )

      expect(response.status).toBe(status)
      expect(response.statusText).toBe(statusText)
      expect(response.headers.get("set-cookie")).toBe(
        "better-auth.session_data=refreshed; Path=/; HttpOnly",
      )
      expect(response.headers.get("x-auth-resolution")).toBe("handler")
      await expect(jsonBody(response)).resolves.toEqual(expectedBody)
      expect(getSession).not.toHaveBeenCalled()
      expect(handler).toHaveBeenCalledOnce()
      return undefined
    }
  )

  it("preserves the redacted JSON parse failure for GET session", async function() {
    const { auth, getSession, handler } = handlerAuth(
      sessionHandlerResponse("{not-json"),
      null,
    )

    await expect(
      createAuthHandler(auth)(request("/api/auth/get-session", "GET")),
    ).rejects.toThrowError("Authentication JSON response is malformed")
    expect(getSession).not.toHaveBeenCalled()
    return expect(handler).toHaveBeenCalledOnce()
  }
  )

  it.each([
    ["plain text", "text/plain"],
    ["missing content type", null],
  ] as const)(
    "rejects a nonempty successful %s GET session response",
    async function(_case, contentType) {
      const { auth, getSession, handler } = handlerAuth(
        sessionHandlerResponse(
          JSON.stringify({
            session: { token: "must-not-escape" },
            user: { status: "suspended" },
          }),
          200,
          "OK",
          contentType,
        ),
        null,
      )

      await expect(
        createAuthHandler(auth)(request("/api/auth/get-session", "GET")),
      ).rejects.toThrowError("Authentication JSON response is malformed")
      expect(getSession).not.toHaveBeenCalled()
      expect(handler).toHaveBeenCalledOnce()
      return undefined
    }
  )

  it.each([
    ["POST method", "/api/auth/get-session", "POST"],
    ["suffix path", "/api/auth/get-session/extra", "GET"],
    ["prefixed path", "/internal/api/auth/get-session", "GET"],
  ] as const)(
    "requires the exact GET session method and path for %s",
    async function(_case, path, method) {
      const { auth, getSession, handler } = handlerAuth(
        new Response("must not run"),
        { user: { status: "suspended" } },
      )

      const response = await createAuthHandler(auth)(request(path, method))

      expect(response.status).toBe(403)
      expect(getSession).toHaveBeenCalledOnce()
      expect(handler).not.toHaveBeenCalled()
      return undefined
    }
  )

  it.each([
    ["suspended", AUTHORIZATION_ERROR_CODES.ACCOUNT_SUSPENDED],
    ["deactivated", AUTHORIZATION_ERROR_CODES.ACCOUNT_DEACTIVATED],
  ] as const)("rejects a protected request for a %s session", async function(status, code) {
    const { auth, handler } = handlerAuth(
      new Response("must not run"),
      { user: { status } },
    )

    const response = await createAuthHandler(auth)(request("/api/auth/change-password"))

    expect(response.status).toBe(403)
    await expect(jsonBody(response)).resolves.toEqual({
      code,
      message: "Account is unavailable",
    })
    return expect(handler).not.toHaveBeenCalled()
  }
  )

  it.each([
    ["canonical missing session", null],
    ["plain active user", { user: { status: "active" } }],
  ] as const)("delegates a protected request for %s", async function(_case, session) {
    const { auth, getSession } = handlerAuth(
      new Response("delegated", { status: 207 }),
      session,
    )

    const response = await createAuthHandler(auth)(request("/api/auth/change-password"))

    expect(response.status).toBe(207)
    await expect(response.text()).resolves.toBe("delegated")
    return expect(getSession).toHaveBeenCalledOnce()
  }
  )

  it.each([
    ["missing status", { user: {} }],
    ["unknown status", { user: { status: "pending" } }],
    ["non-string status", { user: { status: null } }],
  ] as const)("fails closed for an authenticated user with %s", async function(_case, session) {
    const { auth, getSession, handler } = handlerAuth(
      new Response("must not run"),
      session,
    )

    const response = await createAuthHandler(auth)(request("/api/auth/change-password"))

    expect(response.status).toBe(403)
    await expect(jsonBody(response)).resolves.toEqual({
      code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
      message: "Account is unavailable",
    })
    expect(getSession).toHaveBeenCalledOnce()
    return expect(handler).not.toHaveBeenCalled()
  }
  )


  it.each([
    ["undefined", function() { return ({ session: undefined, traps: [] }) }],
    ...malformedPresentSessionCases,
  ] as const)(
    "fails closed for a malformed %s without leaking private failures",
    async function(_case, createCase) {
      const { session, traps } = createCase()
      const { auth, getSession, handler } = handlerAuth(
        new Response("must not run"),
        session,
      )

      const response = await createAuthHandler(auth)(
        request("/api/auth/change-password"),
      )

      expect(response.status).toBe(403)
      await expect(jsonBody(response)).resolves.toEqual({
        code: AUTHORIZATION_ERROR_CODES.FORBIDDEN,
        message: "Account is unavailable",
      })
      expect(getSession).toHaveBeenCalledOnce()
      expect(handler).not.toHaveBeenCalled()
      if (_case.includes("proxy")) {
        expect(traps[0]).toHaveBeenCalledOnce()
      }
      else {
        for (const trap of traps) expect(trap).not.toHaveBeenCalled()
      }
      return undefined
    }
  )

  return it("propagates a status lookup failure before invoking Better Auth", async function() {
    const failure = new Error("session adapter unavailable")
    const getSession = vi.fn().mockRejectedValue(failure)
    const handler = vi.fn()
    const auth = { api: { getSession }, handler } as unknown as DarkFactoryAuth

    await expect(
      createAuthHandler(auth)(request("/api/auth/change-password")),
    ).rejects.toBe(failure)
    return expect(handler).not.toHaveBeenCalled()
  }
  )
}
)

describe("fetch-native auth response normalization", function() {
  it.each([
    [200, { user: { id: "new-user" }, token: "signup-token" }],
    [422, { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL", message: "duplicate" }],
  ] as const)("normalizes an accepted signup response from status %s after the response floor", async function(status, body) {
    vi.useFakeTimers()
    const { auth } = handlerAuth(Response.json(body, { status }))
    const pending = createAuthHandler(auth)(request("/api/auth/sign-up/email"))
    let settled = false
    void pending.then(() => {
      return settled = true
    }
    )

    await vi.advanceTimersByTimeAsync(249)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    const response = await pending

    expect(response.status).toBe(200)
    expect(response.headers.get("cache-control")).toBe("no-store")
    return await expect(jsonBody(response)).resolves.toEqual(SAFE_SIGN_UP_RESPONSE)
  }
  )

  it("skips an extra delay after the delegated signup already consumed the response floor", async function() {
    const { auth } = handlerAuth(Response.json(
      { user: { id: "new-user" }, token: "signup-token" },
      { status: 200 },
    ))
    const signUpRequest = request("/api/auth/sign-up/email")
    const now = vi.spyOn(Date, "now")
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(1_300)

    const response = await createAuthHandler(auth)(signUpRequest)

    expect(response.status).toBe(200)
    await expect(jsonBody(response)).resolves.toEqual(SAFE_SIGN_UP_RESPONSE)
    return expect(now).toHaveBeenCalledTimes(2)
  }
  )

  it("reports malformed duplicate-signup JSON instead of treating it as a duplicate", async function() {
    const { auth } = handlerAuth(new Response("{not-json", {
      status: 422,
      headers: { "content-type": "application/json" },
    }))

    return await expect(
      createAuthHandler(auth)(request("/api/auth/sign-up/email")),
    ).rejects.toThrowError("Authentication JSON response is malformed")
  }
  )

  it("preserves a non-duplicate signup rejection", async function() {
    const original = { code: "PASSWORD_TOO_SHORT", message: "Use a longer password" }
    const { auth } = handlerAuth(Response.json(original, { status: 422 }))

    const response = await createAuthHandler(auth)(request("/api/auth/sign-up/email"))

    expect(response.status).toBe(422)
    return await expect(jsonBody(response)).resolves.toEqual(original)
  }
  )

  it("does not parse or relabel a headerless signup rejection", async function() {
    const original = "unprocessable signup response"
    const { auth } = handlerAuth(new Response(
      new TextEncoder().encode(original),
      { status: 422 },
    ))

    const response = await createAuthHandler(auth)(request("/api/auth/sign-up/email"))

    expect(response.status).toBe(422)
    expect(response.headers.get("content-type")).toBeNull()
    return await expect(response.text()).resolves.toBe(original)
  }
  )

  it("makes a reset delivery outage indistinguishable from ordinary success", async function() {
    const { auth: ordinaryAuth } = handlerAuth(new Response(JSON.stringify({
      status: true,
      message: "upstream noncanonical success",
      providerDetail: "must not escape",
    }), {
      status: 200,
      headers: {
        "cache-control": "private, max-age=60",
        "content-encoding": "identity",
        "content-length": "888",
        "content-type": "application/json; charset=utf-8",
        "etag": "\"ordinary-provider-secret\"",
        "retry-after": "15",
        "set-cookie": "ordinary_provider_session=secret; HttpOnly",
        "x-provider-request-id": "ordinary-private-provider-id",
      },
    }))
    const { auth: outageAuth } = handlerAuth(new Response(JSON.stringify({
      code: PASSWORD_RESET_DELIVERY_ERROR_CODE,
      message: "private provider details",
      token: "provider-token",
    }), {
      status: 503,
      headers: {
        "cache-control": "public, max-age=300",
        "content-encoding": "identity",
        "content-length": "999",
        "content-type": "application/json; charset=utf-8",
        "etag": "\"provider-secret\"",
        "retry-after": "30",
        "set-cookie": "provider_session=secret; HttpOnly",
        "x-provider-request-id": "private-provider-id",
      },
    }))

    const ordinary = await createAuthHandler(ordinaryAuth)(
      request("/api/auth/request-password-reset"),
    )
    const normalized = await createAuthHandler(outageAuth)(
      request("/api/auth/request-password-reset"),
    )
    const ordinaryBody = await ordinary.text()
    const normalizedBody = await normalized.text()

    expect({
      status: normalized.status,
      body: normalizedBody,
      headers: Object.fromEntries(normalized.headers),
    }).toEqual({
      status: ordinary.status,
      body: ordinaryBody,
      headers: Object.fromEntries(ordinary.headers),
    })
    expect(Object.fromEntries(normalized.headers)).toEqual({
      "cache-control": "no-store",
      "content-type": "application/json",
    })
    const results=[];for (const header of [
      "content-encoding",
      "content-length",
      "etag",
      "retry-after",
      "set-cookie",
      "x-provider-request-id",
    ]) {
      results.push(expect(normalized.headers.get(header)).toBeNull())
    };return results;
  }
  )

  it.each([
    ["wrong status", 502, { code: PASSWORD_RESET_DELIVERY_ERROR_CODE }],
    ["wrong code", 503, { code: "EMAIL_PROVIDER_UNAVAILABLE" }],
  ] as const)("preserves a reset response with the %s", async function(_case, status, body) {
    const { auth } = handlerAuth(Response.json(body, { status }))

    const response = await createAuthHandler(auth)(request("/api/auth/request-password-reset"))

    expect(response.status).toBe(status)
    return await expect(jsonBody(response)).resolves.toEqual(body)
  }
  )

  it("preserves a non-JSON reset delivery response", async function() {
    const { auth } = handlerAuth(new Response("provider unavailable", {
      status: 503,
      headers: { "content-type": "text/plain" },
    }))

    const response = await createAuthHandler(auth)(
      request("/api/auth/request-password-reset"),
    )

    expect(response.status).toBe(503)
    return await expect(response.text()).resolves.toBe("provider unavailable")
  }
  )

  it("does not parse or relabel a headerless reset rejection", async function() {
    const original = "provider unavailable"
    const { auth } = handlerAuth(new Response(
      new TextEncoder().encode(original),
      { status: 503 },
    ))

    const response = await createAuthHandler(auth)(
      request("/api/auth/request-password-reset"),
    )

    expect(response.status).toBe(503)
    expect(response.headers.get("content-type")).toBeNull()
    return await expect(response.text()).resolves.toBe(original)
  }
  )

  it.each([
    ["GET signup", "/api/auth/sign-up/email", "GET", 422, { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }],
    ["signup near path", "/api/auth/sign-up/email/extra", "POST", 422, { code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" }],
    ["GET reset", "/api/auth/request-password-reset", "GET", 503, { code: PASSWORD_RESET_DELIVERY_ERROR_CODE }],
    ["reset near path", "/api/auth/request-password-reset/extra", "POST", 503, { code: PASSWORD_RESET_DELIVERY_ERROR_CODE }],
  ] as const)("does not hide a Better Auth method/path error for %s", async function(_case, path, method, status, body) {
    const { auth } = handlerAuth(Response.json(body, { status }))

    const response = await createAuthHandler(auth)(request(path, method))

    expect(response.status).toBe(status)
    return await expect(jsonBody(response)).resolves.toEqual(body)
  }
  )

  return it("propagates a Better Auth handler failure unchanged", async function() {
    const failure = new Error("Better Auth route failed")
    const getSession = vi.fn()
    const handler = vi.fn().mockRejectedValue(failure)
    const auth = { api: { getSession }, handler } as unknown as DarkFactoryAuth

    await expect(
      createAuthHandler(auth)(request("/api/auth/sign-in/email")),
    ).rejects.toBe(failure)
    return expect(getSession).not.toHaveBeenCalled()
  }
  )
}
)

describe("fetch-native auth token sanitization", function() {
  it("removes token fields recursively while preserving callback destinations and response metadata", async function() {
    const { auth } = handlerAuth(new Response(JSON.stringify({
      token: "root-secret",
      callbackURL: "/dashboard?source=auth",
      nested: {
        token: "nested-secret",
        callbackURL: "/feature-items",
        value: "a token word is ordinary content",
      },
      entries: [
        { token: "array-secret", allowed: true },
        "token",
        null,
      ],
    }), {
      status: 201,
      statusText: "Created",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-length": "999",
        "x-auth-result": "created",
      },
    }))

    const response = await createAuthHandler(auth)(request("/api/auth/callback/credential"))

    expect(response.status).toBe(201)
    expect(response.statusText).toBe("Created")
    expect(response.headers.get("content-type")).toBe("application/json")
    expect(response.headers.get("content-length")).toBeNull()
    expect(response.headers.get("x-auth-result")).toBe("created")
    return await expect(jsonBody(response)).resolves.toEqual({
      callbackURL: "/dashboard?source=auth",
      nested: {
        callbackURL: "/feature-items",
        value: "a token word is ordinary content",
      },
      entries: [
        { allowed: true },
        "token",
        null,
      ],
    })
  }
  )

  it.each([
    ["non-JSON", new Response("token=ordinary-text", { headers: { "content-type": "text/plain" } }), "token=ordinary-text"],
    ["empty JSON", new Response("   ", { headers: { "content-type": "application/json" } }), "   "],
    ["token-free JSON", new Response("{\"callbackURL\":\"/dashboard\"}", { headers: { "content-type": "application/json", "content-length": "42" } }), "{\"callbackURL\":\"/dashboard\"}"],
  ] as const)("returns a %s response body unchanged", async function(_case, original, expectedBody) {
    const { auth } = handlerAuth(original)

    const response = await createAuthHandler(auth)(request("/api/auth/callback/credential"))

    return await expect(response.text()).resolves.toBe(expectedBody)
  }
  )

  it("reports malformed JSON with a stable redacted error", async function() {
    const { auth } = handlerAuth(new Response("{not-json", {
      status: 502,
      headers: { "content-type": "application/json" },
    }))

    return await expect(
      createAuthHandler(auth)(request("/api/auth/callback/credential")),
    ).rejects.toThrowError("Authentication JSON response is malformed")
  }
  )

  return it("does not relabel malformed reset-provider JSON", async function() {
    const { auth } = handlerAuth(new Response("{not-json", {
      status: 503,
      headers: { "content-type": "application/json" },
    }))

    return await expect(
      createAuthHandler(auth)(request("/api/auth/request-password-reset")),
    ).rejects.toBeInstanceOf(SyntaxError)
  }
  )
}
)

const IDENTITY: DevelopmentSeedIdentity = {
  userId: "seed-user",
  accountId: "seed-account",
  name: "Development Member",
  email: "developer@domain.test",
  image: "https://assets.domain.test/member.png",
  role: "member",
  password: "DevelopmentPassword!42",
}

type SeedUser = Record<string, unknown> & Readonly<{ id: string }>
type SeedAccount = Record<string, unknown> & Readonly<{ id: string }>

const createSeedAdapter = (
  initialUser?: SeedUser,
  initialAccounts: readonly SeedAccount[] = [],
) => {
  let currentUser = initialUser === undefined ? undefined : { ...initialUser }
  let accounts = initialAccounts.map((account) => ({ ...account }))
  const adapter = {
    createUser: vi.fn(async (value: SeedUser) => {
      currentUser = { ...value }
      return { ...currentUser }
    }
    ),
    linkAccount: vi.fn(async (value: SeedAccount) => {
      accounts.push({ ...value })
      return { ...value }
    }
    ),
    findUserById: vi.fn(async (_userId: string) => {
      return currentUser === undefined ? null : { ...currentUser }
    }
    ),
    updateUser: vi.fn(async (_userId: string, value: Record<string, unknown>) => {
      currentUser = { ...currentUser, ...value } as SeedUser
      return { ...currentUser }
    }
    ),
    findAccounts: vi.fn(async (_userId: string) => {
      return accounts.map((account) => ({ ...account }))
    }
    ),
    updateAccount: vi.fn(async (accountId: string, value: Record<string, unknown>) => {
      accounts = accounts.map((account) => {
        return account.id === accountId ? { ...account, ...value } : account
      }
      )
      return accounts.find((account) => account.id === accountId)
    }
    ),
  }
  return {
    adapter,
    user: () => currentUser,
    accounts: () => accounts,
  }
}

const exactExistingSeedUser = (identity: DevelopmentSeedIdentity = IDENTITY): SeedUser => ({
  id: identity.userId,
  name: identity.name,
  email: identity.email,
  emailVerified: true,
  image: identity.image,
  role: identity.role,
  status: "active",
})

const seedCredential = (
  identity: DevelopmentSeedIdentity = IDENTITY,
  password = "stored-hash",
): SeedAccount => ({
  id: identity.accountId,
  userId: identity.userId,
  providerId: "credential",
  accountId: identity.userId,
  password,
})

describe("development seed identity preparation", function() {
  it("creates a prepared user, credential, profile, and preferences", async function() {
    const seed = createSeedAdapter()
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(applyIdentity(IDENTITY, false, database as never)).resolves.toBeUndefined()

    expect(seed.user()).toEqual({
      id: IDENTITY.userId,
      name: IDENTITY.name,
      email: IDENTITY.email,
      emailVerified: true,
      image: IDENTITY.image,
      role: "member",
      status: "active",
    })
    expect(seed.accounts()).toEqual([{
      id: IDENTITY.accountId,
      userId: IDENTITY.userId,
      providerId: "credential",
      accountId: IDENTITY.userId,
      password: `hashed::${IDENTITY.password}`,
    }])
    expect([...state.profiles]).toEqual([[IDENTITY.userId, IDENTITY.name]])
    expect([...state.preferences]).toEqual([IDENTITY.userId])
    return expect(mocks.hashPassword).toHaveBeenCalledWith(IDENTITY.password)
  }
  )

  it("repairs a changed existing identity and credential without overwriting its profile choice", async function() {
    const adminIdentity: DevelopmentSeedIdentity = { ...IDENTITY, role: "admin" }
    const seed = createSeedAdapter({
      id: IDENTITY.userId,
      name: "Old Name",
      email: "old@domain.test",
      emailVerified: false,
      image: null,
      role: "member",
      status: "suspended",
    }, [seedCredential(adminIdentity, "old-password-hash")])
    const { database, state } = createResourceDatabase({
      [IDENTITY.userId]: "Member-chosen display name",
    })
    mocks.context = { internalAdapter: seed.adapter }
    mocks.verifyPassword.mockResolvedValue(false)
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "development", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [adminIdentity],
    )

    await applyIdentity(adminIdentity, true, database as never)

    expect(seed.user()).toEqual(exactExistingSeedUser(adminIdentity))
    expect(seed.accounts()).toEqual([
      seedCredential(adminIdentity, `hashed::${adminIdentity.password}`),
    ])
    expect(state.profiles.get(IDENTITY.userId)).toBe("Member-chosen display name")
    expect([...state.preferences]).toEqual([IDENTITY.userId])
    return expect(mocks.verifyPassword).toHaveBeenCalledWith({
      hash: "old-password-hash",
      password: adminIdentity.password,
    })
  }
  )

  it("leaves an exact existing identity and matching credential unchanged", async function() {
    const seed = createSeedAdapter(exactExistingSeedUser(), [seedCredential()])
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    mocks.verifyPassword.mockResolvedValue(true)
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await applyIdentity(IDENTITY, true, database as never)

    expect(seed.adapter.updateUser).not.toHaveBeenCalled()
    expect(seed.adapter.updateAccount).not.toHaveBeenCalled()
    expect(seed.user()).toEqual(exactExistingSeedUser())
    expect(seed.accounts()).toEqual([seedCredential()])
    return expect([...state.profiles]).toEqual([[IDENTITY.userId, IDENTITY.name]])
  }
  )

  it.each([
    ["unknown user", { userId: "another-user" }],
    ["account id", { accountId: "another-account" }],
    ["name", { name: "Another Name" }],
    ["email", { email: "another@domain.test" }],
    ["image", { image: "https://assets.domain.test/other.png" }],
    ["role", { role: "admin" }],
    ["password", { password: "AnotherPassword!42" }],
  ] as const)("rejects an unprepared identity with a changed %s", async function(_field, override) {
    const seed = createSeedAdapter()
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )
    const unprepared = { ...IDENTITY, ...override } as DevelopmentSeedIdentity

    await expect(applyIdentity(unprepared, false, database as never)).rejects.toThrowError(
      "Seed identity was not prepared",
    )
    expect(mocks.betterAuth).not.toHaveBeenCalled()
    expect(state.profiles.size).toBe(0)
    return expect(state.preferences.size).toBe(0)
  }
  )

  it("rejects duplicate prepared user ids before creating an auth context", async function() {
    await expect(ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY, { ...IDENTITY, accountId: "second-account" }],
    )).rejects.toThrowError("Development seed identities require unique user IDs")
    return expect(mocks.betterAuth).not.toHaveBeenCalled()
  }
  )

  it.each([undefined, "production", "preview"] as const)(
    "rejects the %s environment before hashing credentials",
    async function(environment) {
      await expect(ensureDevelopmentSeedIdentity(
        { environment, secret: "seed-test-secret-at-least-thirty-two-characters" },
        [IDENTITY],
      )).rejects.toThrowError(
        "Development seed identity setup requires an explicit development or test environment",
      )
      return expect(mocks.hashPassword).not.toHaveBeenCalled()
    }
  )

  it("binds a prepared batch to one transaction", async function() {
    const secondIdentity: DevelopmentSeedIdentity = {
      ...IDENTITY,
      userId: "seed-user-2",
      accountId: "seed-account-2",
      email: "developer-2@domain.test",
    }
    const seed = createSeedAdapter()
    const first = createResourceDatabase()
    const second = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY, secondIdentity],
    )

    await applyIdentity(IDENTITY, false, first.database as never)
    await applyIdentity(secondIdentity, false, first.database as never)
    expect(mocks.betterAuth).toHaveBeenCalledOnce()
    expect([...first.state.profiles.keys()]).toEqual([
      IDENTITY.userId,
      secondIdentity.userId,
    ])
    await expect(
      applyIdentity(secondIdentity, false, second.database as never),
    ).rejects.toThrowError("Prepared seed identities require one transaction")
    return expect(second.state.profiles.size).toBe(0)
  }
  )

  it("rejects an unexpected created user identifier before linking credentials", async function() {
    const seed = createSeedAdapter()
    seed.adapter.createUser.mockResolvedValue({ id: "unexpected-user" })
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(applyIdentity(IDENTITY, false, database as never)).rejects.toThrowError(
      "Seed user received an unexpected identifier",
    )
    expect(seed.adapter.linkAccount).not.toHaveBeenCalled()
    return expect(state.profiles.size).toBe(0)
  }
  )

  it("rejects malformed identifiers returned for a created credential", async function() {
    const seed = createSeedAdapter()
    seed.adapter.linkAccount.mockResolvedValue({
      id: "unexpected-account",
      userId: "another-user",
      providerId: "oauth",
      accountId: "external-account",
    })
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(applyIdentity(IDENTITY, false, database as never)).rejects.toThrowError(
      "Seed credential received an unexpected identifier",
    )
    return expect(state.profiles.size).toBe(0)
  }
  )

  it("reports an existing user that disappeared from the adapter", async function() {
    const seed = createSeedAdapter()
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(applyIdentity(IDENTITY, true, database as never)).rejects.toThrowError(
      "Seed user is unavailable",
    )
    return expect(state.profiles.size).toBe(0)
  }
  )

  it("reports a missing or passwordless credential without creating resources", async function() {
    const results1=[];for (const accounts of [[], [{ ...seedCredential(), password: undefined }]]) {
      const seed = createSeedAdapter(exactExistingSeedUser(), accounts as SeedAccount[])
      const { database, state } = createResourceDatabase()
      mocks.context = { internalAdapter: seed.adapter }
      const applyIdentity = await ensureDevelopmentSeedIdentity(
        { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
        [IDENTITY],
      )

      await expect(applyIdentity(IDENTITY, true, database as never)).rejects.toThrowError(
        "Seed credential is unavailable",
      )
      results1.push(expect(state.profiles.size).toBe(0))
    };return results1;
  }
  )

  it("redacts a malformed credential hash failure", async function() {
    const seed = createSeedAdapter(exactExistingSeedUser(), [
      seedCredential(IDENTITY, "malformed-secret-hash"),
    ])
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    mocks.verifyPassword.mockRejectedValue(new Error("crypto parser leaked details"))
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(
      applyIdentity(IDENTITY, true, database as never),
    ).rejects.toThrowError(/^Seed credential is malformed$/)
    return expect(state.profiles.size).toBe(0)
  }
  )

  return it("propagates an adapter failure without claiming resources were provisioned", async function() {
    const failure = new Error("seed database unavailable")
    const seed = createSeedAdapter()
    seed.adapter.createUser.mockRejectedValue(failure)
    const { database, state } = createResourceDatabase()
    mocks.context = { internalAdapter: seed.adapter }
    const applyIdentity = await ensureDevelopmentSeedIdentity(
      { environment: "test", secret: "seed-test-secret-at-least-thirty-two-characters" },
      [IDENTITY],
    )

    await expect(applyIdentity(IDENTITY, false, database as never)).rejects.toBe(failure)
    expect(seed.adapter.linkAccount).not.toHaveBeenCalled()
    expect(state.profiles.size).toBe(0)
    return expect(state.preferences.size).toBe(0)
  }
  )
}
)
