import { createHash } from "node:crypto";
import { posix } from "node:path";
import { applyEdits, type JSONPath, modify, parse } from "jsonc-parser";
import { parse as parseYaml } from "yaml";
import { withoutOperator } from "./without-operator.ts";

// `bun run init`: pure identity validation and rename planning. Everything
// here is deterministic over its inputs; scripts/init/apply.ts performs I/O.

/** The template's own identity; init replaces every trace of it. */
export const TEMPLATE_SLUG = "darkfactory";
export const TEMPLATE_REPOSITORY = "jeffscottward/darkfactory";
/** The template's root commit: a checkout that contains it carries its history. */
export const TEMPLATE_ROOT_COMMIT = "3d98209ef4a4201c0c1468f1174d9f2af1bc4aa7";
const OWNER_WORKERS_SUBDOMAIN = "jsward-17";
/** Staging placeholder when --workers-subdomain is absent (RFC 2606 `.invalid`). */
export const WORKERS_PLACEHOLDER = "workers-subdomain.invalid";
const WORKERS_PLACEHOLDER_COMMENT = `// Placeholder: replace ${WORKERS_PLACEHOLDER} with <your-account>.workers.dev before deploying staging.`;
const FORBIDDEN_IDENTITY = /darkfactory|jeffscott|jsward/iu;
const RESET_VERSION = "0.1.0";

export type InitIdentity = Readonly<{
  /** Display name, e.g. "Acme Labs". */
  name: string;
  /** Lowercase kebab slug, e.g. "acme-labs". */
  slug: string;
  /** npm scope including "@", e.g. "@acme". */
  scope: string;
  /** Production hostname, e.g. "acme.dev". */
  domain: string;
  /** GitHub "owner/name". */
  repo: string;
  emailFrom: string;
  holder: string;
  workersSubdomain: string | undefined;
  year: number;
}>;

export type InitOptions = Readonly<{
  identity: InitIdentity;
  dryRun: boolean;
  force: boolean;
  skipInstall: boolean;
  /** Delete every `agent-sdlc` brick and its footprint. */
  withoutOperator: boolean;
  /** Replace the template's Git history with one root commit. */
  freshHistory: boolean;
}>;

export type ParsedArguments =
  | Readonly<{ kind: "help" }>
  | Readonly<{ kind: "error"; message: string }>
  | Readonly<{ kind: "options"; options: InitOptions }>;

export const INIT_USAGE = [
  "Usage: bun run init -- --name <Display Name> --slug <slug> --scope @<scope> --domain <domain>",
  '         [--repo <owner/repo>] [--email-from "<Name> <no-reply@domain>"] [--holder "<copyright holder>"]',
  "         [--workers-subdomain <subdomain>] [--without-operator] [--fresh-history]",
  "         [--dry-run] [--force] [--skip-install]",
].join("\n");

const HOST = "(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]{2,63}";
const PATTERNS = Object.freeze({
  name: /^(?=.{1,64}$)[A-Za-z][A-Za-z0-9]*(?:[ .-][A-Za-z0-9]+)*$/u,
  // The documented slug pattern, minus a trailing or doubled hyphen (hostnames).
  slug: /^(?!.*--)(?!.*-$)[a-z][a-z0-9-]{1,38}$/u,
  scope: /^(?=.{2,214}$)@[a-z0-9-~][a-z0-9-._~]*$/u,
  domain: new RegExp(`^(?=.{1,253}$)${HOST}$`, "u"),
  repo: /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/(?!\.{1,2}$)[A-Za-z0-9_.-]{1,100}$/u,
  emailFrom: new RegExp(
    `^[A-Za-z0-9](?:[A-Za-z0-9 .-]{0,98}[A-Za-z0-9.])? <[A-Za-z0-9._+-]{1,64}@${HOST}>$`,
    "u"
  ),
  holder: /^[^\u0000-\u001f\u007f<>"\\]{1,100}$/u,
  workersSubdomain: /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u,
});

const VALUE_FLAGS = [
  "name",
  "slug",
  "scope",
  "domain",
  "repo",
  "email-from",
  "holder",
  "workers-subdomain",
] as const;
type ValueFlag = (typeof VALUE_FLAGS)[number];
const BOOLEAN_FLAGS = [
  "dry-run",
  "force",
  "skip-install",
  "without-operator",
  "fresh-history",
  "help",
] as const;
type BooleanFlag = (typeof BOOLEAN_FLAGS)[number];

const isValueFlag = (flag: string): flag is ValueFlag =>
  (VALUE_FLAGS as readonly string[]).includes(flag);
const isBooleanFlag = (flag: string): flag is BooleanFlag =>
  (BOOLEAN_FLAGS as readonly string[]).includes(flag);

type Tokens = Readonly<{
  values: ReadonlyMap<ValueFlag, string>;
  flags: ReadonlySet<BooleanFlag>;
}>;

// Accepts `--flag value`, `--flag=value` and bare boolean switches.
const tokenize = (arguments_: readonly string[]): Tokens | string => {
  const values = new Map<ValueFlag, string>();
  const flags = new Set<BooleanFlag>();
  const queue = [...arguments_];
  for (
    let argument = queue.shift();
    argument !== undefined;
    argument = queue.shift()
  ) {
    const match = /^--([a-z-]+)(?:=([\s\S]*))?$/u.exec(argument);
    const flag = match?.[1] ?? "";
    const inline = match?.[2];
    if (isBooleanFlag(flag) && inline === undefined) {
      flags.add(flag);
      continue;
    }
    if (!isValueFlag(flag)) return `Unexpected argument: ${argument}`;
    if (values.has(flag)) return `Duplicate option: --${flag}`;
    const value = inline ?? queue.shift();
    if (value === undefined || value.startsWith("--")) {
      return `Missing value for --${flag}`;
    }
    values.set(flag, value.trim());
  }
  return { values, flags };
};

const identityOf = (
  values: Tokens["values"],
  year: number
): InitIdentity | string => {
  const name = values.get("name");
  const slug = values.get("slug");
  const scope = values.get("scope");
  const domain = values.get("domain");
  if (!(name && slug && scope && domain)) {
    return "--name, --slug, --scope and --domain are required";
  }
  const identity: InitIdentity = {
    name,
    slug,
    scope,
    domain,
    repo: values.get("repo") ?? `${scope.slice(1)}/${slug}`,
    emailFrom: values.get("email-from") ?? `${name} <no-reply@send.${domain}>`,
    holder: values.get("holder") ?? name,
    workersSubdomain: values.get("workers-subdomain"),
    year,
  };
  const checks = [
    ["--name", identity.name, PATTERNS.name],
    ["--slug", identity.slug, PATTERNS.slug],
    ["--scope", identity.scope, PATTERNS.scope],
    ["--domain", identity.domain, PATTERNS.domain],
    ["--repo", identity.repo, PATTERNS.repo],
    ["--email-from", identity.emailFrom, PATTERNS.emailFrom],
    ["--holder", identity.holder, PATTERNS.holder],
    [
      "--workers-subdomain",
      identity.workersSubdomain ?? "workers",
      PATTERNS.workersSubdomain,
    ],
  ] as const;
  for (const [flag, value, pattern] of checks) {
    if (!pattern.test(value)) return `Invalid ${flag}: ${value}`;
    if (FORBIDDEN_IDENTITY.test(value)) {
      return `${flag} must not reuse the template identity: ${value}`;
    }
  }
  return identity;
};

/** Parses and validates CLI arguments; every accepted value matches a strict pattern. */
export const parseInitArguments = (
  arguments_: readonly string[],
  year: number
): ParsedArguments => {
  const tokens = tokenize(arguments_);
  if (typeof tokens === "string") return { kind: "error", message: tokens };
  if (tokens.flags.has("help")) return { kind: "help" };
  const identity = identityOf(tokens.values, year);
  if (typeof identity === "string") return { kind: "error", message: identity };
  return {
    kind: "options",
    options: {
      identity,
      dryRun: tokens.flags.has("dry-run"),
      force: tokens.flags.has("force"),
      skipInstall: tokens.flags.has("skip-install"),
      withoutOperator: tokens.flags.has("without-operator"),
      freshHistory: tokens.flags.has("fresh-history"),
    },
  };
};

export type TrackedFile = Readonly<{ path: string; bytes: Uint8Array }>;
export type PlannedEdit = Readonly<{
  path: string;
  content: string;
  replacements: number;
}>;
export type PlannedRename = Readonly<{ from: string; to: string }>;
export type InitPlan = Readonly<{
  edits: readonly PlannedEdit[];
  renames: readonly PlannedRename[];
  deletions: readonly string[];
}>;

// The init tooling removes itself too: it embeds the template identity it
// replaces, and a renamed project is already initialized.
const DELETED_FILES = new Set([
  "scripts/init.ts",
  ".bestpractices.json",
  ".omp-status.md",
  "docs/evidence-map.md",
  "docs/assets/darkfactory-banner.webp",
]);
const DELETED_DIRECTORIES = [
  "scripts/init/",
  "docs/archive/",
  "docs/assessments/",
  "plans/",
];

/** Instance-only history that a new project must not inherit. */
export const isInstanceOnly = (path: string): boolean =>
  DELETED_FILES.has(path) ||
  DELETED_DIRECTORIES.some((directory) => path.startsWith(directory));

/** Git's heuristic: a NUL byte marks binary content. */
export const isBinary = (bytes: Uint8Array): boolean => bytes.includes(0);

const camel = (slug: string): string =>
  slug.replace(/-([a-z0-9])/gu, (_match, next: string) => next.toUpperCase());
const pascal = (name: string): string =>
  name
    .split(/[ .-]+/u)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join("");
const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
const anyCase = (word: string): string =>
  [...word]
    .map((char) => `[${char.toLowerCase()}${char.toUpperCase()}]`)
    .join("");

type Rule = Readonly<{
  pattern: string;
  replacement: string;
  applies?: (path: string) => boolean;
}>;

/**
 * Ordered, most specific first. They compile into ONE alternation that runs in
 * a single pass, so replacement output is never rescanned by a later rule.
 */
export const identityRules = (
  identity: InitIdentity,
  templateVersion: string | undefined
): readonly Rule[] => {
  const slugSnake = identity.slug.replaceAll("-", "_");
  const workersHost =
    identity.workersSubdomain === undefined
      ? WORKERS_PLACEHOLDER
      : `${identity.workersSubdomain}.workers.dev`;
  const rules: Rule[] = [
    { pattern: TEMPLATE_REPOSITORY, replacement: identity.repo },
    {
      pattern: "send\\.darkfactory\\.jeffscott\\.world",
      replacement: `send.${identity.domain}`,
    },
    {
      pattern: "darkfactory\\.jeffscott\\.world",
      replacement: identity.domain,
    },
    {
      pattern: `${escapeRegExp(OWNER_WORKERS_SUBDOMAIN)}\\.workers\\.dev`,
      replacement: workersHost,
    },
    { pattern: "@darkfactory/", replacement: `${identity.scope}/` },
    { pattern: "@darkfactory(?![\\w.-])", replacement: identity.scope },
    {
      pattern: "darkfactory\\.localhost",
      replacement: `${identity.slug}.localhost`,
    },
    { pattern: "DARKFACTORY_", replacement: `${slugSnake.toUpperCase()}_` },
    { pattern: "darkfactory_", replacement: `${slugSnake}_` },
    {
      pattern: "(?<=[\\w$])DarkFactory|DarkFactory(?=[\\w$])",
      replacement: pascal(identity.name),
    },
    { pattern: "DarkFactory", replacement: identity.name },
    { pattern: "darkfactory(?=[A-Z])", replacement: camel(identity.slug) },
    { pattern: "darkfactory", replacement: identity.slug },
    { pattern: "Jeff Scott Ward", replacement: identity.holder },
    { pattern: "DARKFACTORY", replacement: slugSnake.toUpperCase() },
    { pattern: anyCase(TEMPLATE_SLUG), replacement: identity.slug },
  ];
  if (templateVersion !== undefined && templateVersion !== RESET_VERSION) {
    rules.push({
      pattern: `(?<=\\bversion["']?\\s*:\\s*["']?)${escapeRegExp(templateVersion)}(?![\\w.+-])`,
      replacement: RESET_VERSION,
      applies: (path) => path !== "pnpm-lock.yaml",
    });
  }
  return rules;
};

type Rewriter = (
  path: string,
  source: string
) => Readonly<{ text: string; count: number }>;

const compileRules = (rules: readonly Rule[]): Rewriter => {
  const combined = new RegExp(
    rules.map((rule) => `(${rule.pattern})`).join("|"),
    "gu"
  );
  return (path, source) => {
    let count = 0;
    const text = source.replace(combined, (match: string, ...groups) => {
      const index = groups.findIndex((group) => group !== undefined);
      const rule = rules[index] as Rule;
      if (rule.applies !== undefined && !rule.applies(path)) return match;
      count += 1;
      return rule.replacement;
    });
    return { text, count };
  };
};

/**
 * Reads `project.<key>` from capabilities.yaml by parsing it, not by regex,
 * so no input can trigger catastrophic backtracking (CodeQL js/redos). The
 * failsafe schema keeps every scalar a string (for example `version: 1.0`).
 */
const projectFieldOf = (
  source: string,
  key: "slug" | "version"
): string | undefined => {
  let document: unknown;
  try {
    document = parseYaml(source, { schema: "failsafe" });
  } catch {
    return;
  }
  const project =
    typeof document === "object" && document !== null
      ? (document as Record<string, unknown>)["project"]
      : undefined;
  const value =
    typeof project === "object" && project !== null
      ? (project as Record<string, unknown>)[key]
      : undefined;
  return typeof value === "string" && value.length > 0 ? value : undefined;
};

const templateVersionOf = (source: string | undefined): string | undefined =>
  source === undefined ? undefined : projectFieldOf(source, "version");

/** The `project.slug` value of capabilities.yaml, or undefined. */
export const projectSlugOf = (source: string): string | undefined =>
  projectFieldOf(source, "slug");

type Structured = (
  source: string,
  context: StructuredContext
) => Readonly<{ text: string; count: number }>;
type StructuredContext = Readonly<{
  identity: InitIdentity;
  deleted: ReadonlySet<string>;
  path: string;
}>;

const JSONC_FORMAT = {
  formattingOptions: { insertSpaces: true, tabSize: 2, eol: "\n" },
} as const;

const PLACEHOLDER_LINE = new RegExp(
  `^([ \\t]*)(.*${escapeRegExp(WORKERS_PLACEHOLDER)})`,
  "mu"
);

const rewriteWrangler: Structured = (source, { identity }) => {
  let text = source;
  let count = 0;
  const set = (path: JSONPath, value: unknown): void => {
    text = applyEdits(text, modify(text, path, value, JSONC_FORMAT));
    count += 1;
  };
  const config = (parse(text) ?? {}) as {
    account_id?: unknown;
    routes?: { pattern?: unknown }[];
    vars?: Record<string, unknown>;
  };
  if ("account_id" in config) set(["account_id"], undefined);
  const route = config.routes?.[0];
  if (typeof route?.pattern === "string" && route.pattern !== identity.domain) {
    set(["routes", 0, "pattern"], identity.domain);
  }
  const wanted: Readonly<Record<string, string>> = {
    APP_URL: `https://${identity.domain}`,
    BETTER_AUTH_URL: `https://${identity.domain}`,
    EMAIL_FROM: identity.emailFrom,
  };
  for (const [key, value] of Object.entries(wanted)) {
    const current = config.vars?.[key];
    if (typeof current === "string" && current !== value) {
      set(["vars", key], value);
    }
  }
  if (!text.includes(WORKERS_PLACEHOLDER_COMMENT)) {
    text = text.replace(
      PLACEHOLDER_LINE,
      (_line, indent: string, rest: string) => {
        count += 1;
        return `${indent}${WORKERS_PLACEHOLDER_COMMENT}\n${indent}${rest}`;
      }
    );
  }
  return { text, count };
};

const rewriteCapabilities: Structured = (source, { identity }) => {
  let count = 0;
  const wanted: Readonly<Record<string, string>> = {
    name: identity.name,
    slug: identity.slug,
    version: RESET_VERSION,
  };
  const text = source.replace(/^project:\n(?:[ \t]+.*(?:\n|$))*/mu, (block) =>
    block.replace(
      /^([ \t]+)(name|slug|version):.*$/gmu,
      (line, indent: string, key: string) => {
        const next = `${indent}${key}: ${wanted[key]}`;
        if (next !== line) count += 1;
        return next;
      }
    )
  );
  return { text, count };
};

const rewriteLicense: Structured = (source, { identity }) => {
  let count = 0;
  const text = source.replace(/Copyright \(c\) \d{4}(?:-\d{4})?/u, (match) => {
    const next = `Copyright (c) ${identity.year}`;
    if (next !== match) count += 1;
    return next;
  });
  return { text, count };
};

/** A Keep-a-Changelog header with an empty Unreleased section. */
export const changelogFor = (identity: InitIdentity): string =>
  [
    "# Changelog",
    "",
    "All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).",
    "",
    "## [Unreleased]",
    "",
    `[Unreleased]: https://github.com/${identity.repo}/commits/main`,
    "",
  ].join("\n");

const rewriteChangelog: Structured = (source, { identity }) => {
  const text = changelogFor(identity);
  return { text, count: text === source ? 0 : 1 };
};

const INIT_BLOCK = /<!-- init:start -->[\s\S]*?<!-- init:end -->/gu;
const BADGE = /\[!\[[^\]]*\]\(([^)\s]*)[^)]*\)\]\(([^)\s]*)\)/gu;
const IMAGE = /!\[[^\]]*\]\(([^)\s]*)[^)]*\)/gu;
const LINK = /\[(?!!)([^\]]+)\]\(([^)\s]+)\)/gu;

const pointsAtDeleted = (
  target: string,
  context: StructuredContext
): boolean => {
  if (/^https?:\/\/(?:www\.)?bestpractices\.dev\//u.test(target)) return true;
  if (/^[a-z][a-z0-9+.-]*:|^#/iu.test(target)) return false;
  const bare = target.replace(/[?#].*$/u, "");
  const resolved = posix.normalize(
    bare.startsWith("/")
      ? bare.slice(1)
      : posix.join(posix.dirname(context.path), bare)
  );
  // A trailing "/" also matches links to (or into) deleted directories.
  return context.deleted.has(resolved) || isInstanceOnly(`${resolved}/`);
};

const rewriteMarkdown: Structured = (source, context) => {
  let count = 0;
  const withoutBlocks = source.replace(INIT_BLOCK, () => {
    count += 1;
    return "";
  });
  const kept: string[] = [];
  for (const line of withoutBlocks.split("\n")) {
    const before = count;
    const next = line
      .replace(BADGE, (match, image: string, target: string) => {
        if (
          !(pointsAtDeleted(image, context) || pointsAtDeleted(target, context))
        )
          return match;
        count += 1;
        return "";
      })
      .replace(IMAGE, (match, image: string) => {
        if (!pointsAtDeleted(image, context)) return match;
        count += 1;
        return "";
      })
      .replace(LINK, (match, label: string, target: string) => {
        if (!pointsAtDeleted(target, context)) return match;
        count += 1;
        return label;
      });
    if (count === before) {
      kept.push(line);
      continue;
    }
    const tidy = next
      .replace(/(?:\s*<br>)+\s*\|/gu, " |")
      .replace(/\|(?:\s*<br>)+\s*/gu, "| ")
      .replace(/(?:\s*<br>){2,}\s*/gu, " <br> ")
      .replace(/(\S) {2,}(?=\S)/gu, "$1 ");
    if (tidy.trim() === "") {
      if (
        /^<!-- markdownlint-disable-next-line [^>]*-->$/u.test(
          kept.at(-1) ?? ""
        )
      ) {
        kept.pop();
      }
      continue;
    }
    kept.push(tidy);
  }
  if (count === 0) return { text: source, count };
  const text = `${kept
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .replace(/^\n+/u, "")
    .replace(/\n*$/u, "")}\n`;
  return { text, count };
};

const rewriteRootManifest: Structured = (source) => {
  const manifest = parse(source) as
    | { scripts?: Record<string, unknown> }
    | undefined;
  if (manifest?.scripts?.["init"] === undefined) {
    return { text: source, count: 0 };
  }
  return {
    text: applyEdits(
      source,
      modify(source, ["scripts", "init"], undefined, JSONC_FORMAT)
    ),
    count: 1,
  };
};

const structuredFor = (path: string): Structured | undefined => {
  if (path === "package.json") return rewriteRootManifest;
  if (path === "apps/web/wrangler.jsonc") return rewriteWrangler;
  if (path === "capabilities.yaml") return rewriteCapabilities;
  if (path === "LICENSE") return rewriteLicense;
  if (path === "CHANGELOG.md") return rewriteChangelog;
  if (path.endsWith(".md")) return rewriteMarkdown;
  return undefined;
};

// Replaces every pinned digest whose pre-image the rename changed.
const repin = (
  result: Readonly<{ text: string; count: number }>,
  repinned: ReadonlyMap<string, string>
): Readonly<{ text: string; count: number }> => {
  let count = result.count;
  const text = result.text.replace(/\b[0-9a-f]{64}\b/gu, (digest) => {
    const next = repinned.get(digest);
    if (next === undefined) return digest;
    count += 1;
    return next;
  });
  return { text, count };
};

const sha256 = (text: string): string =>
  createHash("sha256").update(text).digest("hex");
const EXEC_FORM = /^(?:CMD|ENTRYPOINT)[ \t]+(\[.*\])[ \t]*$/gmu;

/**
 * Content that may be pinned elsewhere by its SHA-256: the whole file, plus
 * each Dockerfile exec-form argv (the verifier pins `JSON.stringify(argv)`).
 * Renaming changes these bytes, so their pinned digests are re-pinned.
 */
const digestInputs = (path: string, text: string): readonly string[] => [
  text,
  ...(posix.basename(path).startsWith("Dockerfile")
    ? [...text.matchAll(EXEC_FORM)].map((match) => match[1] as string)
    : []),
];

/**
 * Pure planner: given the identity and the tracked files, returns the edits,
 * renames and deletions that produce a renamed project, without the
 * agent-SDLC plane when asked. Planning its own output again yields an empty
 * plan.
 */
export const planInit = (
  identity: InitIdentity,
  files: readonly TrackedFile[],
  options: Readonly<{ withoutOperator?: boolean }> = {}
): InitPlan => {
  const decoder = new TextDecoder("utf-8");
  const texts = new Map<string, string | undefined>();
  for (const file of files) {
    texts.set(
      file.path,
      isBinary(file.bytes) ? undefined : decoder.decode(file.bytes)
    );
  }
  const pruned = options.withoutOperator
    ? withoutOperator(texts)
    : { removed: new Set<string>(), texts };
  const rewrite = compileRules(
    identityRules(identity, templateVersionOf(texts.get("capabilities.yaml")))
  );
  const deletions = files
    .map((file) => file.path)
    .filter((path) => isInstanceOnly(path) || pruned.removed.has(path))
    .sort();
  // Links may already carry the renamed path by the time Markdown is tidied.
  const deleted = new Set(
    deletions.flatMap((path) => [path, rewrite(path, path).text])
  );
  const renames: PlannedRename[] = [];
  const kept = new Set(
    files.map((file) => file.path).filter((path) => !deleted.has(path))
  );
  const rewritten = new Map<string, { text: string; count: number }>();
  const repinned = new Map<string, string>();
  for (const path of [...kept].sort()) {
    const renamed = rewrite(path, path).text;
    if (renamed !== path) {
      if (kept.has(renamed)) {
        throw new Error(`Rename target already exists: ${path} -> ${renamed}`);
      }
      renames.push({ from: path, to: renamed });
    }
    const original = texts.get(path);
    if (original === undefined) continue;
    // Kept text files always have (possibly pruned) text.
    const source = pruned.texts.get(path) as string;
    const replaced = rewrite(path, source);
    const structured = structuredFor(path)?.(replaced.text, {
      identity,
      deleted,
      path,
    }) ?? { text: replaced.text, count: 0 };
    rewritten.set(path, {
      text: structured.text,
      count: replaced.count + structured.count + (source === original ? 0 : 1),
    });
    const before = digestInputs(path, original);
    const after = digestInputs(path, structured.text);
    before.forEach((input, index) => {
      const next = after[index];
      if (next !== undefined && next !== input) {
        repinned.set(sha256(input), sha256(next));
      }
    });
  }
  const edits: PlannedEdit[] = [];
  for (const [path, result] of rewritten) {
    const { text, count } = repin(result, repinned);
    if (text !== texts.get(path)) {
      edits.push({ path, content: text, replacements: count });
    }
  }
  return { edits, renames, deletions };
};

/** Human-readable dry-run report. */
export const describePlan = (plan: InitPlan): readonly string[] => {
  const replacements = plan.edits.reduce(
    (total, edit) => total + edit.replacements,
    0
  );
  return [
    `Edit ${plan.edits.length} files (${replacements} replacements), rename ${plan.renames.length}, delete ${plan.deletions.length}.`,
    ...plan.edits.map(
      (edit) => `  edit    ${edit.path} (${edit.replacements})`
    ),
    ...plan.renames.map((rename) => `  rename  ${rename.from} -> ${rename.to}`),
    ...plan.deletions.map((path) => `  delete  ${path}`),
  ];
};
