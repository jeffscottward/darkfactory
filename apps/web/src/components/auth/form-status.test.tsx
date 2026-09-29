import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

vi.mock("next/link", () => ({ default: "a" }))

import type { AuthFlowResult } from "./auth-flow.ts"
import { FormStatus } from "./form-status.tsx"

const markup = (result: AuthFlowResult | null): string => (
  renderToStaticMarkup(<FormStatus result={result} />)
)

describe("FormStatus", function() {
  it("keeps an empty atomic live region stable before feedback exists", function() {
    const html = markup(null)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('aria-atomic="true"')
    expect(html).toContain("min-h-6")
    expect(html).not.toContain('role="alert"')
    return expect(html).not.toContain('role="status"')
  })

  it("announces a successful message as status rather than an alert", function() {
    const html = markup({
      status: "success",
      message: "Check your inbox for the next step.",
    })
    expect(html).toContain('role="status"')
    expect(html).toContain("Check your inbox for the next step.")
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="alert"')
    return expect(html).not.toContain("<a")
  })

  it("renders an actionable error as an alert with a keyboard-native recovery link", function() {
    const html = markup({
      status: "error",
      message: "Verify your email before signing in.",
      actionHref: "/verify-email",
      actionLabel: "Send another verification email",
    })
    expect(html).toContain('role="alert"')
    expect(html).toContain("Verify your email before signing in.")
    expect(html).toContain('href="/verify-email"')
    expect(html).toContain("Send another verification email")
    expect(html).toContain("min-h-11")
    return expect(html).not.toContain('role="status"')
  })

  it("does not render a partial recovery action when either link field is absent", function() {
    const missingLabel = markup({
      status: "error",
      message: "The request failed.",
      actionHref: "/forgot-password",
    })
    const missingHref = markup({
      status: "error",
      message: "The request failed.",
      actionLabel: "Request a new link",
    })
    expect(missingLabel).toContain('role="alert"')
    expect(missingHref).toContain('role="alert"')
    expect(missingLabel).not.toContain("<a")
    return expect(missingHref).not.toContain("<a")
  })

  it("keeps destination-only success results visually quiet", function() {
    const html = markup({ status: "success", destination: "/dashboard" })
    expect(html).toContain('aria-live="polite"')
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain('role="alert"')
    return expect(html).not.toContain("/dashboard")
  })

  return it("escapes provider-shaped message text instead of creating executable markup", function() {
    const html = markup({
      status: "error",
      message: '<script>globalThis.compromised = true</script>',
    })
    expect(html).toContain(
      "&lt;script&gt;globalThis.compromised = true&lt;/script&gt;",
    )
    expect(html).not.toContain("<script>")
    return expect(html).toContain('role="alert"')
  })
})
