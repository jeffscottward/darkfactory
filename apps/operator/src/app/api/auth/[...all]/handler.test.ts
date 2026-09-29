import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  auth: { runtime: "operator-auth" },
  close: vi.fn(async () => undefined),
  createAuthHandler: vi.fn(),
  createOperatorAuthRuntime: vi.fn(),
  delegate: vi.fn(async () => new Response("ok")),
}))

vi.mock("@darkfactory/auth/server", () => ({
  createAuthHandler: mocks.createAuthHandler,
}))
vi.mock("../../../../server/operator-auth.ts", () => ({
  createOperatorAuthRuntime: mocks.createOperatorAuthRuntime,
}))

import { handleOperatorAuthRequest } from "./handler.ts"

describe("operator auth composition", function() {
  beforeEach(function() {
    mocks.close.mockClear()
    mocks.delegate.mockReset().mockResolvedValue(new Response("ok"))
    mocks.createAuthHandler.mockReset().mockReturnValue(mocks.delegate)
    return mocks.createOperatorAuthRuntime.mockReset().mockResolvedValue({
      auth: mocks.auth,
      close: mocks.close,
    })
  })

  it("delegates to Better Auth and closes the request database", async function() {
    const request = new Request("https://operator.darkfactory.localhost/api/auth/get-session")
    const response = await handleOperatorAuthRequest(request)
    expect(response.status).toBe(200)
    expect(mocks.createAuthHandler).toHaveBeenCalledWith(mocks.auth)
    expect(mocks.delegate).toHaveBeenCalledWith(request)
    return expect(mocks.close).toHaveBeenCalledOnce()
  })

  return it("closes the request database when Better Auth fails", async function() {
    mocks.delegate.mockRejectedValueOnce(new Error("handler failed"))
    await expect(handleOperatorAuthRequest(
      new Request("https://operator.darkfactory.localhost/api/auth/get-session"),
    )).rejects.toThrow("handler failed")
    return expect(mocks.close).toHaveBeenCalledOnce()
  })
})
