import { describe, expect, it, vi } from "vitest"
import { fileURLToPath, pathToFileURL } from "node:url"

const { execFileMock, readFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  readFileMock: vi.fn(),
}))

vi.mock("node:child_process", () => ({ execFile: execFileMock }))
vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  readFileMock.mockImplementation((path, options) => actual.readFile(path, options))
  return { ...actual, readFile: readFileMock }
}
)

import {
  discoverCivetFiles,
  formatCivetStyleViolation,
  parseGitCivetPaths,
  runCivetStyleCli,
  runCivetStyleEntrypoint,
  scanCivetRepository,
  scanCivetSource,
  type CivetStyleDependencies,
  type CivetStyleViolation,
  type GitRunner,
} from "./civet-style.ts"

const STRUCTURAL_MESSAGE = "structural brace block is forbidden; use Civet indentation"
const JSX_MESSAGE = "JSX closing tag is forbidden; use Civet indentation"

describe("Civet source style scanner", function() {
  const forbiddenBlocks = [
    { name: "function body", source: "function greet() {\n  return 'hello'\n}" },
    { name: "typed function body", source: "function greet(): string {\n  return 'hello'\n}" },
    { name: "object-return typed function body", source: "function make(): { ready: boolean } {\n  return { ready: true }\n}" },
    { name: "next-line object-return typed function body", source: "function make(): { ready: boolean }\n{\n  return { ready: true }\n}" },
    { name: "wrapped object-return typed function body", source: "function make(): Readonly<{ ready: boolean }> {\n  return { ready: true }\n}" },
    { name: "union object-return typed function body", source: "function make(): { ready: boolean } | null {\n  return { ready: true }\n}" },
    { name: "next-line function body", source: "function greet()\n{\n  return 'hello'\n}" },
    { name: "arrow body", source: "const greet = () => {\n  return 'hello'\n}" },
    { name: "object-property arrow body", source: "const options = { handler: () => {\n  work()\n} }" },
    { name: "next-line object-property arrow body", source: "const options = { handler: () =>\n{\n  work()\n} }" },
    { name: "arrow body after unrelated type alias", source: "type Name = string\nconst run = () => {\n  work()\n}" },
    { name: "callback arrow after unrelated type alias", source: "type Name = string\nitems.map(() => {\n  work()\n})" },
    { name: "assigned arrow after unrelated type alias", source: "type Name = string\nhandler = () => {\n  work()\n}" },
    { name: "object callback after unrelated type alias", source: "type Name = string\nconsume({ handler: () => {\n  work()\n} })" },
    { name: "nested if body", source: "if ((ready && check())) {\n  start()\n}" },
    { name: "if body", source: "if (ready) {\n  start()\n}" },
    { name: "next-line if body", source: "if (ready)\n{\n  start()\n}" },
    { name: "else body", source: "if (ready) start()\nelse {\n  wait()\n}" },
    { name: "for body", source: "for (const item of items) {\n  visit(item)\n}" },
    { name: "while body", source: "while (ready) {\n  tick()\n}" },
    { name: "with body", source: "with (context) {\n  inspect()\n}" },
    { name: "do body", source: "do {\n  tick()\n} while (ready)" },
    { name: "switch body", source: "switch (kind) {\n  case 'a': break\n}" },
    { name: "class body", source: "class Worker {\n  run()\n}" },
    { name: "next-line class body", source: "class Worker\n{\n  run()\n}" },
    { name: "generic class body", source: "class Worker<T> extends Base<T> {\n  run()\n}" },
    { name: "computed-base class body", source: "class Worker extends mixins[0] {\n  run()\n}" },
    { name: "method body", source: "run(value: string): void {\n  use(value)\n}" },
    { name: "computed method body", source: "class Worker\n  [runSymbol]() {\n    work()\n  }" },
    { name: "generic method body", source: "class Worker\n  run<T>() {\n    work()\n  }" },
    { name: "callback arrow body", source: "items.map((item) => {\n  return item.id\n})" },
    { name: "callback function body", source: "items.map(function (item) {\n  return item.id\n})" },
    { name: "direct call followed by a block", source: "load()\n{\n  work()\n}" },
    { name: "try body", source: "try {\n  work()\n}" },
    { name: "catch body", source: "try work()\ncatch (error) {\n  recover(error)\n}" },
    { name: "catch body without binding", source: "try work()\ncatch {\n  recover()\n}" },
    { name: "finally body", source: "try work()\nfinally {\n  clean()\n}" },
    { name: "static initializer", source: "class Cache\n  static {\n    warm()\n  }" },
    { name: "bare statement block", source: "{\n  work()\n}" },
  ] as const

  it.each(forbiddenBlocks)("detects a traditional $name", ({ source }) => {
    const allmanLine = source.split("\n").findIndex((line) => line.trim() === "{") + 1
    return expect(scanCivetSource(source, "src/example.civet")).toEqual([
      {
        file: "src/example.civet",
        line: allmanLine > 0 ? allmanLine : source.slice(0, source.indexOf("{")).split("\n").length,
        message: STRUCTURAL_MESSAGE,
      },
    ])
  }
  )

  it("detects every traditional block in one source in line order", function() {
    const source = [
      "if (ready) {",
      "  run()",
      "} else {",
      "  wait()",
      "}",
    ].join("\n")
    return expect(scanCivetSource(source, "src/example.civet")).toEqual([
      { file: "src/example.civet", line: 1, message: STRUCTURAL_MESSAGE },
      { file: "src/example.civet", line: 3, message: STRUCTURAL_MESSAGE },
    ])
  })

  it.each([
    { name: "element", source: "<Panel>\n  <Content />\n</Panel>", line: 3 },
    { name: "fragment", source: "<>\n  <Content />\n</>", line: 3 },
    { name: "member element", source: "<Layout.Panel>\n  content\n</Layout.Panel>", line: 3 },
    { name: "namespaced element", source: "<svg:path>\n  content\n</svg:path>", line: 3 },
    { name: "custom element", source: "<my-widget>\n  content\n</my-widget>", line: 3 },
    { name: "qualified custom element", source: "<ui:layout-panel>\n  content\n</ui:layout-panel>", line: 3 },
  ] as const)("detects an actual JSX closing $name", ({ source, line }) => {
    return expect(scanCivetSource(source, "src/view.civet")).toEqual([
      { file: "src/view.civet", line, message: JSX_MESSAGE },
    ])
  }
  )

  it("allows semantic TypeScript, JavaScript, and JSX delimiters", function() {
    const allowed = [
      "import { readFile as read } from 'node:fs/promises'",
      "export { read }",
      "const { name, nested: { value } } = record",
      "const options = { enabled: true, nested: { count: 1 } }",
      "const values = [{ id: 1 }, { id: 2 }]",
      "type RecordShape = { name: string; nested: { value: number } }",
      "interface Named { name: string; metadata?: { active: boolean } }",
      "const identity = <T extends { id: string }>(value: T): T => value",
      "const first: Bucket['items'][number] = bucket.items[0]",
      "const view = <Panel title={title}>\n  {content}",
      "const pattern = /if \\(ready\\) \\{ work\\(\\) \\}|<\\/Panel>/u",
      "const quotient = total / divisor / scale",
      "const pick = ({ value }: Options): string => value",
      "consume({ ready: true })",
      "const make = () =>\n  return { ready: true }",
      "class Service\n  options = { ready: true }\n  create()\n    return Object.freeze({ enabled: true })\n  snapshot()\n    return { enabled: true }",
      "class TypedService\n  records: Array<{ id: string; options: { active: boolean } }> = []",
      "class ClientFactory\n  create()\n    return new Client({ timeout: 1000 })",
      "const rendered = ready\n  ? createElement(View, props)\n  : createElement(View, { ...props })",
      "const load = vi.fn<(input: string) => { ready: boolean }>(() => ({ ready: true }))",
      "const previous = load()\ninterface Repository { find(): Promise<void> }",
      "const assigned = Object.assign({}, { enabled: true })",
      "Object.defineProperty(session, 'user', { get: accessor })\n{ session, traps: [accessor] }",
      "const proxy = new Proxy({}, {})\n{ proxy }",
      "interface First { x: string }\ninterface Second { y: string }",
      "type Frozen = Readonly<{ value: string; nested: Readonly<{ count: number }> }>",
      "const projected = items.map((item) => ({ id: item.id }))",
      "const client = new Client({ timeout: 1000, headers: { accept: 'text/plain' } })",
      "const response = await fetch(url, { method: 'POST', body: JSON.stringify({ value }) })",
      "const read = async (path: string): Promise<Readonly<{ size: number; source: string }>> => load(path)",
      "type Options = { handler: () => { ready: boolean } }",
      "interface HandlerOptions { handler: () => { ready: boolean } }",
      "const asserted = implementation as ((input: string) => { ready: boolean })",
      "type Loader = (path: string) => { value: string }",
      "const handler: (input: string) => { ready: boolean } = implementation",
      "const useHandler = (handler: (input: string) => { ready: boolean }) => handler",
    ]
    const results=[];for (const source of allowed) {
      results.push(expect(scanCivetSource(source, "src/allowed.civet"), source).toEqual([]))
    };return results;
  })

  it("allows multiline type, interface, class-constraint, assertion, and call-result braces", function() {
    const allowed = [
      "type Handler =\n  (input: string) => { ready: boolean }",
      "interface Factory {\n  create(): { ready: boolean }\n  handler: () => { ready: boolean }\n}",
      "class Box<T extends { id: string }>\n  value: T",
      "const checked = implementation satisfies ((input: string) => { ready: boolean })",
      "service?.load()\n{ service }",
    ]
    const results1=[];for (const source of allowed) {
      results1.push(expect(scanCivetSource(source, "src/types.ts"), source).toEqual([]))
    };return results1;
  })

  it("ignores fake violations in strings, comments, regexes, and template text", function() {
    const source = [
      "const single = 'if (ready) { run() } </Panel>'",
      "const double = \"() => { return 1 } </>\"",
      "const template = `class Fake { method() {} } </Fake>`",
      "const interpolated = `literal </Panel> ${value}`",
      "const regex = /<\\/Panel>|function fake\\(\\) \\{}/gu",
      "expect(value).toMatchInlineSnapshot(`\"</Panel> if (ready) { run() }\"`)",
      "// while (ready) { tick() } </Panel>",
      "/*",
      "try { work() }",
      "</>",
      "*/",
    ].join("\n")
    return expect(scanCivetSource(source, "src/fixtures.civet")).toEqual([])
  })

  it("still scans code inside template interpolation", function() {
    const source = "const rendered = `value: ${(() => { return value })()}`"
    return expect(scanCivetSource(source, "src/interpolation.civet")).toEqual([
      { file: "src/interpolation.civet", line: 1, message: STRUCTURAL_MESSAGE },
    ])
  })

  it("sorts different violation messages reported on the same line", function() {
    return expect(scanCivetSource("if (ready) { <Panel></Panel>", "src/same-line.civet")).toEqual([
      { file: "src/same-line.civet", line: 1, message: JSX_MESSAGE },
      { file: "src/same-line.civet", line: 1, message: STRUCTURAL_MESSAGE },
    ])
  })

  it("skips escaped and multiline quoted-string contents while preserving line numbers", function() {
    const source = [
      String.raw`const single = 'escaped \' brace { and </Panel>'`,
      String.raw`const double = "escaped \" brace { and </Panel>"`,
      "const continued = 'first\\",
      "second { and </Panel>'",
      "const multiline = 'first",
      "second { and </Panel>'",
      "if (ready) {",
      "  work()",
      "}",
    ].join("\n")
    expect(scanCivetSource(source, "src/quoted.civet")).toEqual([
      { file: "src/quoted.civet", line: 7, message: STRUCTURAL_MESSAGE },
    ])
    return expect(scanCivetSource(
      "const unfinished = 'fake { and </Panel>",
      "src/unfinished-quote.civet",
    )).toEqual([])
  })

  it("skips escaped, multiline, nested, and unterminated template text", function() {
    const source = [
      "const escaped = `fake \\` { and </Panel>`",
      "const continued = `first\\",
      "second { and </Panel>`",
      "const nested = `outer ${`inner ${value}`}`",
      "const interpolated = `value ${({ ready: true })}`",
      "if (ready) {",
      "  work()",
      "}",
    ].join("\n")
    expect(scanCivetSource(source, "src/templates.civet")).toEqual([
      { file: "src/templates.civet", line: 6, message: STRUCTURAL_MESSAGE },
    ])
    return expect(scanCivetSource(
      "const unfinished = `fake\n{ and </Panel>",
      "src/unfinished-template.civet",
    )).toEqual([])
  })

  it("handles empty and unterminated comments without scanning their contents", function() {
    expect(scanCivetSource("//", "src/empty-comment.civet")).toEqual([])
    return expect(scanCivetSource(
      "/* unterminated\nif (ready) { </Panel>",
      "src/unfinished-comment.civet",
    )).toEqual([])
  })

  it("distinguishes escaped regex bodies and character classes from division", function() {
    const source = [
      "/[{}\\/]+/giu",
      "return /escaped\\/slash[}/]+/u",
      "const quotient = total / divisor / scale",
      "if (ready) {",
      "  work()",
      "}",
    ].join("\n")
    expect(scanCivetSource(source, "src/regex.civet")).toEqual([
      { file: "src/regex.civet", line: 4, message: STRUCTURAL_MESSAGE },
    ])
    return expect(scanCivetSource(
      "return /unterminated\nif (ready) { </Panel>",
      "src/unfinished-regex.civet",
    )).toEqual([])
  })

  it("continues scanning after numeric, two-character, and spread tokens", function() {
    const source = [
      "const number = 1_000.25e2",
      "const choice = input?.part ?? fallback && left || right",
      "const comparisons = a == b != c === d !== e <= f >= g",
      "const updates = count++ + other-- ** 2",
      "const copy = [...items]",
      "if (copy[0] !== undefined) {",
      "  work()",
      "}",
    ].join("\n")
    return expect(scanCivetSource(source, "src/operators.civet")).toEqual([
      { file: "src/operators.civet", line: 6, message: STRUCTURAL_MESSAGE },
    ])
  })

  it("classifies braces consistently around unmatched delimiter fragments", function() {
    expect(scanCivetSource(") {", "src/unmatched-close.civet")).toEqual([])
    expect(scanCivetSource("( {", "src/unmatched-open.civet")).toEqual([])
    expect(scanCivetSource("{ {", "src/unmatched-brace.civet")).toEqual([
      { file: "src/unmatched-brace.civet", line: 1, message: STRUCTURAL_MESSAGE },
    ])
    expect(scanCivetSource(
      "const value = { ready: true } candidate {",
      "src/nested-brace.civet",
    )).toEqual([])
    return expect(scanCivetSource("{: () => {", "src/unmatched-type.civet")).toEqual([
      { file: "src/unmatched-type.civet", line: 1, message: STRUCTURAL_MESSAGE },
      { file: "src/unmatched-type.civet", line: 1, message: STRUCTURAL_MESSAGE },
    ])
  })

  it.each([
    { name: "unterminated regex at end of source", source: "return /unterminated\nif (ready) {" },
    { name: "numeric token at end of source", source: "123" },
  ] as const)("handles an $name", ({ source }) => {
    return expect(scanCivetSource(source, "src/end-of-source.civet")).toEqual([])
  }
  )

  it.each([
    {
      name: "leading empty parameter list",
      source: "() {",
      violations: [],
    },
    {
      name: "balanced call before an unfinished header",
      source: "call() candidate {",
      violations: [],
    },
    {
      name: "bare unfinished header",
      source: "candidate {",
      violations: [],
    },
    {
      name: "unqualified assigned arrow",
      source: "handler = () => {",
      violations: [
        { file: "src/backward-scan.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
  ] as const)(
    "handles an incomplete $name without inventing type or callable context",
    ({ source, violations }) => {
      return expect(scanCivetSource(source, "src/backward-scan.civet")).toEqual(violations)
    }
  )

  it.each([
    {
      name: "computed interface member",
      source: "interface Factory { [handler]: () => { ready: boolean } }",
      violations: [],
    },
    {
      name: "open computed member",
      source: "[handler: () => {",
      violations: [],
    },
    {
      name: "parenthesis inside an open computed member",
      source: "[) handler: () => {",
      violations: [
        { file: "src/type-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "brace inside an open computed member",
      source: "[} handler: () => {",
      violations: [
        { file: "src/type-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "assignment before an apparent annotation",
      source: "handler = callback: () => {",
      violations: [
        { file: "src/type-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "unanchored apparent annotation",
      source: "handler: () => {",
      violations: [
        { file: "src/type-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
  ] as const)(
    "classifies an incomplete $name from its reachable delimiter context",
    ({ source, violations }) => {
      return expect(scanCivetSource(source, "src/type-context.civet")).toEqual(violations)
    }
  )

  it.each([
    {
      name: "generic arrow body",
      source: "const identity = <T>(value: T) => {\n  return value\n}",
      violations: [
        { file: "src/arrow-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "unparenthesized arrow body",
      source: "const identity = value => {\n  return value\n}",
      violations: [
        { file: "src/arrow-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "unmatched closing parenthesis before an arrow body",
      source: "const identity = value) => {\n  return value\n}",
      violations: [
        { file: "src/arrow-context.civet", line: 1, message: STRUCTURAL_MESSAGE },
      ],
    },
    {
      name: "unfinished generic function type",
      source: "type Factory = <T => { ready: boolean }",
      violations: [],
    },
  ] as const)(
    "classifies a $name without confusing generic and structural braces",
    ({ source, violations }) => {
      return expect(scanCivetSource(source, "src/arrow-context.civet")).toEqual(violations)
    }
  )

  it("rejects complete JSX names but ignores whitespace and malformed closing candidates", function() {
    const source = [
      "< /Panel>",
      "</123>",
      "</Panel!>",
      "</Panel.123>",
      "const quotient = left < /right/.source.length",
    ].join("\n")
    return expect(scanCivetSource(source, "src/not-jsx.civet")).toEqual([])
  })

  return it("reports stable one-based lines and formats diagnostics", function() {
    const violation: CivetStyleViolation = {
      file: "packages/example/src/view.civet",
      line: 17,
      message: JSX_MESSAGE,
    }
    return expect(formatCivetStyleViolation(violation)).toBe(
      "packages/example/src/view.civet:17: JSX closing tag is forbidden; use Civet indentation",
    )
  })
})

describe("Civet source discovery", function() {
  it("parses NUL-delimited Git output, keeps only authored Civet paths, deduplicates, and sorts", function() {
    return expect(parseGitCivetPaths([
      "scripts/z.civet",
      "packages/a/src/a.civet",
      "README.md",
      "scripts/z.civet",
      ".omp-status.md",
      "root.civet",
      "",
    ].join("\0"))).toEqual([
      "packages/a/src/a.civet",
      "root.civet",
      "scripts/z.civet",
    ])
  })


  it("normalizes Windows separators and handles empty Git output", function() {
    expect(parseGitCivetPaths("packages\\core\\index.civet\0")).toEqual([
      "packages/core/index.civet",
    ])
    return expect(parseGitCivetPaths("")).toEqual([])
  })
  it("asks Git for tracked and untracked non-ignored Civet files", async function() {
    const calls: Array<readonly [string, readonly string[], string]> = []
    const runGit: GitRunner = async (command, arguments_, options) => {
      calls.push([command, arguments_, options.cwd])
      return { stdout: "untracked.civet\0tracked.civet\0" }
    }

    await expect(discoverCivetFiles("/repo", runGit)).resolves.toEqual([
      "tracked.civet",
      "untracked.civet",
    ])
    return expect(calls).toEqual([[
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "*.ts",
      ],
      "/repo",
    ]])
  })

  it("uses the default Git and source-reader callbacks", async function() {
    execFileMock.mockImplementationOnce((_command, _arguments, _options, callback) => {
      return callback(null, { stdout: "scripts/civet-style.ts\0" })
    }
    )
    const root = fileURLToPath(new URL("..", import.meta.url))
    await expect(scanCivetRepository(root)).resolves.toEqual({
      files: ["scripts/civet-style.ts"],
      violations: [],
    })
    return expect(execFileMock).toHaveBeenCalledWith(
      "git",
      [
        "ls-files",
        "--cached",
        "--others",
        "--exclude-standard",
        "-z",
        "--",
        "*.ts",
      ],
      { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
      expect.any(Function),
    )
  })

  it("ignores files deleted before the default reader opens them", async function() {
    execFileMock.mockImplementationOnce((_command, _arguments, _options, callback) => {
      return callback(null, { stdout: "deleted.civet\0" })
    }
    )
    readFileMock.mockRejectedValueOnce(
      Object.assign(new Error("file disappeared"), { code: "ENOENT" }),
    )

    await expect(scanCivetRepository("/repo")).resolves.toEqual({
      files: [],
      violations: [],
    })
    return expect(readFileMock).toHaveBeenLastCalledWith("/repo/deleted.civet", "utf8")
  })

  it("propagates access failures from the default reader", async function() {
    const failure = Object.assign(new Error("permission denied"), { code: "EACCES" })
    execFileMock.mockImplementationOnce((_command, _arguments, _options, callback) => {
      return callback(null, { stdout: "private.civet\0" })
    }
    )
    readFileMock.mockRejectedValueOnce(failure)

    await expect(scanCivetRepository("/repo")).rejects.toBe(failure)
    return expect(readFileMock).toHaveBeenLastCalledWith("/repo/private.civet", "utf8")
  })

  it("sorts repository findings by file, line, and message regardless of discovery order", async function() {
    const dependencies: CivetStyleDependencies = {
      discoverFiles: async function() { return ["z.civet", "a.civet"] },
      readSource: async function(_root, file) {
        if (file === "z.civet") {
          return "<Panel>\n</Panel>"
        }
        return "if (ready) {\n  run()\n}\n</Fragment>"
      }
    }
    return await expect(scanCivetRepository("/repo", dependencies)).resolves.toEqual({
      files: ["a.civet", "z.civet"],
      violations: [
        { file: "a.civet", line: 1, message: STRUCTURAL_MESSAGE },
        { file: "a.civet", line: 4, message: JSX_MESSAGE },
        { file: "z.civet", line: 2, message: JSX_MESSAGE },
      ],
    })
  })

  it("deduplicates before invoking the repository source callback", async function() {
    const discoverFiles = vi.fn(async function() { return ["b.civet", "a.civet", "b.civet"] })
    const readSource = vi.fn(async (_root, file) => {
      if (file === "a.civet") { return "const clean = { ready: true }"} else return ""
    }
    )
    await expect(scanCivetRepository("/repo", {
      discoverFiles,
      readSource,
    })).resolves.toEqual({
      files: ["a.civet", "b.civet"],
      violations: [],
    })
    expect(discoverFiles).toHaveBeenCalledWith("/repo")
    return expect(readSource.mock.calls).toEqual([
      ["/repo", "a.civet"],
      ["/repo", "b.civet"],
    ])
  })

  return it("ignores tracked Civet files deleted from the working tree", async function() {
    const readSource = vi.fn(async (_root, file) => {
      if (file === "deleted.civet") { return undefined} else return "const clean = true"
    }
    )
    await expect(scanCivetRepository("/repo", {
      discoverFiles: async function() { return ["kept.civet", "deleted.civet"] },
      readSource,
    })).resolves.toEqual({
      files: ["kept.civet"],
      violations: [],
    })
    return expect(readSource).toHaveBeenCalledTimes(2)
  })
})

describe("Civet style CLI", function() {
  const dependencies = (sources: Readonly<Record<string, string>>): CivetStyleDependencies => ({
    discoverFiles: async function() { return Object.keys(sources).reverse() },
    readSource: async function(_root, file) { return sources[file]! },
  })

  it("returns zero and emits a stable clean summary", async function() {
    const output: string[] = []
    const error: string[] = []
    const exitCode = await runCivetStyleCli(
      "/repo",
      { writeOutput: (value) => output.push(value), writeError: (value) => error.push(value) },
      dependencies({ "clean.civet": "const value = { ready: true }" }),
    )
    expect(exitCode).toBe(0)
    expect(output).toEqual(["Civet style check passed (1 file).\n"])
    return expect(error).toEqual([])
  })

  it("uses the plural clean summary when no files are discovered", async function() {
    const output = vi.fn()
    const error = vi.fn()
    await expect(runCivetStyleCli(
      "/repo",
      { writeOutput: output, writeError: error },
      dependencies({}),
    )).resolves.toBe(0)
    expect(output).toHaveBeenCalledWith("Civet style check passed (0 files).\n")
    return expect(error).not.toHaveBeenCalled()
  })

  it("returns nonzero and emits sorted file:line diagnostics for dirty sources", async function() {
    const output: string[] = []
    const error: string[] = []
    const exitCode = await runCivetStyleCli(
      "/repo",
      { writeOutput: (value) => output.push(value), writeError: (value) => error.push(value) },
      dependencies({
        "z.civet": "const f = () => {\n  return 1\n}",
        "a.civet": "<Panel>\n</Panel>",
      }),
    )
    expect(exitCode).toBe(1)
    expect(output).toEqual([])
    return expect(error).toEqual([
      [
        "a.civet:2: JSX closing tag is forbidden; use Civet indentation",
        "z.civet:1: structural brace block is forbidden; use Civet indentation",
        "",
      ].join("\n"),
    ])
  })

  return it("fails closed with a stable diagnostic when scanning fails", async function() {
    const output = vi.fn()
    const error = vi.fn()
    const exitCode = await runCivetStyleCli(
      "/repo",
      { writeOutput: output, writeError: error },
      {
        discoverFiles: async function() { throw new Error("private filesystem detail") },
        readSource: async function() { return "" },
      },
    )
    expect(exitCode).toBe(1)
    expect(output).not.toHaveBeenCalled()
    return expect(error).toHaveBeenCalledWith("civet-style: scan failed\n")
  })
})

describe("Civet style entrypoint", function() {
  const moduleUrl = pathToFileURL("/repo/scripts/civet-style.civet").href

  it("does not invoke the CLI without an invoked path or for another module", async function() {
    const runCli = vi.fn(async function() { return 0 })
    const streams = { writeOutput: vi.fn(), writeError: vi.fn() }

    await runCivetStyleEntrypoint({
      invokedPath: undefined,
      moduleUrl,
      root: "/repo",
      streams,
      exitState: {},
      runCli,
    })
    await runCivetStyleEntrypoint({
      invokedPath: "/repo/scripts/other.civet",
      moduleUrl,
      root: "/repo",
      streams,
      exitState: {},
      runCli,
    })

    return expect(runCli).not.toHaveBeenCalled()
  })

  return it("forwards the CLI callbacks and stores the returned exit code", async function() {
    const runCli = vi.fn(async function() { return 7 })
    const streams = { writeOutput: vi.fn(), writeError: vi.fn() }
    const exitState: { exitCode?: string | number | null } = {}

    await runCivetStyleEntrypoint({
      invokedPath: "/repo/scripts/civet-style.civet",
      moduleUrl,
      root: "/repo",
      streams,
      exitState,
      runCli,
    })

    expect(runCli).toHaveBeenCalledWith("/repo", streams)
    return expect(exitState.exitCode).toBe(7)
  })
})
