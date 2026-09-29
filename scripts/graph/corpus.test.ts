import { describe, expect, it } from "vitest"

import {
  deriveWorkspaceAliases,
  rewriteWorkspaceAliases,
  snapshotTypeScriptSource,
} from "./corpus.ts"

const manifests = [{
  directory: "packages/api",
  source: JSON.stringify({
    name: "@darkfactory/api",
    exports: {
      ".": { import: "./src/index.ts" },
      "./server": { import: "./src/server/index.tsx" },
    },
  }),
}, {
  directory: "packages/db",
  source: JSON.stringify({
    name: "@darkfactory/db",
    exports: {
      ".": { import: "./src/index.ts" },
      "./server": { import: "./src/server/index.ts" },
    },
  }),
}]

describe("TypeScript Graphify corpus", () => {
  it("derives exact longest-first workspace aliases and rejects traversal", () => {
    const aliases = deriveWorkspaceAliases(manifests)
    expect([...aliases]).toEqual([
      ["@darkfactory/api", "packages/api/src/index.ts"],
      ["@darkfactory/api/server", "packages/api/src/server/index.tsx"],
      ["@darkfactory/db", "packages/db/src/index.ts"],
      ["@darkfactory/db/server", "packages/db/src/server/index.ts"],
    ])
    return expect(() => deriveWorkspaceAliases([{
      directory: "packages/api",
      source: JSON.stringify({ name: "@darkfactory/api", exports: { ".": "./../outside.ts" } }),
    }])).toThrow(/escapes/i)
  }
  )

  it("rewrites only exact quoted aliases and rejects unknown workspace aliases", () => {
    const aliases = deriveWorkspaceAliases(manifests)
    const rewritten = rewriteWorkspaceAliases(
      "apps/web/src/route.tsx",
      'import { appContract } from "@darkfactory/api"\nimport { db } from "@darkfactory/db/server"',
      aliases,
    )
    expect(rewritten).toContain('from "../../../packages/api/src/index.ts"')
    expect(rewritten).toContain('from "../../../packages/db/src/server/index.ts"')
    return expect(() => rewriteWorkspaceAliases(
      "apps/web/src/route.tsx",
      'import x from "@darkfactory/unknown"',
      aliases,
    )).toThrow(/unknown workspace alias/i)
  }
  )

  it("snapshots UTF-8 TypeScript at its own path and rewrites workspace imports", () => {
    const snapshot = snapshotTypeScriptSource(
      "packages/api/src/example.ts",
      'import { db } from "@darkfactory/db/server"\nexport const identity = <T,>(value: T): T => value\nexport const label = "café"',
      deriveWorkspaceAliases(manifests),
    )
    expect(snapshot.path).toBe("packages/api/src/example.ts")
    expect(snapshot.content).toContain("café")
    expect(snapshot.content).toContain("<T,>(value: T): T => value")
    expect(snapshot.content).toContain('from "../../db/src/server/index.ts"')
    return expect(snapshotTypeScriptSource(
      "apps/web/src/view.tsx",
      'import { appContract } from "@darkfactory/api"\nexport const View = () => <div>{String(appContract)}</div>',
      deriveWorkspaceAliases(manifests),
    ).content).toContain('from "../../../packages/api/src/index.ts"')
  }
  )

  it("rejects non-TypeScript snapshot sources", () => {
    return expect(() => snapshotTypeScriptSource(
      "packages/api/src/index.js",
      "export {}",
      new Map(),
    )).toThrow(/TypeScript sources only/i)
  }
  )

  it("selects supported conditional TypeScript exports and ignores unrelated manifests", () => {
    const aliases = deriveWorkspaceAliases([
      { directory: "packages/null", source: "null" },
      {
        directory: "packages/external",
        source: JSON.stringify({
          name: "@external/package",
          exports: { ".": "./src/index.ts" },
        }),
      },
      {
        directory: "packages/worker",
        source: JSON.stringify({
          name: "@darkfactory/worker",
          exports: {
            ".": {
              import: "./src/index.js",
              worker: "./src/worker.ts",
              default: "./src/fallback.ts",
            },
            "./fallback": {
              browser: "./src/browser.ts",
              default: "./src/fallback.ts",
            },
            "./javascript": "./src/index.js",
            "./unsupported-condition": {
              import: "./src/index.js",
              browser: "./src/browser.ts",
            },
            "./missing": null,
          },
        }),
      },
    ])

    return expect([...aliases]).toEqual([
      ["@darkfactory/worker", "packages/worker/src/worker.ts"],
      ["@darkfactory/worker/fallback", "packages/worker/src/fallback.ts"],
    ])
  }
  )

  it("rejects malformed manifests, unsafe export declarations, and duplicate aliases", () => {
    expect(() => deriveWorkspaceAliases([{
      directory: "packages/api",
      source: "{",
    }])).toThrow()
    expect(() => deriveWorkspaceAliases([{
      directory: "packages/api",
      source: JSON.stringify({
        name: "@darkfactory/api",
        exports: { server: "./src/server.ts" },
      }),
    }])).toThrow(/unsafe workspace export subpath/i)

    for (const target of ["./src\\index.ts", "./../outside.ts"]) {
      expect(() => deriveWorkspaceAliases([{
        directory: "packages/api",
        source: JSON.stringify({
          name: "@darkfactory/api",
          exports: { ".": target },
        }),
      }])).toThrow(/unsafe|escapes/i)
    }

    return expect(() => deriveWorkspaceAliases([
      {
        directory: "packages/api",
        source: JSON.stringify({
          name: "@darkfactory/api",
          exports: { ".": "./src/index.ts" },
        }),
      },
      {
        directory: "packages/api-copy",
        source: JSON.stringify({
          name: "@darkfactory/api",
          exports: { ".": "./src/index.ts" },
        }),
      },
    ])).toThrow(/duplicate workspace alias/i)
  }
  )

  return it("rewrites export, dynamic import, and require specifiers without touching ordinary strings", () => {
    const aliases = deriveWorkspaceAliases(manifests)
    const rewritten = rewriteWorkspaceAliases(
      "apps/web/src/route.tsx",
      [
        "export { appContract } from '@darkfactory/api/server'",
        "export { localOnly }",
        "const load = import(\"@darkfactory/db\")",
        "const database = require('@darkfactory/db/server')",
        "const alias = \"@darkfactory/api\"",
        "const untouched = require(alias)",
      ].join("\n"),
      aliases,
    )

    expect(rewritten).toContain("from '../../../packages/api/src/server/index.tsx'")
    expect(rewritten).toContain("export { localOnly }")
    expect(rewritten).toContain('import("../../../packages/db/src/index.ts")')
    expect(rewritten).toContain("require('../../../packages/db/src/server/index.ts')")
    expect(rewritten).toContain('const alias = "@darkfactory/api"')
    expect(rewritten).toContain("require(alias)")

    return expect(rewriteWorkspaceAliases(
      "packages/api/src/consumer.tsx",
      'import value from "@darkfactory/local"',
      new Map([["@darkfactory/local", "packages/api/src/index.ts"]]),
    )).toContain('from "./index.ts"')
  }
  )
}
)
