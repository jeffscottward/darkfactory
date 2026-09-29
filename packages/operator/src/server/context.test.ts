import type { SafeAuthSession } from "@darkfactory/auth/types"
import { describe, expect, it, vi } from "vitest"

import {
  createOperatorContext,
  resolveOperatorRequestId,
} from "./context.ts"

const request = (): Request => new Request(
  "https://operator.darkfactory.localhost/api/orpc",
  { headers: { "x-request-id": "untrusted-request-id" } },
)

describe("operator context", function() {
  it("uses only the injected request authority and forwards request headers", async function() {
    const requireSession = vi.fn(async (_headers: Headers) => (
      { principal: { userId: "owner-1", role: "member", status: "active" } }
    ) as SafeAuthSession)
    const generateRequestId = vi.fn(() => "generated-request-id")
    const input = request()
    const context = createOperatorContext(input, {
      requireSession,
      generateRequestId,
    })

    expect(context).toEqual({
      requestId: "generated-request-id",
      requireSession: expect.any(Function),
    })
    expect(context).not.toHaveProperty("workflowOperator")
    expect(context).not.toHaveProperty("wayfinder")
    await context.requireSession()
    return expect(requireSession).toHaveBeenCalledWith(input.headers)
  })

  it("prefers an explicit safe identifier over generation", function() {
    const generateRequestId = vi.fn(() => "unused-generated-id")
    expect(resolveOperatorRequestId(request(), {
      requestId: "request.explicit:1",
      generateRequestId,
    })).toBe("request.explicit:1")
    return expect(generateRequestId).not.toHaveBeenCalled()
  })

  it("rejects unsafe explicit and generated identifiers", function() {
    expect(() => resolveOperatorRequestId(request(), {
      requestId: "unsafe request id",
    })).toThrow("requestId must be 1-128 safe correlation characters")
    return expect(() => resolveOperatorRequestId(request(), {
      generateRequestId: () => "",
    })).toThrow("generated requestId must be 1-128 safe correlation characters")
  })

  return it("generates a safe identifier when no authority is injected", function() {
    return expect(resolveOperatorRequestId(request()))
      .toMatch(/^[A-Za-z0-9._:-]{1,128}$/)
  })
})
