import { access, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

import * as serverSafeUi from "./index.ts"

const packageUrl = new URL("../package.json", import.meta.url)

describe("UI package boundaries", function() {
  it("retains every declared types target", async function() {
    const manifest = JSON.parse(await readFile(packageUrl, "utf8")) as {
      exports: Record<string, string | { types?: string }>
    }

    const typedTargets = Object.values(manifest.exports).flatMap((exported) => {
      if (typeof exported === "object" && typeof exported.types === "string") {
        return [exported.types]
      }
      return []
    }
    )

    expect(typedTargets).toHaveLength(22)
    return await Promise.all(
      typedTargets.map(async (typesTarget) => {
        return await expect(
          access(new URL(`..${typesTarget.slice(1)}`, import.meta.url)),
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
