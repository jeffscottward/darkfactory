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
export const ALLOWED_BRICK_DEPENDENCIES: Readonly<
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
export type GraphPackage = Readonly<{
  name: string;
  brick: BrickRole;
  directory: string;
  publicExports: readonly string[];
  workspaceDependencies: readonly string[];
}>;
export type PackageGraph = Readonly<{ packages: readonly GraphPackage[] }>;
export type DocsFileSystem = Readonly<{
  discoverPackageManifests: () => Promise<readonly PackageManifestSource[]>;
  readGenerated: (path: string) => Promise<string | undefined>;
  writeGenerated: (path: string, content: string) => Promise<void>;
}>;
export type DocsDependencies = Readonly<{ files: DocsFileSystem }>;
export type DocsReport = Readonly<{
  action: "generate" | "check";
  ok: boolean;
  changed: boolean;
  reason: string;
  packageCount: number | undefined;
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
        `    ${nodeId(entry.name)}["${entry.name.slice(entry.name.indexOf("/") + 1)}<br/>${entry.directory}"]`
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
      `| [\`${entry.name}\`](../../${manifest}) | ${entry.brick} | ${code(entry.workspaceDependencies)} | ${code(entry.publicExports)} |`
    );
  }
  return [
    "<!-- Generated by `bun run docs:generate` from every workspace package.json. Do not edit by hand. -->",
    "",
    "# Package graph",
    "",
    "Every workspace `package.json` declares a `brick` role. Arrows point from a package to the workspace package it depends on. `bun run docs:check` fails when this file is stale, a package lacks a valid `brick`, or a dependency breaks the brick rules below (`ALLOWED_BRICK_DEPENDENCIES` in `scripts/docs/docs.ts`).",
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
    "| Package | Brick | Workspace dependencies | Exports |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
  ].join("\n");
};

const report = (
  action: "generate" | "check",
  ok: boolean,
  changed: boolean,
  reason: string,
  packageCount?: number
): DocsReport => Object.freeze({ action, ok, changed, reason, packageCount });

export const runDocsAction = async (
  action: "generate" | "check",
  dependencies: DocsDependencies
): Promise<DocsReport> => {
  try {
    const manifests = await dependencies.files.discoverPackageManifests();
    const graph = buildPackageGraph(manifests);
    const count = graph.packages.length;
    const expected = renderPackageGraph(graph);
    const current = await dependencies.files.readGenerated(
      GENERATED_PACKAGE_GRAPH_PATH
    );
    if (action === "check") {
      return current === expected
        ? report(
            action,
            true,
            false,
            "Generated package graph is current",
            count
          )
        : report(
            action,
            false,
            false,
            "Generated package graph is stale or missing; run bun run docs:generate",
            count
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
