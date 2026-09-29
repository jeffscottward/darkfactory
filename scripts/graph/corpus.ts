import { posix } from "node:path"
import ts from "typescript"

export type WorkspaceManifest = Readonly<{
  directory: string
  source: string
}>

const asRecord = (value: unknown): Record<string, unknown> | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export const isTypeScriptSource = (path: string): boolean => /\.tsx?$/.test(path)

const exportTarget = (value: unknown): string | null => {
  if (typeof value === "string") return isTypeScriptSource(value) ? value : null
  const record = asRecord(value)
  if (!record) return null
  for (const condition of ["import", "workerd", "worker", "default"]) {
    const candidate = record[condition]
    if (typeof candidate === "string" && isTypeScriptSource(candidate)) return candidate
  }
  return null
}

const safePackageTarget = (directory: string, target: string): string => {
  if (!target.startsWith("./") || target.includes("\\")) throw new Error("Unsafe workspace export target")
  const normalized = posix.normalize(posix.join(directory, target.slice(2)))
  if (normalized === directory || !normalized.startsWith(`${directory}/`) || !isTypeScriptSource(normalized)) {
    throw new Error("Workspace export target escapes its package")
  }
  return normalized
}

export const deriveWorkspaceAliases = (
  manifests: readonly WorkspaceManifest[],
): ReadonlyMap<string, string> => {
  const aliases = new Map<string, string>()
  for (const manifest of manifests) {
    const parsed = asRecord(JSON.parse(manifest.source))
    const name = parsed?.["name"]
    const exports_ = asRecord(parsed?.["exports"])
    if (typeof name !== "string" || !name.startsWith("@darkfactory/") || !exports_) continue
    for (const [subpath, declaration] of Object.entries(exports_)) {
      if (subpath !== "." && !subpath.startsWith("./")) throw new Error("Unsafe workspace export subpath")
      const target = exportTarget(declaration)
      if (!target) continue
      const alias = subpath === "." ? name : `${name}/${subpath.slice(2)}`
      if (aliases.has(alias)) throw new Error(`Duplicate workspace alias: ${alias}`)
      aliases.set(alias, safePackageTarget(manifest.directory, target))
    }
  }
  return aliases
}

const relativeModulePath = (fromFile: string, targetFile: string): string => {
  const relative = posix.relative(posix.dirname(fromFile), targetFile)
  return relative.startsWith(".") ? relative : `./${relative}`
}

export const rewriteWorkspaceAliases = (
  sourcePath: string,
  source: string,
  aliases: ReadonlyMap<string, string>,
): string => {
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const replacements: Array<Readonly<{ start: number; end: number; value: string }>> = []
  const recordSpecifier = (literal: ts.StringLiteralLike | undefined) => {
    if (!literal?.text.startsWith("@darkfactory/")) return
    const target = aliases.get(literal.text)
    if (!target) throw new Error(`Unknown workspace alias: ${literal.text}`)
    const start = literal.getStart(sourceFile)
    const quote = source[start] === "'" ? "'" : '"'
    return replacements.push({
      start,
      end: literal.getEnd(),
      value: `${quote}${relativeModulePath(sourcePath, target)}${quote}`,
    })
  }
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      recordSpecifier(node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
        ? node.moduleSpecifier
        : undefined)
    }
    else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      const argument = node.arguments[0]
      recordSpecifier(argument && ts.isStringLiteralLike(argument) ? argument : undefined)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  let rewritten = source
  for (const replacement of replacements.sort((left, right) => right.start - left.start)) {
    rewritten = `${rewritten.slice(0, replacement.start)}${replacement.value}${rewritten.slice(replacement.end)}`
  }
  return rewritten
}

export const snapshotTypeScriptSource = (
  sourcePath: string,
  source: string,
  aliases: ReadonlyMap<string, string>,
): Readonly<{ path: string; content: string }> => {
  if (!isTypeScriptSource(sourcePath)) throw new Error("Snapshot rewriter accepts TypeScript sources only")
  return Object.freeze({
    path: sourcePath,
    content: rewriteWorkspaceAliases(sourcePath, source, aliases),
  })
}
