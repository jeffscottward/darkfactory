import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

const resendMocks = vi.hoisted(() => ({
  send: vi.fn(),
}))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: resendMocks.send }
  }
}))

import type { ContactEmailInput } from "../index.ts"
import {
  createPreviewContactEmailPort,
  createResendContactEmailPort,
  renderContactEmail,
  selectContactEmailPort,
  type ContactResendClient,
} from "./contact.ts"

const temporaryDirectories: string[] = []

const createTemporaryDirectory = async (): Promise<string> => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), "darkfactory-contact-email-")))
  temporaryDirectories.push(directory)
  return directory
}

afterEach(async function() {
  resendMocks.send.mockReset()
  vi.doUnmock("node:fs/promises")
  vi.resetModules()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  return await Promise.all(
    temporaryDirectories.splice(0).map((directory) => {
      return rm(directory, { force: true, recursive: true })
    }
    )
  )
})

const contactInput: ContactEmailInput = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  subject: "Architecture review",
  message: "Please review the deployment boundary.",
}

describe("renderContactEmail", function() {
  it("renders escaped semantic HTML and plain text with a static header-safe subject", async function() {
    const rendered = await renderContactEmail({
      ...contactInput,
      name: "<script>alert('name')</script>",
      subject: "Question\r\nBcc: attacker@example.test",
      message: "<img src=x onerror=alert('message')>",
    })

    expect(rendered.subject).toBe("New DarkFactory contact request")
    expect(rendered.subject).not.toMatch(/[\r\n]/)
    expect(rendered.html).not.toContain("<script>alert('name')</script>")
    expect(rendered.html).not.toContain("<img src=x onerror=alert('message')>")
    expect(rendered.html).toContain("&lt;script&gt;")
    expect(rendered.text).toContain("Question")
    return expect(rendered.text).toContain("Bcc: attacker@example.test")
  })

  return it.each([
    { label: "empty name", value: { ...contactInput, name: "" } },
    { label: "oversized name", value: { ...contactInput, name: "n".repeat(101) } },
    { label: "invalid email", value: { ...contactInput, email: "not-an-email" } },
    { label: "oversized email", value: { ...contactInput, email: `${"a".repeat(245)}@test.test` } },
    { label: "empty subject", value: { ...contactInput, subject: "" } },
    { label: "oversized subject", value: { ...contactInput, subject: "s".repeat(201) } },
    { label: "empty message", value: { ...contactInput, message: "" } },
    { label: "oversized message", value: { ...contactInput, message: "m".repeat(5001) } },
  ])("rejects $label", async function({ value }) {
    return await expect(renderContactEmail(value)).rejects.toThrow()
  }
  )
})

describe("selectContactEmailPort", function() {
  it("stays disabled and constructs no Resend client when the contact recipient is absent", async function() {
    const clientFactory = vi.fn()
    const email = selectContactEmailPort({
      environment: "production",
      transport: "resend",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      resendClientFactory: clientFactory,
    })

    expect(await email.sendContact(contactInput)).toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_DELIVERY_DISABLED",
      retryable: false,
    })
    return expect(clientFactory).not.toHaveBeenCalled()
  })

  it("returns the disabled delivery result for an explicitly disabled transport without calling Resend", async function() {
    const clientFactory = vi.fn()
    const email = selectContactEmailPort({
      environment: "production",
      transport: "disabled",
      recipient: "support@example.test",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      resendClientFactory: clientFactory,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_DELIVERY_DISABLED",
      retryable: false,
    })
    return expect(clientFactory).not.toHaveBeenCalled()
  })

  it("writes a real inspectable preview without exposing contact data in its path", async function() {
    const directory = await createTemporaryDirectory()
    const canonicalDirectory = await realpath(directory)
    const clientFactory = vi.fn()
    const email = selectContactEmailPort({
      environment: "test",
      transport: "preview",
      recipient: "support@example.test",
      previewDirectory: directory,
      resendClientFactory: clientFactory,
    })

    const result = await email.sendContact(contactInput)

    expect(result.status).toBe("previewed")
    if (result.status !== "previewed") throw new Error("Expected preview")
    expect(result.artifactPath).toMatch(new RegExp(`^${canonicalDirectory}/contact-[a-f0-9-]+\\.html$`))
    expect(basename(result.artifactPath)).not.toContain(contactInput.email)
    const html = await readFile(result.artifactPath, "utf8")
    const text = await readFile(result.artifactPath.replace(/\.html$/, ".txt"), "utf8")
    expect(html).toContain("Ada Lovelace")
    expect(text).toContain("Please review the deployment boundary.")
    return expect(clientFactory).not.toHaveBeenCalled()
  })

  it("sends through Resend only when contact delivery is fully configured", async function() {
    const send = vi.fn().mockResolvedValue({ data: { id: "contact_123" }, error: null })
    const client: ContactResendClient = { emails: { send } }
    const clientFactory = vi.fn(() => client)
    const email = selectContactEmailPort({
      environment: "production",
      transport: "resend",
      recipient: "support@example.test",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      resendClientFactory: clientFactory,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "sent",
      provider: "resend",
      messageId: "contact_123",
    })
    expect(clientFactory).toHaveBeenCalledOnce()
    return expect(send).toHaveBeenCalledWith(expect.objectContaining({
      from: "DarkFactory <noreply@example.test>",
      to: ["support@example.test"],
      replyTo: "ada@example.test",
      subject: "New DarkFactory contact request",
    }))
  })

  it("reports configured provider failure without claiming success or leaking the provider error", async function() {
    const send = vi.fn().mockResolvedValue({
      data: null,
      error: { name: "internal_server_error", message: "provider secret detail" },
    })
    const email = selectContactEmailPort({
      environment: "production",
      transport: "resend",
      recipient: "support@example.test",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      resendClientFactory: () => ({ emails: { send } }),
    })

    return await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "resend",
      code: "CONTACT_PROVIDER_UNAVAILABLE",
      retryable: true,
    })
  })

  it("rejects a configured malformed recipient before selecting a transport", async function() {
    const clientFactory = vi.fn()
    const email = selectContactEmailPort({
      environment: "production",
      transport: "resend",
      recipient: "not-an-email",
      resendApiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      resendClientFactory: clientFactory,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_RECIPIENT_INVALID",
      retryable: false,
    })
    return expect(clientFactory).not.toHaveBeenCalled()
  })

  it("keeps explicit preview disabled outside local environments", async function() {
    const email = selectContactEmailPort({
      environment: "production",
      transport: "preview",
      recipient: "support@example.test",
    })

    return await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_DELIVERY_DISABLED",
      retryable: false,
    })
  })

  it("disables filesystem contact previews in a production bundle", async function() {
    vi.stubEnv("NODE_ENV", "production")
    const email = selectContactEmailPort({
      environment: "development",
      transport: "preview",
      recipient: "support@example.test",
      previewDirectory: await createTemporaryDirectory(),
    })

    return await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_DELIVERY_DISABLED",
      retryable: false,
    })
  })

  it("selects the implicit development preview without touching the default directory on render failure", async function() {
    const email = selectContactEmailPort({
      environment: "development",
      recipient: "support@example.test",
    })

    return await expect(email.sendContact({
      ...contactInput,
      message: "",
    })).resolves.toEqual({
      status: "not-delivered",
      provider: "preview",
      code: "CONTACT_RENDER_FAILED",
      retryable: false,
    })
  })

  it("requires a binding before selecting remote preview capture", function() {
    vi.stubEnv("NODE_ENV", "production")
    return expect(() => selectContactEmailPort({
      environment: "test",
      transport: "preview",
      recipient: "support@example.test",
      previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
    })).toThrowError("Remote preview transport requires a binding")
  })

  return it("selects remote preview capture with an exact test binding", async function() {
    vi.stubEnv("NODE_ENV", "production")
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 201 }),
    )
    const binding = {
      runId: "contact_select_remote",
      hmacKey: Buffer.alloc(32, 9).toString("base64url"),
    }
    const email = selectContactEmailPort({
      environment: "test",
      recipient: "support@example.test",
      previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
      previewBinding: binding,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "previewed",
      provider: "preview",
      artifactPath: "e2e-preview-capture",
    })
    expect(fetcher).toHaveBeenCalledOnce()
    return expect(fetcher.mock.calls[0]?.[1]?.headers).toEqual({
      authorization: `Bearer ${binding.hmacKey}`,
      "content-type": "application/json",
    })
  })
})

describe("createResendContactEmailPort", function() {
  it.each([
    ["missing", undefined as never],
    ["blank", "  "],
    ["oversized", `${"a".repeat(245)}@example.test`],
    ["malformed", "invalid"],
  ])("fails closed for a $0 recipient without constructing a client", async function(
    _case,
    recipient,
  ) {
    const clientFactory = vi.fn()
    const email = createResendContactEmailPort({
      recipient,
      apiKey: "re_test_key",
      from: "DarkFactory <noreply@example.test>",
      clientFactory,
    })

    await expect(email.sendContact(contactInput)).resolves.toMatchObject({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_RECIPIENT_INVALID",
    })
    return expect(clientFactory).not.toHaveBeenCalled()
  }
  )

  it.each([
    ["missing API key", undefined, "DarkFactory <noreply@example.test>"],
    ["blank sender", "re_test_key", "  "],
    ["header-injected sender", "re_test_key", "noreply@example.test\r\nBcc: attacker@example.test"],
  ])("fails closed for a $0", async function(_case, apiKey, from) {
    const clientFactory = vi.fn()
    const email = createResendContactEmailPort({
      recipient: "support@example.test",
      apiKey,
      from,
      clientFactory,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "disabled",
      code: "CONTACT_PROVIDER_NOT_CONFIGURED",
      retryable: false,
    })
    return expect(clientFactory).not.toHaveBeenCalled()
  }
  )

  it("redacts a client-construction failure", async function() {
    const secret = "provider-construction-secret"
    const email = createResendContactEmailPort({
      recipient: "support@example.test",
      apiKey: "re_test_key",
      from: "noreply@example.test",
      clientFactory: () => {
        throw new Error(secret)
      }
    })

    const result = await email.sendContact(contactInput)
    expect(result).toEqual({
      status: "not-delivered",
      provider: "resend",
      code: "CONTACT_PROVIDER_UNAVAILABLE",
      retryable: true,
    })
    return expect(JSON.stringify(result)).not.toContain(secret)
  })

  it("rejects invalid input and render failures before calling the provider", async function() {
    const send = vi.fn()
    const email = createResendContactEmailPort({
      recipient: "support@example.test",
      apiKey: "re_test_key",
      from: "noreply@example.test",
      clientFactory: () => ({ emails: { send } }),
    })

    for (const invalidEmail of [
      undefined,
      "  ",
      `${"a".repeat(245)}@example.test`,
      "invalid",
    ]) {
      await expect(email.sendContact({
        ...contactInput,
        email: invalidEmail as string,
      })).resolves.toMatchObject({
        code: "CONTACT_INPUT_INVALID",
        retryable: false,
      })
    }
    await expect(email.sendContact({
      ...contactInput,
      subject: "",
    })).resolves.toMatchObject({
      code: "CONTACT_RENDER_FAILED",
      retryable: false,
    })
    return expect(send).not.toHaveBeenCalled()
  })

  it("maps thrown, rejected, and malformed provider responses without leaking details", async function() {
    const providerSecret = "provider-secret-detail"
    const cases = [
      {
        send: vi.fn().mockRejectedValue(new Error(providerSecret)),
        expected: {
          code: "CONTACT_PROVIDER_UNAVAILABLE",
          retryable: true,
        },
      },
      {
        send: vi.fn().mockResolvedValue({
          data: null,
          error: { name: "validation_error", statusCode: 422 },
        }),
        expected: {
          code: "CONTACT_PROVIDER_REJECTED",
          retryable: false,
        },
      },
      {
        send: vi.fn().mockResolvedValue({ data: null, error: {} }),
        expected: {
          code: "CONTACT_PROVIDER_REJECTED",
          retryable: false,
        },
      },
      {
        send: vi.fn().mockResolvedValue({ data: null, error: null }),
        expected: {
          code: "CONTACT_PROVIDER_INVALID_RESPONSE",
          retryable: false,
        },
      },
    ]

    const results=[];for (const { send, expected } of cases) {
      const email = createResendContactEmailPort({
        recipient: "support@example.test",
        apiKey: "re_test_key",
        from: "noreply@example.test",
        clientFactory: () => ({ emails: { send } }),
      })
      const result = await email.sendContact(contactInput)

      expect(result).toMatchObject({
        status: "not-delivered",
        provider: "resend",
        ...expected,
      })
      results.push(expect(JSON.stringify(result)).not.toContain(providerSecret))
    };return results;
  })

  return it("adapts the default Resend SDK response without a network request", async function() {
    resendMocks.send.mockResolvedValue({
      data: { id: "contact_sdk_123" },
      error: null,
    })
    const email = createResendContactEmailPort({
      recipient: "Support@EXAMPLE.TEST",
      apiKey: "re_test_key",
      from: "noreply@example.test",
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "sent",
      provider: "resend",
      messageId: "contact_sdk_123",
    })
    return expect(resendMocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["Support@example.test"] }),
    )
  })
})

describe("createPreviewContactEmailPort", function() {
  it("rejects production use and non-positive or fractional retention limits", function() {
    expect(() => createPreviewContactEmailPort({
      environment: "production",
    })).toThrowError("unavailable in production")

    const results1=[];for (const maxArtifacts of [0, -1, 1.5]) {
      results1.push(expect(() => createPreviewContactEmailPort({
        environment: "test",
        maxArtifacts,
      })).toThrowError("maxArtifacts must be a positive integer"))
    };return results1;
  })

  it("uses the default preview options while returning a redacted render failure", async function() {
    const email = createPreviewContactEmailPort({ environment: "test" })

    return await expect(email.sendContact({
      ...contactInput,
      email: "invalid",
    })).resolves.toEqual({
      status: "not-delivered",
      provider: "preview",
      code: "CONTACT_RENDER_FAILED",
      retryable: false,
    })
  })

  it("fails closed for file and symbolic-link preview directories", async function() {
    const directory = await createTemporaryDirectory()
    const ordinaryFile = join(directory, "ordinary-file")
    const targetDirectory = join(directory, "target")
    const symbolicDirectory = join(directory, "symbolic")
    await writeFile(ordinaryFile, "not a directory", "utf8")
    await mkdir(targetDirectory)
    await symlink(targetDirectory, symbolicDirectory, "dir")

    const results2=[];for (const unsafeDirectory of [ordinaryFile, symbolicDirectory]) {
      const email = createPreviewContactEmailPort({
        environment: "test",
        directory: unsafeDirectory,
      })
      results2.push(await expect(email.sendContact(contactInput)).resolves.toMatchObject({
        status: "not-delivered",
        code: "CONTACT_PREVIEW_WRITE_FAILED",
      }))
    };return results2;
  })

  it("fails closed for a symbolic-link ancestor in the preview path", async function() {
    const directory = await createTemporaryDirectory()
    const targetDirectory = join(directory, "target")
    const symbolicAncestor = join(directory, "symbolic-ancestor")
    await mkdir(targetDirectory)
    await symlink(targetDirectory, symbolicAncestor, "dir")
    const nestedPreviewDirectory = join(symbolicAncestor, "nested")
    const email = createPreviewContactEmailPort({
      environment: "test",
      directory: nestedPreviewDirectory,
    })

    await expect(email.sendContact(contactInput)).resolves.toMatchObject({
      status: "not-delivered",
      code: "CONTACT_PREVIEW_WRITE_FAILED",
    })
    return await expect(readdir(join(targetDirectory, "nested"))).resolves.toEqual([])
  })

  it("orders and removes expired HTML and text pairs at the retention boundary", async function() {
    const directory = await createTemporaryDirectory()
    const stagingEmail = createPreviewContactEmailPort({
      environment: "test",
      directory,
      maxArtifacts: 4,
    })
    const first = await stagingEmail.sendContact(contactInput)
    const second = await stagingEmail.sendContact({
      ...contactInput,
      subject: "Second request",
    })
    const third = await stagingEmail.sendContact({
      ...contactInput,
      subject: "Third request",
    })
    if (
      first.status !== "previewed" ||
      second.status !== "previewed" ||
      third.status !== "previewed"
    ) {
      throw new Error("Expected staged previews")
    }
    const sameModifiedAt = new Date("2025-01-01T00:00:00.000Z")
    await Promise.all([
      utimes(first.artifactPath, sameModifiedAt, sameModifiedAt),
      utimes(second.artifactPath, sameModifiedAt, sameModifiedAt),
    ])

    const trimmingEmail = createPreviewContactEmailPort({
      environment: "test",
      directory,
      maxArtifacts: 1,
    })
    const current = await trimmingEmail.sendContact({
      ...contactInput,
      subject: "Current request",
    })
    if (current.status !== "previewed") throw new Error("Expected current preview")

    for (const expired of [first, second, third]) {
      await expect(readFile(expired.artifactPath, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      })
      await expect(
        readFile(expired.artifactPath.replace(/\.html$/, ".txt"), "utf8"),
      ).rejects.toMatchObject({ code: "ENOENT" })
    }
    return await expect(readFile(current.artifactPath, "utf8")).resolves.toContain(
      "Current request",
    )
  })

  it("cleans a newly written pair when retention cleanup fails", async function() {
    const directory = await createTemporaryDirectory()
    await mkdir(join(directory, "stuck.html"))
    await writeFile(join(directory, "stuck.html", "keep"), "keep", "utf8")
    const email = createPreviewContactEmailPort({
      environment: "test",
      directory,
      maxArtifacts: 1,
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "preview",
      code: "CONTACT_PREVIEW_WRITE_FAILED",
      retryable: false,
    })
    return expect(await readdir(directory)).toEqual(["stuck.html"])
  })

  it("closes an opened handle and removes partial paths after a write failure", async function() {
    vi.doUnmock("node:fs/promises")
    vi.resetModules()
    const close = vi.fn().mockRejectedValue(new Error("close failure"))
    const htmlHandle = {
      close,
      writeFile: vi.fn(),
    }
    const open = vi.fn()
      .mockResolvedValueOnce(htmlHandle)
      .mockRejectedValueOnce(new Error("text open failure"))
    const remove = vi.fn().mockResolvedValue(undefined)
    vi.doMock("node:fs/promises", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs/promises")>()),
      mkdir: vi.fn(),
      lstat: vi.fn().mockResolvedValue({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      }),
      realpath: vi.fn().mockResolvedValue("/requested/preview"),
      chmod: vi.fn(),
      open,
      rm: remove,
    }))
    const { createPreviewContactEmailPort: createIsolatedPreview } =
      await import("./contact-preview.ts")
    const email = createIsolatedPreview({
      environment: "test",
      directory: "/requested/preview",
    })

    await expect(email.sendContact(contactInput)).resolves.toEqual({
      status: "not-delivered",
      provider: "preview",
      code: "CONTACT_PREVIEW_WRITE_FAILED",
      retryable: false,
    })
    expect(open).toHaveBeenCalledTimes(2)
    expect(close).toHaveBeenCalledOnce()
    expect(htmlHandle.writeFile).not.toHaveBeenCalled()
    return expect(remove).toHaveBeenCalledTimes(2)
  })

  it("rejects unsafe identities before and after canonicalization", async function() {
    const scenarios = [
      [
        {
          isSymbolicLink: () => true,
          isDirectory: () => true,
        },
      ],
      [
        {
          isSymbolicLink: () => false,
          isDirectory: () => false,
        },
      ],
      [
        {
          isSymbolicLink: () => false,
          isDirectory: () => true,
        },
        {
          isSymbolicLink: () => false,
          isDirectory: () => false,
        },
      ],
    ]

    const results3=[];for (const identities of scenarios) {
      vi.doUnmock("node:fs/promises")
      vi.resetModules()
      const lstat = vi.fn()
      for (const identity of identities) {
        lstat.mockResolvedValueOnce(identity)
      }
      vi.doMock("node:fs/promises", async (importOriginal) => ({
        ...(await importOriginal<typeof import("node:fs/promises")>()),
        mkdir: vi.fn(),
        lstat,
        realpath: vi.fn().mockResolvedValue("/requested/preview"),
      }))
      const { createPreviewContactEmailPort: createIsolatedPreview } =
        await import("./contact-preview.ts")
      const email = createIsolatedPreview({
        environment: "test",
        directory: "/requested/preview",
      })

      await expect(email.sendContact(contactInput)).resolves.toMatchObject({
        status: "not-delivered",
        code: "CONTACT_PREVIEW_WRITE_FAILED",
      })
      results3.push(expect(lstat).toHaveBeenCalledTimes(identities.length))
    };return results3;
  })

  return it("detects a symbolic-link ancestor introduced after canonicalization", async function() {
    vi.doUnmock("node:fs/promises")
    vi.resetModules()
    const lstat = vi.fn()
      .mockResolvedValueOnce({
        isSymbolicLink: () => false,
        isDirectory: () => true,
      })
      .mockResolvedValueOnce({
        isSymbolicLink: () => true,
        isDirectory: () => true,
      })
    vi.doMock("node:fs/promises", async (importOriginal) => ({
      ...(await importOriginal<typeof import("node:fs/promises")>()),
      mkdir: vi.fn(),
      lstat,
      realpath: vi.fn().mockResolvedValue("/requested/preview"),
    }))
    const { createPreviewContactEmailPort: createIsolatedPreview } =
      await import("./contact-preview.ts")
    const email = createIsolatedPreview({
      environment: "test",
      directory: "/requested/preview",
    })

    await expect(email.sendContact(contactInput)).resolves.toMatchObject({
      status: "not-delivered",
      code: "CONTACT_PREVIEW_WRITE_FAILED",
    })
    return expect(lstat).toHaveBeenCalledTimes(2)
  })
})
