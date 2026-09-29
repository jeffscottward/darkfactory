import { posix } from "node:path";
import {
  applyEdits,
  getNodePath,
  modify,
  type Node,
  parse,
  parseTree,
} from "jsonc-parser";

// `bun run init --without-operator` drops the opt-in agent-SDLC plane. The
// packages to delete are the workspace packages whose package.json `brick` is
// `agent-sdlc`. Everything else is derived from them: root scripts and
// dependencies, tests that import them, config globs and doc lines that cite
// them, and their `docs/<package>.md` page. Only the env keys are named here.
// Pure; planInit applies the result.

const OPERATOR_BRICK = "agent-sdlc";
/** Env keys that only the agent plane reads (.env.example, config schema). */
const OPERATOR_ENV = /^(?:WORKFLOW|OMP)_[A-Z0-9_]+$/u;

export type Texts = ReadonlyMap<string, string | undefined>;
export type OperatorRemoval = Readonly<{
  /** Tracked paths to delete. */
  removed: ReadonlySet<string>;
  /** Every kept path, with rewritten text where the plane was cited. */
  texts: Texts;
}>;

type Footprint = Readonly<{
  directories: readonly string[];
  names: readonly string[];
  scripts: readonly string[];
  removed: ReadonlySet<string>;
}>;

const WORKSPACE_MANIFEST = /^(?:apps|packages)\/[^/]+\/package\.json$/u;
const CODE = /\.[cm]?[jt]sx?$/u;
const TEST = /\.(?:test|spec)\.[cm]?[jt]sx?$/u;
const DEPENDENCY_FIELDS = [
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
] as const;
const JSONC_FORMAT = {
  formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
} as const;

const recordOf = (value: unknown): Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const inside = (path: string, directories: readonly string[]): boolean =>
  directories.some(
    (directory) => path === directory || path.startsWith(`${directory}/`)
  );

/** True when one token (a path, package name, script or env key) names the plane. */
const citesToken = (token: string, footprint: Footprint): boolean => {
  const path = token.replace(/[#?].*$/u, "").replace(/\/$/u, "");
  return (
    footprint.removed.has(path) ||
    inside(path, footprint.directories) ||
    footprint.names.some(
      (name) => token === name || token.startsWith(`${name}/`)
    ) ||
    footprint.scripts.includes(token) ||
    OPERATOR_ENV.test(token)
  );
};

const citesLink = (
  target: string,
  from: string,
  footprint: Footprint
): boolean => {
  if (/^[a-z][a-z0-9+.-]*:|^#/iu.test(target)) return false;
  const bare = target.replace(/[?#].*$/u, "");
  const resolved = posix.normalize(
    bare.startsWith("/") ? bare.slice(1) : posix.join(posix.dirname(from), bare)
  );
  return citesToken(resolved, footprint);
};

const LINK = /\[[^\]]*\]\(([^)\s]+)[^)]*\)/gu;
const CODE_SPAN = /`([^`]+)`/gu;
// A link that is one item of a comma-separated list goes with its comma.
const LISTED_LINK = [
  /,\s*\[[^\]]*\]\(([^)\s]+)\)/gu,
  /\[[^\]]*\]\(([^)\s]+)\),\s*/gu,
] as const;
const SENTENCE = /(?<=[.!?][*_)"']*)\s+(?=[A-Z*_`[(])/u;
const BLOCK_ITEM = /^\s*(?:\||[-*+]\s|\d+\.\s)/u;
const FENCE = /^\s*(?:```|~~~)/u;

const mentions = (text: string, from: string, footprint: Footprint) =>
  [...text.matchAll(CODE_SPAN)].some((match) =>
    (match[1] as string)
      .split(/\s+/u)
      .some((token) => citesToken(token, footprint))
  ) ||
  [...text.matchAll(LINK)].some((match) =>
    citesLink(match[1] as string, from, footprint)
  );

/**
 * One line outside code fences: a listed link goes with its comma, a table
 * row or list item that cites the plane goes whole, and a paragraph loses
 * the sentences that cite it. Undefined drops the line.
 */
const pruneLine = (
  line: string,
  from: string,
  footprint: Footprint
): string | undefined => {
  const text = LISTED_LINK.reduce(
    (current, pattern) =>
      current.replace(pattern, (match, target: string) =>
        citesLink(target, from, footprint) ? "" : match
      ),
    line
  );
  if (!mentions(text, from, footprint)) return text;
  if (BLOCK_ITEM.test(text)) return;
  const prefix = (/^\s*(?:>\s*|#{1,6}\s+)?/u.exec(text) as RegExpExecArray)[0];
  const sentences = text
    .slice(prefix.length)
    .split(SENTENCE)
    .filter((sentence) => !mentions(sentence, from, footprint));
  return sentences.length === 0 ? undefined : `${prefix}${sentences.join(" ")}`;
};

const pruneMarkdown = (
  source: string,
  from: string,
  footprint: Footprint
): string => {
  const kept: string[] = [];
  let fenced = false;
  let dropped = false;
  for (const line of source.split("\n")) {
    const fence = FENCE.test(line);
    if (fence) fenced = !fenced;
    const next = fence || fenced ? line : pruneLine(line, from, footprint);
    if (next === undefined) {
      dropped = true;
      continue;
    }
    // Dropping a paragraph must not leave two blank lines behind.
    if (!(dropped && next === "" && kept.at(-1) === "")) kept.push(next);
    dropped = false;
  }
  return kept.join("\n");
};

/** Removes the plane's keys, their comments and any section left empty. */
const pruneEnvironment = (source: string): string => {
  const kept: string[] = [];
  for (const line of source.split("\n")) {
    const key = /^([A-Z][A-Z0-9_]*)=/u.exec(line)?.[1];
    if (key === undefined || !OPERATOR_ENV.test(key)) {
      kept.push(line);
      continue;
    }
    while (/^#(?! ---)/u.test(kept.at(-1) ?? "")) kept.pop();
  }
  return kept
    .join("\n")
    .replace(/^# --- .*\n+(?=# --- |$(?![\s\S]))/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/\n+$/u, "\n");
};

const ENV_PROPERTY = /^\s*([A-Z][A-Z0-9_]*):\s.*,\s*$/u;

/** Removes single-line `WORKFLOW_*: …,` properties (schemas and fixtures). */
const pruneCode = (source: string): string =>
  source
    .split("\n")
    .filter((line) => !OPERATOR_ENV.test(ENV_PROPERTY.exec(line)?.[1] ?? ""))
    .join("\n");

const remove = (text: string, path: (string | number)[]): string =>
  applyEdits(text, modify(text, path, undefined, JSONC_FORMAT));

/** Drops dependencies on the plane and, at the root, its scripts. */
const pruneManifest = (
  source: string,
  from: string,
  footprint: Footprint
): string => {
  const manifest = recordOf(parse(source));
  let text = source;
  for (const field of DEPENDENCY_FIELDS) {
    for (const name of Object.keys(recordOf(manifest[field]))) {
      if (footprint.names.includes(name)) text = remove(text, [field, name]);
    }
  }
  if (from !== "package.json") return text;
  for (const script of footprint.scripts) {
    text = remove(text, ["scripts", script]);
  }
  return text;
};

/**
 * Drops what cites the plane from JSON(C) config: array strings (lint
 * overrides, ignore lists) and object keys with their values (knip
 * workspaces). An `includes` list left empty takes its whole override with it.
 */
const pruneJson = (source: string, footprint: Footprint): string => {
  const doomed: Node[] = [];
  const cites = (node: Node): boolean =>
    node.type === "string" && citesToken(node.value as string, footprint);
  const visit = (node: Node): void => {
    const children = node.children ?? [];
    if (node.type === "object") {
      // Tracked config is well-formed, so every property has a key and a value.
      for (const property of children) {
        const [key, value] = property.children as [Node, Node];
        if (cites(key)) doomed.push(value);
        else visit(value);
      }
      return;
    }
    const cited = children.filter(cites);
    const owner = node.parent?.parent;
    if (
      cited.length > 0 &&
      cited.length === children.length &&
      node.parent?.type === "property" &&
      node.parent.children?.[0]?.value === "includes" &&
      owner?.parent?.type === "array"
    ) {
      doomed.push(owner);
      return;
    }
    doomed.push(...cited);
    for (const child of children) visit(child);
  };
  const root = parseTree(source);
  if (root !== undefined) visit(root);
  return doomed
    .sort((left, right) => right.offset - left.offset)
    .reduce((text, node) => remove(text, getNodePath(node)), source);
};

// Root scripts named `<package>:*`, or whose command cites the plane.
const rootScriptsOf = (
  root: string | undefined,
  footprint: Footprint,
  shortNames: readonly string[]
): readonly string[] =>
  Object.entries(recordOf(recordOf(parse(root ?? ""))["scripts"]))
    .filter(
      ([script, command]) =>
        shortNames.some((name) => script.startsWith(`${name}:`)) ||
        String(command)
          .split(/\s+/u)
          .some((token) => citesToken(token, footprint))
    )
    .map(([script]) => script);

const rewrite = (path: string, text: string, footprint: Footprint): string => {
  if (posix.basename(path) === "package.json") {
    return pruneManifest(text, path, footprint);
  }
  if (path.endsWith(".md")) return pruneMarkdown(text, path, footprint);
  if (/(?:^|\/)\.env\.example$/u.test(path)) return pruneEnvironment(text);
  if (/\.jsonc?$/u.test(path)) return pruneJson(text, footprint);
  if (CODE.test(path)) return pruneCode(text);
  return text;
};

/** Plans the removal of every `agent-sdlc` brick; throws if product code imports one. */
export const withoutOperator = (texts: Texts): OperatorRemoval => {
  const bricks = [...texts].flatMap(([path, text]) => {
    if (!WORKSPACE_MANIFEST.test(path)) return [];
    const manifest = recordOf(parse(text ?? ""));
    const name = manifest["name"];
    return manifest["brick"] === OPERATOR_BRICK && typeof name === "string"
      ? [{ name, directory: posix.dirname(path) }]
      : [];
  });
  const directories = bricks.map((brick) => brick.directory);
  const names = bricks.map((brick) => brick.name);
  const shortNames = names.map((name) => name.slice(name.indexOf("/") + 1));
  // Real import statements and calls only; a fixture string that quotes an
  // import keeps its file.
  const target = `["'](?:${names.map((name) => name.replaceAll(".", "\\.")).join("|")})(?:/[^"'\\n]*)?["']`;
  const importer =
    names.length === 0
      ? undefined
      : new RegExp(
          [
            `^\\s*(?:import|export)\\b[^\\n]*?\\bfrom\\s*${target}`,
            `^\\s*\\}\\s*from\\s*${target}`,
            `^\\s*import\\s*${target}`,
            `^(?!\\s*["'\`])[^\\n]*?\\b(?:import|require|mock|doMock|importActual)\\s*\\(\\s*${target}`,
          ].join("|"),
          "mu"
        );
  const removed = new Set<string>();
  for (const [path, text] of texts) {
    if (
      inside(path, directories) ||
      shortNames.some((name) => path === `docs/${name}.md`)
    ) {
      removed.add(path);
    } else if (CODE.test(path) && importer?.test(text ?? "")) {
      if (!TEST.test(path)) {
        throw new Error(
          `${path} imports an ${OPERATOR_BRICK} package; move that code out of the product before --without-operator.`
        );
      }
      removed.add(path);
    }
  }
  const cited: Footprint = { directories, names, scripts: [], removed };
  const footprint: Footprint = {
    ...cited,
    scripts: rootScriptsOf(texts.get("package.json"), cited, shortNames),
  };
  const kept = new Map<string, string | undefined>();
  for (const [path, text] of texts) {
    if (removed.has(path)) continue;
    kept.set(path, text === undefined ? text : rewrite(path, text, footprint));
  }
  return { removed, texts: kept };
};
