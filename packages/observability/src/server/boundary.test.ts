import { execFileSync } from "node:child_process"
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const packageDirectory = fileURLToPath(new URL("../../", import.meta.url))

const resolveExport = function(specifier: string, conditions: string[]): string {
  return execFileSync(
    process.execPath,
    [
      ...conditions.flatMap((condition) => ["--conditions", condition]),
      "--input-type=module",
      "--eval",
      `process.stdout.write(import.meta.resolve(${JSON.stringify(specifier)}))`,
    ],
    { cwd: packageDirectory, encoding: "utf8" }
  )
}

describe("observability package boundaries", function() {
  it("keeps root, port, redaction, and test exports provider-safe", function() {
    expect(resolveExport("@darkfactory/observability", ["browser"])).toMatch(
      /\/src\/index\.ts$/
    )
    expect(resolveExport("@darkfactory/observability/port", ["browser"])).toMatch(
      /\/src\/port\.ts$/
    )
    expect(
      resolveExport("@darkfactory/observability/redaction", ["browser"])
    ).toMatch(/\/src\/redaction\.ts$/)
    return expect(resolveExport("@darkfactory/observability/test", ["browser"])).toMatch(
      /\/src\/test\.ts$/
    )
  })

  it("fails browser-only server resolution closed but lets real Worker conditions win even when browser is also present", function() {
    const results=[];for (const specifier of [
      "@darkfactory/observability/server/otel",
      "@darkfactory/observability/server/evlog",
      "@darkfactory/observability/server/fanout",
    ]) {
      expect(resolveExport(specifier, ["browser"])).toMatch(
        /\/src\/server\/unsupported\.ts$/
      )
      expect(resolveExport(specifier, ["worker", "browser"])).toMatch(
        /\/src\/server\/(otel|evlog|fanout)\.civet$/
      )
      results.push(expect(resolveExport(specifier, ["workerd", "browser"])).toMatch(
        /\/src\/server\/(otel|evlog|fanout)\.civet$/
      ))
    };return results;
  })

  it("preserves browser poison in a side-effect-only Vite bundle", function() {
    const fixtureDirectory = mkdtempSync(
      join(packageDirectory, ".vite-browser-boundary-")
    )
    const outputDirectory = join(fixtureDirectory, "dist")
    const entry = join(fixtureDirectory, "index.mjs")
    const config = join(fixtureDirectory, "vite.config.mjs")
    writeFileSync(
      entry,
      'import "@darkfactory/observability/server/otel"\n',
      "utf8"
    )
    writeFileSync(
      config,
      `export default {
  resolve: { conditions: ["browser"] },
  build: {
    emptyOutDir: true,
    lib: {
      entry: ${JSON.stringify(entry)},
      fileName: "index",
      formats: ["es"],
    },
    minify: false,
    outDir: ${JSON.stringify(outputDirectory)},
  },
}\n`,
      "utf8"
    )

    try {
      execFileSync(
        fileURLToPath(
          new URL("../../node_modules/.bin/vite", import.meta.url)
        ),
        ["build", fixtureDirectory, "--config", config],
        { cwd: packageDirectory, encoding: "utf8" }
      )
      const bundlePath = join(outputDirectory, "index.js")
      const bundle = readFileSync(bundlePath, "utf8")
      expect(bundle).toContain(
        "@darkfactory/observability server adapters are unavailable in browser bundles"
      )
      return expect(function() {
        return execFileSync(process.execPath, [bundlePath], {
          cwd: packageDirectory,
          encoding: "utf8",
        })
      }
      ).toThrow(/server adapters are unavailable in browser bundles/)
    }
    finally {
      rmSync(fixtureDirectory, { force: true, recursive: true })
    }
  })

  it("declares ordered workerd then worker before browser for every runtime export", function() {
    const manifest = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8")
    ) as { exports: Record<string, Record<string, string>> }

    const results1=[];for (const subpath of [
      "./server/otel",
      "./server/evlog",
      "./server/fanout",
    ]) {
      results1.push(expect(Object.keys(manifest.exports[subpath] ?? {})).toEqual([
        "types",
        "workerd",
        "worker",
        "browser",
        "import",
        "default",
      ]))
    };return results1;
  })

  return it("executes the browser poison module as a fail-closed boundary", async function() {
    return await expect(import("./unsupported.ts")).rejects.toThrow(
      "@darkfactory/observability server adapters are unavailable in browser bundles"
    )
  })
})
