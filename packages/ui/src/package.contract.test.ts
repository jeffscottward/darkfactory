import { access, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

import * as serverSafeUi from "./index.ts"

const packageUrl = new URL("../package.json", import.meta.url)

describe("UI package boundaries", function() {
  it("points every export at an existing TypeScript source or stylesheet", async function() {
    const manifest = JSON.parse(await readFile(packageUrl, "utf8")) as {
      exports: Record<string, string | { import?: string }>
    }

    const targets = Object.values(manifest.exports).flatMap((exported) => {
      if (typeof exported === "string") return [exported]
      return typeof exported.import === "string" ? [exported.import] : []
    }
    )

    expect(targets).toHaveLength(Object.keys(manifest.exports).length)
    for (const target of targets) {
      expect(target).toMatch(/^\.\/src\/.+\.(?:ts|tsx|css)$/)
    }
    return await Promise.all(
      targets.map(async (target) => {
        return await expect(
          access(new URL(`..${target.slice(1)}`, import.meta.url)),
        ).resolves.toBeUndefined()
      }
      ),
    )
  })

  it("publishes the semantic theme client boundary", async function() {
    const manifest = JSON.parse(await readFile(packageUrl, "utf8")) as {
      exports: Record<string, unknown>
    }

    return expect(manifest.exports).toHaveProperty("./client/theme")
  })

  return it("keeps client-only wrappers out of the server-safe root", function() {
    expect(serverSafeUi).not.toHaveProperty("Dialog")
    expect(serverSafeUi).not.toHaveProperty("DropdownMenu")
    expect(serverSafeUi).not.toHaveProperty("Tabs")
    expect(serverSafeUi).not.toHaveProperty("ThemePicker")
    expect(serverSafeUi).not.toHaveProperty("ThemeProvider")
    expect(serverSafeUi).not.toHaveProperty("useTheme")
    return expect(serverSafeUi).not.toHaveProperty("Toaster")
  })
})
