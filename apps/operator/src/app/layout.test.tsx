import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import RootLayout, { metadata, viewport } from "./layout.tsx"

describe("operator document layout", function() {
  it("publishes the standalone operator metadata", function() {
    expect(metadata).toEqual({
      applicationName: "DarkFactory Operator",
      title: {
        default: "Operator",
        template: "%s | DarkFactory Operator",
      },
      description: "A local-only control plane for bounded DarkFactory workflow runs.",
    })
    return expect(viewport).toEqual({ colorScheme: "light dark" })
  })

  return it("renders the accessible document wrapper", function() {
    const markup = renderToStaticMarkup(
      <RootLayout>
        <p>Operator content
        </p>
      </RootLayout>
    )
    expect(markup).toContain('<html data-mode="system" data-palette="neutral" lang="en">')
    expect(markup).toContain('<a class="skip-link" href="#main-content">Skip to main content</a>')
    return expect(markup).toContain("Operator content")
  })
})
