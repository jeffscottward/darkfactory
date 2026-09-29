import { describe, expect, it } from "vitest"

import { normalizeRelativeCivetDeclarationSpecifiers } from "../scripts/type-declaration-specifiers.ts"

describe("generated declaration specifiers", function() {
  it("targets adjacent declarations for static and dynamic Civet imports", function() {
    const source = [
      `import value from "./value.civet"`,
      `import "./setup.civet"`,
      `export { value } from './value.civet'`,
      `export type { Value }   from   "../shared/value.civet"`,
      `type Lazy = import( './lazy.civet' ).Lazy`
    ].join("\n")

    return expect(normalizeRelativeCivetDeclarationSpecifiers(source)).toBe([
      `import value from "./value.civet.d.js"`,
      `import "./setup.civet.d.js"`,
      `export { value } from './value.civet.d.js'`,
      `export type { Value }   from   "../shared/value.civet.d.js"`,
      `type Lazy = import( './lazy.civet.d.js' ).Lazy`
    ].join("\n"))
  })

  return it("leaves near misses unchanged and is idempotent", function() {
    const source = [
      `const label = "./value.civet"`,
      `export { value } from "package/value.civet"`,
      `export { value } from "./value.civet.d.ts"`,
      `export { value } from "./value.civet.d.js"`
    ].join("\n")
    const normalized = normalizeRelativeCivetDeclarationSpecifiers(source)

    expect(normalized).toBe(source)
    return expect(normalizeRelativeCivetDeclarationSpecifiers(normalized)).toBe(normalized)
  })
})
