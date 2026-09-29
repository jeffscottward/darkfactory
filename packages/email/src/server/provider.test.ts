import { mkdtemp, realpath, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, describe, expect, it, vi } from "vitest"

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send }
  }
}))

import type { PasswordResetEmailInput } from "../index.ts"
import {
  createResendEmailPort,
  selectEmailPort,
  type ResendClient,
} from "./provider.ts"

const resetInput: PasswordResetEmailInput = {
  to: "member@domain.test",
  recipientName: "Alice Adams",
  resetUrl:
    "https://darkfactory.localhost/api/auth/reset-password/provider-raw-token" +
    "?callbackURL=https%3A%2F%2Fdarkfactory.localhost%2Freset-password",
  expiresInMinutes: 60,
}

const verificationInput = {
  to: "member@domain.test",
  recipientName: "Alice Adams",
  verificationUrl:
    "https://darkfactory.localhost/api/auth/verify-email" +
    "?token=header.payload.signature" +
    "&callbackURL=%2Fverify-email%3Fverified%3D1",
  expiresInMinutes: 60,
}

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await realpath(
    await mkdtemp(join(tmpdir(), "darkfactory-provider-")),
  )
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async function() {
  resendMocks.send.mockReset()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  return await Promise.all(
    temporaryDirectories.splice(0).map((directory) => {
      return rm(directory, { recursive: true, force: true })
    }
    )
  )
})

describe("selectEmailPort", function() {
  it("selects preview locally even when Resend credentials happen to exist", async function() {
    const directory = await createTemporaryDirectory()
    const send = vi.fn()
    const email = selectEmailPort({
      environment: "development",
      previewDirectory: directory,
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      resendClient: { emails: { send } },
    })

    const result = await email.sendPasswordReset(resetInput)

    expect(result.status).toBe("previewed")
    return expect(send).not.toHaveBeenCalled()
  })

  it("selects Resend only when explicitly requested and fully configured", async function() {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email_123" },
      error: null,
    })
    const email = selectEmailPort({
      environment: "production",
      transport: "resend",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      resendClient: { emails: { send } },
    })

    const result = await email.sendPasswordReset(resetInput)

    expect(result).toEqual({
      status: "sent",
      provider: "resend",
      messageId: "email_123",
    })
    expect(send).toHaveBeenCalledOnce()
    return expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "DarkFactory <noreply@domain.test>",
        to: ["member@domain.test"],
        subject: "Reset your DarkFactory password",
      }),
    )
  })

  it("returns a disabled failure instead of silently previewing explicit Resend without a key", async function() {
    const email = selectEmailPort({
      environment: "production",
      transport: "resend",
      from: "DarkFactory <noreply@domain.test>",
    })

    const result = await email.sendPasswordReset(resetInput)

    return expect(result).toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      retryable: false,
    })
  })


  it("returns the disabled delivery result for an explicitly disabled transport without calling Resend", async function() {
    const send = vi.fn()
    const email = selectEmailPort({
      environment: "production",
      transport: "disabled",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      resendClient: { emails: { send } },
    })

    await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_DELIVERY_DISABLED",
      retryable: false,
    })
    return expect(send).not.toHaveBeenCalled()
  })

  it("does not enable a production transport by default", async function() {
    const email = selectEmailPort({ environment: "production" })

    return expect(await email.sendPasswordReset(resetInput)).toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_DELIVERY_DISABLED",
      retryable: false,
    })
  })

  it("disables filesystem preview delivery in a production bundle", async function() {
    vi.stubEnv("NODE_ENV", "production")
    const email = selectEmailPort({
      environment: "development",
      transport: "preview",
      previewDirectory: await createTemporaryDirectory(),
    })

    return await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_DELIVERY_DISABLED",
      retryable: false,
    })
  })

  return it("requires a binding for remote capture and otherwise selects the exact test endpoint", async function() {
    vi.stubEnv("NODE_ENV", "production")
    expect(() => selectEmailPort({
      environment: "test",
      transport: "preview",
      previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
    })).toThrowError("Remote preview transport requires a binding")

    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    )
    const binding = {
      runId: "provider_remote_preview",
      hmacKey: Buffer.alloc(32, 3).toString("base64url"),
    }
    const email = selectEmailPort({
      environment: "test",
      transport: "preview",
      previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
      previewBinding: binding,
    })

    await expect(email.sendEmailVerification(verificationInput)).resolves.toEqual({
      status: "previewed",
      provider: "preview",
      artifactPath: "e2e-preview-capture",
    })
    expect(fetcher).toHaveBeenCalledOnce()
    return expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toMatchObject({
      operation: "verify-email",
      input: verificationInput,
    })
  })
})

describe("createResendEmailPort", function() {
  it("does not call Resend when the adapter is disabled", async function() {
    const send = vi.fn()
    const email = createResendEmailPort({
      enabled: false,
      apiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      client: { emails: { send } },
    })

    const result = await email.sendPasswordReset(resetInput)

    expect(result.status).toBe("failed")
    expect(result).toMatchObject({
      provider: "disabled",
      code: "EMAIL_DELIVERY_DISABLED",
    })
    expect(send).not.toHaveBeenCalled()

    return await expect(email.sendEmailVerification(verificationInput)).resolves.toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_DELIVERY_DISABLED",
      retryable: false,
    })
  })

  it("rejects recipient injection without calling the provider", async function() {
    const send = vi.fn()
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      client: { emails: { send } },
    })

    const result = await email.sendPasswordReset({
      ...resetInput,
      to: "victim@domain.test\\r\\nBcc: attacker@domain.test",
    })

    expect(result).toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_RECIPIENT_INVALID",
      retryable: false,
    })
    return expect(send).not.toHaveBeenCalled()
  })

  it("preserves the mailbox local-part while normalizing the domain", async function() {
    const send = vi.fn().mockResolvedValue({
      data: { id: "email_case" },
      error: null,
    })
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      client: { emails: { send } },
    })

    await email.sendPasswordReset({
      ...resetInput,
      to: "  Case.Sensitive@DOMAIN.TEST  ",
    })

    return expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["Case.Sensitive@domain.test"] }),
    )
  })

  it("maps provider rejection to failure instead of fake success", async function() {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "Rejected" },
    })
    const client: ResendClient = { emails: { send } }
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "DarkFactory <noreply@domain.test>",
      client,
    })

    const result = await email.sendPasswordReset(resetInput)

    expect(result).toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_PROVIDER_REJECTED",
      retryable: false,
    })
    return expect(result.status).not.toBe("sent")
  })

  it("marks Resend throttling and server failures retryable without exposing details", async function() {
    const results=[];for (const error of [
      { name: "rate_limit_exceeded", statusCode: 429 },
      { name: "application_error", statusCode: 500 },
      { name: "internal_server_error" },
    ]) {
      const send = vi.fn().mockResolvedValue({ data: null, error })
      const email = createResendEmailPort({
        enabled: true,
        apiKey: "re_test_key",
        from: "DarkFactory <noreply@domain.test>",
        client: { emails: { send } },
      })

      const result = await email.sendPasswordReset(resetInput)

      expect(result).toEqual({
        status: "failed",
        provider: "resend",
        code: "EMAIL_PROVIDER_UNAVAILABLE",
        retryable: true,
      })
      results.push(expect(JSON.stringify(result)).not.toContain(error.name))
    };return results;
  })

  it("does not retry daily or monthly quota exhaustion", async function() {
    const results1=[];for (const name of [
      "daily_quota_exceeded",
      "monthly_quota_exceeded",
    ]) {
      const send = vi.fn().mockResolvedValue({
        data: null,
        error: { name, statusCode: 429 },
      })
      const email = createResendEmailPort({
        enabled: true,
        apiKey: "re_test_key",
        from: "DarkFactory <noreply@domain.test>",
        client: { emails: { send } },
      })

      const result = await email.sendPasswordReset(resetInput)

      expect(result).toEqual({
        status: "failed",
        provider: "resend",
        code: "EMAIL_PROVIDER_REJECTED",
        retryable: false,
      })
      results1.push(expect(JSON.stringify(result)).not.toContain(name))
    };return results1;
  })

  it("returns a redacted typed failure and never logs provider secrets or message content", async function() {
    const apiKey = "re_secret-do-not-log"
    const rawToken = "provider-raw-token"
    const send = vi.fn().mockRejectedValue(
      new Error(`Request with ${apiKey} and ${rawToken} failed`),
    )
    const consoleLog = vi.spyOn(console, "log").mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined)
    const email = createResendEmailPort({
      enabled: true,
      apiKey,
      from: "DarkFactory <noreply@domain.test>",
      client: { emails: { send } },
    })

    const result = await email.sendPasswordReset(resetInput)
    const serialized = JSON.stringify(result)

    expect(result).toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_PROVIDER_UNAVAILABLE",
      retryable: true,
    })
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain(rawToken)
    expect(consoleLog).not.toHaveBeenCalled()
    expect(consoleWarn).not.toHaveBeenCalled()
    return expect(consoleError).not.toHaveBeenCalled()
  })

  it("requires both provider credentials without constructing the SDK", async function() {
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "  ",
    })

    await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "failed",
      provider: "disabled",
      code: "EMAIL_PROVIDER_NOT_CONFIGURED",
      retryable: false,
    })
    return expect(resendMocks.send).not.toHaveBeenCalled()
  })

  it("maps renderer and invalid provider responses to operation-safe failures", async function() {
    const send = vi.fn().mockResolvedValue({ data: null, error: null })
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "noreply@domain.test",
      client: { emails: { send } },
    })

    await expect(email.sendPasswordReset({
      ...resetInput,
      resetUrl: "https://attacker.test/reset",
    })).resolves.toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_RENDER_FAILED",
      retryable: false,
    })
    expect(send).not.toHaveBeenCalled()

    await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_PROVIDER_INVALID_RESPONSE",
      retryable: false,
    })
    return expect(send).toHaveBeenCalledOnce()
  })

  it("treats a provider error without a name as a non-retryable rejection", async function() {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { statusCode: 422 },
    })
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "noreply@domain.test",
      client: { emails: { send } },
    })

    return await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "failed",
      provider: "resend",
      code: "EMAIL_PROVIDER_REJECTED",
      retryable: false,
    })
  })

  it("delivers verification mail through the operation-specific callback", async function() {
    const send = vi.fn().mockResolvedValue({
      data: { id: "verification_123" },
      error: null,
    })
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "noreply@domain.test",
      client: { emails: { send } },
    })

    await expect(email.sendEmailVerification(verificationInput)).resolves.toEqual({
      status: "sent",
      provider: "resend",
      messageId: "verification_123",
    })
    return expect(send).toHaveBeenCalledWith(expect.objectContaining({
      subject: "Verify your DarkFactory email",
      to: ["member@domain.test"],
    }))
  })

  return it("adapts the default Resend SDK response without reaching the network", async function() {
    resendMocks.send.mockResolvedValue({
      data: { id: "sdk_reset_123" },
      error: null,
    })
    const email = createResendEmailPort({
      enabled: true,
      apiKey: "re_test_key",
      from: "noreply@domain.test",
    })

    await expect(email.sendPasswordReset(resetInput)).resolves.toEqual({
      status: "sent",
      provider: "resend",
      messageId: "sdk_reset_123",
    })
    return expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["member@domain.test"] }),
    )
  })
})
