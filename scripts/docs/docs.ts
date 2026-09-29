import { dirname } from "node:path";

export const GENERATED_PACKAGE_GRAPH_PATH = "docs/generated/package-graph.md";

/** Every workspace package.json declares one role; the root is the workspace. */
export const BRICK_ROLES = [
  "workspace",
  "app",
  "product",
  "capability",
  "agent-sdlc",
  "tooling",
] as const;
export type BrickRole = (typeof BRICK_ROLES)[number];

const DEPENDENCY_SECTIONS = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
  "optionalDependencies",
] as const;

/**
 * Which roles each role may depend on. Nothing depends on an app, capability
 * bricks stand alone, and product bricks never reach into the opt-in agent plane.
 */
const ALLOWED_BRICK_DEPENDENCIES: Readonly<
  Record<BrickRole, readonly BrickRole[]>
> = {
  workspace: ["app", "product", "capability", "agent-sdlc", "tooling"],
  app: ["product", "capability", "tooling"],
  product: ["product", "capability", "tooling"],
  capability: ["tooling"],
  "agent-sdlc": ["product", "capability", "agent-sdlc", "tooling"],
  tooling: ["product", "capability", "tooling"],
};

/** Flowchart group per role, in render order. The root workspace is table-only. */
const GROUPS: readonly Readonly<{
  role: Exclude<BrickRole, "workspace">;
  title: string;
  className: string;
  style: string;
}>[] = [
  {
    role: "app",
    title: "Apps",
    className: "app",
    style: "fill:#1f6feb,stroke:#0b3d91,color:#ffffff",
  },
  {
    role: "product",
    title: "Product bricks",
    className: "product",
    style: "fill:#2ea44f,stroke:#1a7f37,color:#ffffff",
  },
  {
    role: "capability",
    title: "Capability bricks",
    className: "capability",
    style: "fill:#bf8700,stroke:#7d4e00,color:#ffffff",
  },
  {
    role: "agent-sdlc",
    title: "Agent-SDLC bricks (opt-in)",
    className: "agentSdlc",
    style: "fill:#8250df,stroke:#512a97,color:#ffffff",
  },
  {
    role: "tooling",
    title: "Tooling",
    className: "tooling",
    style: "fill:#6e7781,stroke:#424a53,color:#ffffff",
  },
];

export type PackageManifestSource = Readonly<{ path: string; source: string }>;
type GraphPackage = Readonly<{
  name: string;
  brick: BrickRole;
  description: string;
  directory: string;
  publicExports: readonly string[];
  workspaceDependencies: readonly string[];
}>;
export type PackageGraph = Readonly<{ packages: readonly GraphPackage[] }>;
export type DocsFileSystem = Readonly<{
  discoverPackageManifests: () => Promise<readonly PackageManifestSource[]>;
  /** Tracked and untracked-but-unignored file paths (`git ls-files`). */
  listRepositoryFiles: () => Promise<readonly string[]>;
  /** The subset of `paths` that .gitignore covers: local or generated files. */
  listIgnoredPaths: (paths: readonly string[]) => Promise<readonly string[]>;
  /** Bounded read; `undefined` for a missing path or a symbolic link. */
  readFile: (path: string) => Promise<string | undefined>;
  writeGenerated: (path: string, content: string) => Promise<void>;
}>;
export type DocsDependencies = Readonly<{ files: DocsFileSystem }>;
export type DocsReport = Readonly<{
  action: "generate" | "check";
  ok: boolean;
  changed: boolean;
  reason: string;
  packageCount: number | undefined;
  problems?: readonly string[];
}>;

type JsonRecord = Record<string, unknown>;
const asRecord = (value: unknown): JsonRecord | null => {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
};

const stringRecord = (value: unknown): Record<string, unknown> =>
  asRecord(value) ?? {};

const isBrickRole = (value: unknown): value is BrickRole =>
  BRICK_ROLES.some((role) => role === value);

/** One plain line that is safe inside a Mermaid label and a Markdown table cell. */
const DESCRIPTION = /^[^"<>|`\\\r\n]{1,80}$/;

const parseManifest = (path: string, source: string): JsonRecord => {
  try {
    const parsed = asRecord(JSON.parse(source));
    if (parsed !== null) return parsed;
  } catch {
    // Reported below with the manifest path.
  }
  throw new Error(`Invalid package manifest: ${path}`);
};

export const buildPackageGraph = (
  manifests: readonly PackageManifestSource[]
): PackageGraph => {
  const names = new Set<string>();
  const packages = manifests
    .map(({ path, source }): GraphPackage => {
      const parsed = parseManifest(path, source);
      const name = parsed["name"];
      if (typeof name !== "string" || name.length === 0) {
        throw new Error(`Invalid package manifest: ${path}`);
      }
      if (names.has(name)) throw new Error(`Duplicate package name: ${name}`);
      names.add(name);
      const directory = dirname(path).replaceAll("\\", "/");
      const brick = parsed["brick"];
      if (
        !isBrickRole(brick) ||
        (brick === "workspace") !== (directory === ".")
      ) {
        throw new Error(
          `Package manifest lacks a valid brick role: ${path} (root: "workspace"; packages: ${BRICK_ROLES.slice(1).join(", ")})`
        );
      }
      const description = parsed["description"];
      if (typeof description !== "string" || !DESCRIPTION.test(description)) {
        throw new Error(
          `Package manifest lacks a one-line description (max 80 characters, no quotes, angle brackets, pipes or backticks): ${path}`
        );
      }
      const workspaceDependencies = new Set(
        DEPENDENCY_SECTIONS.flatMap((section) =>
          Object.entries(stringRecord(parsed[section]))
            .filter(
              ([, range]) =>
                typeof range === "string" && range.startsWith("workspace:")
            )
            .map(([dependency]) => dependency)
        )
      );
      return Object.freeze({
        name,
        brick,
        description,
        directory,
        publicExports: Object.freeze(
          Object.keys(stringRecord(parsed["exports"])).sort()
        ),
        workspaceDependencies: Object.freeze([...workspaceDependencies].sort()),
      });
    })
    .sort((left, right) => (left.name < right.name ? -1 : 1));
  const roles = new Map(packages.map(({ name, brick }) => [name, brick]));
  for (const entry of packages) {
    for (const dependency of entry.workspaceDependencies) {
      const role = roles.get(dependency);
      if (role === undefined) {
        throw new Error(
          `Unknown workspace dependency ${dependency} in ${entry.directory}/package.json`
        );
      }
      if (!ALLOWED_BRICK_DEPENDENCIES[entry.brick].includes(role)) {
        throw new Error(
          `Brick rule violation: ${entry.name} (${entry.brick}) must not depend on ${dependency} (${role})`
        );
      }
    }
  }
  return Object.freeze({ packages: Object.freeze(packages) });
};

const nodeId = (name: string): string =>
  name.replaceAll(/[^A-Za-z0-9]/g, "_").replace(/^_+/, "");

const code = (values: readonly string[]): string =>
  values.length === 0 ? "—" : values.map((value) => `\`${value}\``).join(", ");

export const renderPackageGraph = (graph: PackageGraph): string => {
  const flowchart: string[] = ["flowchart LR"];
  const rows: string[] = [];
  const bricks = graph.packages.filter(({ brick }) => brick !== "workspace");
  for (const group of GROUPS) {
    const members = bricks.filter(({ brick }) => brick === group.role);
    if (members.length === 0) continue;
    flowchart.push(`  subgraph ${group.className}Bricks["${group.title}"]`);
    for (const entry of members) {
      flowchart.push(
        `    ${nodeId(entry.name)}["<b>${entry.name.slice(entry.name.indexOf("/") + 1)}</b><br/>${entry.description}"]`
      );
    }
    flowchart.push("  end");
  }
  for (const entry of bricks) {
    for (const dependency of entry.workspaceDependencies) {
      flowchart.push(`  ${nodeId(entry.name)} --> ${nodeId(dependency)}`);
    }
  }
  for (const group of GROUPS) {
    const members = bricks.filter(({ brick }) => brick === group.role);
    if (members.length === 0) continue;
    flowchart.push(`  classDef ${group.className} ${group.style}`);
    flowchart.push(
      `  class ${members.map(({ name }) => nodeId(name)).join(",")} ${group.className}`
    );
  }
  for (const entry of [...graph.packages].sort(
    (left, right) =>
      BRICK_ROLES.indexOf(left.brick) - BRICK_ROLES.indexOf(right.brick)
  )) {
    const manifest =
      entry.directory === "."
        ? "package.json"
        : `${entry.directory}/package.json`;
    rows.push(
      `| [\`${entry.name}\`](../../${manifest}) | ${entry.brick} | ${entry.description} | ${code(entry.workspaceDependencies)} | ${code(entry.publicExports)} |`
    );
  }
  return [
    "<!-- Generated by `bun run docs:generate` from every workspace package.json. Do not edit by hand. -->",
    "",
    "# Package graph",
    "",
    "Every workspace `package.json` declares a `brick` role and a one-line `description`. Arrows point from a package to the workspace package it depends on. `bun run docs:check` fails when this file is stale, a package lacks a valid `brick` or `description`, a dependency breaks the brick rules below (`ALLOWED_BRICK_DEPENDENCIES` in `scripts/docs/docs.ts`), or a package imports a workspace package it does not declare. Knip fails on declared dependencies that nothing imports, so every arrow is a real import.",
    "",
    "```mermaid",
    ...flowchart,
    "```",
    "",
    "## Brick rules",
    "",
    "| Brick | May depend on |",
    "| --- | --- |",
    ...BRICK_ROLES.map(
      (role) => `| ${role} | ${ALLOWED_BRICK_DEPENDENCIES[role].join(", ")} |`
    ),
    "",
    "## Packages",
    "",
    "| Package | Brick | Purpose | Workspace dependencies | Exports |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
};

/** Specifiers in import/export, dynamic import, require and Vitest mocks. */
const WORKSPACE_IMPORT =
  /(?<=\b(?:from|import|require|mock|doMock|importActual)\s*\(?\s*["'])@darkfactory\/[\w.-]+/g;
const SOURCE_FILE = /\.(?:[cm]?[jt]sx?|css)$/;
const firstSegment = (path: string): string => path.split("/", 1).join("");

/**
 * Brick boundaries apply to real imports: the root package.json declares every
 * workspace package, so any file can resolve any brick. A file under a
 * workspace package may import only its own package or one it declares, and
 * declarations already obey ALLOWED_BRICK_DEPENDENCIES.
 */
const findUndeclaredImports = async (
  graph: PackageGraph,
  paths: readonly string[],
  files: DocsFileSystem
): Promise<string[]> => {
  const owners = new Map(
    graph.packages.map((entry) => [entry.directory, entry])
  );
  const problems = new Set<string>();
  for (const path of paths) {
    const owner = owners.get(path.split("/", 2).join("/"));
    if (owner === undefined || !SOURCE_FILE.test(path)) continue;
    const source = (await files.readFile(path)) ?? "";
    for (const [specifier] of source.matchAll(WORKSPACE_IMPORT)) {
      if (
        specifier !== owner.name &&
        !owner.workspaceDependencies.includes(specifier)
      ) {
        problems.add(
          `${path} imports ${specifier}, which ${owner.directory}/package.json does not declare`
        );
      }
    }
  }
  return [...problems];
};

const SKIPPED_MARKDOWN = /^(?:docs\/archive\/|CHANGELOG\.md$)/;
const FENCE = /^\s*(?:```|~~~)/;
const INLINE_CODE = /`[^`\n]+`/g;
const NOT_A_PATH = /[\s*<>{}$|=,;"'\\]|:\/\//;
const LINE_SUFFIX = /(?::\d+(?:-\d+)?|#L\d+(?:-L?\d+)?)$/;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;

/** Inline code spans outside fenced blocks, without their backticks. */
const inlineCode = (markdown: string): string[] => {
  const spans: string[] = [];
  let fenced = false;
  for (const line of markdown.split("\n")) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced) {
      for (const [span] of line.matchAll(INLINE_CODE))
        spans.push(span.slice(1, -1));
    }
  }
  return spans;
};

type DocPath = Readonly<{ target: string; query: string; symbol: string }>;

/** Every listed file plus each of its ancestor directories. */
const withDirectories = (paths: readonly string[]): Set<string> => {
  const known = new Set(paths);
  for (const path of paths) {
    for (let end = path.indexOf("/"); end > 0; end = path.indexOf("/", end + 1))
      known.add(path.slice(0, end));
  }
  return known;
};

/**
 * Resolves an inline code span to a repository path, or `undefined` when it is
 * not one. A path resolves from the repository root, or from the Markdown
 * file's directory (`base`) when its first segment is a directory there.
 */
const resolveDocPath = (
  span: string,
  base: string,
  known: ReadonlySet<string>
): DocPath | undefined => {
  const reference = span.trim().replace(/^\.\//, "").replace(LINE_SUFFIX, "");
  if (!reference.includes("/") || NOT_A_PATH.test(reference)) return;
  const hash = reference.indexOf("#");
  const location = hash === -1 ? reference : reference.slice(0, hash);
  const relative = location.replace(/\/$/, "");
  const first = firstSegment(relative);
  const target =
    !known.has(first) && known.has(`${base}${first}`)
      ? `${base}${relative}`
      : relative;
  if (!known.has(firstSegment(target))) return;
  return {
    target,
    query: location.endsWith("/") ? `${target}/` : target,
    symbol: hash === -1 ? "" : reference.slice(hash + 1),
  };
};

/** A `#symbol` suffix on a source path must name an identifier the file contains. */
const namesMissingSymbol = async (
  { target, symbol }: DocPath,
  files: DocsFileSystem
): Promise<boolean> => {
  if (!IDENTIFIER.test(symbol) || target.endsWith(".md")) return false;
  const source = (await files.readFile(target)) ?? "";
  const name = symbol.replaceAll("$", "\\$");
  return !new RegExp(`(?<![\\w$])${name}(?![\\w$])`).test(source);
};

/**
 * Backticked repository paths in Markdown must exist or be covered by
 * .gitignore (local and generated files). Archived docs and the changelog
 * record history, so they are skipped.
 */
const findBrokenDocPaths = async (
  paths: readonly string[],
  files: DocsFileSystem
): Promise<string[]> => {
  const known = withDirectories(paths);
  const missing = new Map<string, string[]>();
  const problems: string[] = [];
  const documents = paths.filter(
    (path) => path.endsWith(".md") && !SKIPPED_MARKDOWN.test(path)
  );
  for (const document of documents) {
    const base = document.slice(0, document.lastIndexOf("/") + 1);
    for (const span of inlineCode((await files.readFile(document)) ?? "")) {
      const path = resolveDocPath(span, base, known);
      if (path === undefined) continue;
      const problem = `${document}: \`${span}\``;
      if (!known.has(path.target)) {
        const messages = missing.get(path.query) ?? [];
        missing.set(path.query, [...messages, `${problem} does not exist`]);
      } else if (await namesMissingSymbol(path, files)) {
        problems.push(
          `${problem} names ${path.symbol}, which ${path.target} does not contain`
        );
      }
    }
  }
  const ignored = new Set(await files.listIgnoredPaths([...missing.keys()]));
  for (const [query, messages] of missing) {
    if (!ignored.has(query)) problems.push(...messages);
  }
  return problems;
};

const report = (
  action: "generate" | "check",
  ok: boolean,
  changed: boolean,
  reason: string,
  packageCount?: number,
  problems?: readonly string[]
): DocsReport =>
  Object.freeze({
    action,
    ok,
    changed,
    reason,
    packageCount,
    ...(problems === undefined ? {} : { problems: Object.freeze(problems) }),
  });

export const runDocsAction = async (
  action: "generate" | "check",
  dependencies: DocsDependencies
): Promise<DocsReport> => {
  try {
    const manifests = await dependencies.files.discoverPackageManifests();
    const graph = buildPackageGraph(manifests);
    const count = graph.packages.length;
    const expected = renderPackageGraph(graph);
    const current = await dependencies.files.readFile(
      GENERATED_PACKAGE_GRAPH_PATH
    );
    if (action === "check") {
      if (current !== expected) {
        return report(
          action,
          false,
          false,
          "Generated package graph is stale or missing; run bun run docs:generate",
          count
        );
      }
      const paths = await dependencies.files.listRepositoryFiles();
      const problems = [
        ...(await findUndeclaredImports(graph, paths, dependencies.files)),
        ...(await findBrokenDocPaths(paths, dependencies.files)),
      ];
      return problems.length === 0
        ? report(
            action,
            true,
            false,
            "Package graph, brick imports and doc paths are current",
            count
          )
        : report(
            action,
            false,
            false,
            "Undeclared brick imports or broken doc paths; see problems",
            count,
            problems
          );
    }
    if (current === expected) {
      return report(
        action,
        true,
        false,
        "Generated package graph is already current",
        count
      );
    }
    await dependencies.files.writeGenerated(
      GENERATED_PACKAGE_GRAPH_PATH,
      expected
    );
    return report(
      action,
      true,
      true,
      "Generated package graph was updated",
      count
    );
  } catch (error) {
    return report(
      action,
      false,
      false,
      error instanceof Error ? error.message : "Documentation generation failed"
    );
  }
};
