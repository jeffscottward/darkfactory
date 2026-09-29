import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(function() {
  let submitCount = 0
  let edgeMode: "allow" | "deny" | "fail" = "allow"
  const edgeConsume = vi.fn(async () => {
    if (edgeMode === "fail") throw new Error("private database failure")
    return edgeMode === "allow"
      ? { allowed: true, remaining: 29, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: 600 }
  }
  )
  const submitConsume = vi.fn(async () => {
    submitCount += 1
    return submitCount <= 5
      ? { allowed: true, remaining: 5 - submitCount, retryAfterSeconds: 0 }
      : { allowed: false, remaining: 0, retryAfterSeconds: 600 }
  }
  )
  const close = vi.fn(async () => undefined)
  return {
    close,
    edgeConsume,
    submitConsume,
    setEdgeMode: (mode: "allow" | "deny" | "fail") => void (edgeMode = mode),
    resetCounts: () => void (submitCount = 0),
    waitUntil: vi.fn((promise: Promise<unknown>) => void promise.catch(() => undefined)),
  }
}
)

vi.mock("cloudflare:workers", function() { return ({ waitUntil: mocks.waitUntil }) })
vi.mock("@darkfactory/analytics/server/posthog", function() { return ({
  createPostHogAnalyticsPort: () => ({ capture: vi.fn() }),
}) })
vi.mock("@darkfactory/auth/server", function() { return ({
  createAuth: () => ({ auth: true }),
  requireSession: vi.fn(),
  requireRole: vi.fn(),
}) })
vi.mock("@darkfactory/config/database", function() { return ({
  composeDatabaseProfile: () => ({
    connection: { connectionString: "postgres://configured.invalid/db" },
  }),
}) })
vi.mock("@darkfactory/config/server", function() { return ({
  parseServerEnv: () => ({
    APP_ENV: "test",
    APP_URL: "https://darkfactory.localhost",
    EMAIL_TRANSPORT: "preview",
    EMAIL_FROM: "DarkFactory <noreply@domain.test>",
    RESEND_API_KEY: undefined,
    CONTACT_EMAIL_TO: "support@domain.test",
    BETTER_AUTH_SECRET: "configured-secret".repeat(2),
    CONTACT_THROTTLE_SECRET: "contact-throttle-secret".repeat(2),
    BETTER_AUTH_URL: "https://darkfactory.localhost",
    OTEL_ENABLED: false,
    OTEL_SERVICE_NAME: "darkfactory-web",
    OTEL_EXPORTER_OTLP_ENDPOINT: undefined,
    POSTHOG_KEY: undefined,
    POSTHOG_HOST: undefined,
  }),
  getProviderCapabilities: () => ({
    ai: false,
    emailDelivery: false,
    analytics: false,
    telemetryExport: false,
    storage: false,
    errorTracking: false,
  }),
}) })
vi.mock("@darkfactory/db/server", function() { return ({
  REQUEST_DATABASE_POOL_MAX_CONNECTIONS: 8,
  RequestDatabaseCapacityError: class RequestDatabaseCapacityError extends Error {
  },
  createRequestDatabase: vi.fn(async () => ({ db: { request: true }, close: mocks.close })),
  createRepositories: () => ({}),
  createContactThrottleRepository: (_database: unknown, options?: { maxRequests?: number }) => ({
    consume: options?.maxRequests === 30 ? mocks.edgeConsume : mocks.submitConsume,
  }),
}) })
vi.mock("@darkfactory/email/server", function() { return ({
  selectEmailPort: () => ({}),
  selectContactEmailPort: () => ({
    sendContact: vi.fn(async () => ({
      status: "sent",
      provider: "resend",
      messageId: "contact-message",
    })),
  }),
}) })
vi.mock("@darkfactory/observability/server/evlog", function() { return ({
  initializeEvlog: () => ({ runtime: "evlog" }),
  createEvlogSink: () => ({ emit: vi.fn() }),
}) })
vi.mock("@darkfactory/observability/server/fanout", function() { return ({
  createSemanticEventFanout: () => ({ emit: vi.fn(async () => ({
    structuredEvent: "emitted",
    span: "skipped",
    analytics: "skipped",
  })) }),
}) })
vi.mock("@darkfactory/observability/server/otel", function() { return ({
  initializeTelemetry: () => ({
    state: { status: "in-memory" },
    withSpan: async (_input: unknown, run: (span: undefined) => Promise<Response>) => run(undefined),
    forceFlush: vi.fn(async () => undefined),
    dispose: vi.fn(async () => undefined),
  }),
}) })

import { createApiClient } from "@darkfactory/api"
import { POST } from "./route.ts"

const input = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  subject: "Architecture review",
  message: "Please review the deployment boundary.",
} as const

const client = createApiClient({
  baseUrl: "https://darkfactory.localhost",
  fetch: (request) => {
    const headers = new Headers(request.headers)
    headers.set("origin", "https://darkfactory.localhost")
    headers.set("cf-connecting-ip", "203.0.113.42")
    return POST(new Request(request, { headers }))
  }
})

const expectCode = async (promise: Promise<unknown>, code: string, status: number) => {
  try {
    await promise
    throw new Error("Expected typed contact failure")
  }
  catch (error) {
    return expect(error).toMatchObject({ code, status, defined: true })
  }
}

describe("DF-076 full exported contact route", function() {
  beforeEach(function() {
    mocks.resetCounts()
    mocks.setEdgeMode("allow")
    mocks.edgeConsume.mockClear()
    mocks.submitConsume.mockClear()
    return mocks.close.mockClear()
  })

  it("lets the normal sixth valid request reach the typed submit throttle", async function() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(client.contact.submit(input)).resolves.toEqual({ status: "sent" })
    }
    await expectCode(client.contact.submit(input), "TOO_MANY_REQUESTS", 429)
    expect(mocks.edgeConsume).toHaveBeenCalledTimes(6)
    return expect(mocks.submitConsume).toHaveBeenCalledTimes(6)
  })

  return it("decodes pre-parse payload, edge limit, and storage failures as typed errors", async function() {
    await expectCode(
      client.contact.submit({ ...input, message: "x".repeat(70_000) }),
      "PAYLOAD_TOO_LARGE",
      413,
    )
    mocks.setEdgeMode("deny")
    await expectCode(client.contact.submit(input), "TOO_MANY_REQUESTS", 429)
    mocks.setEdgeMode("fail")
    await expectCode(client.contact.submit(input), "SERVICE_UNAVAILABLE", 503)
    return expect(mocks.close).toHaveBeenCalledTimes(3)
  })
})
