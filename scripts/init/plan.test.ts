import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  changelogFor,
  describePlan,
  type InitIdentity,
  type InitPlan,
  identityRules,
  isBinary,
  isInstanceOnly,
  type ParsedArguments,
  parseInitArguments,
  planInit,
  projectSlugOf,
  type TrackedFile,
  WORKERS_PLACEHOLDER,
} from "./plan.ts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const YEAR = 2031;
const REQUIRED = [
  "--name",
  "Acme Labs",
  "--slug",
  "acme-labs",
  "--scope",
  "@acme",
  "--domain",
  "acme.dev",
];

// Replaces a required option's value, or appends an optional one.
const withOption = (flag: string, value: string): string[] => {
  const target = [...REQUIRED];
  const index = target.indexOf(flag);
  if (index < 0) return [...target, flag, value];
  target[index + 1] = value;
  return target;
};

const identity = (overrides: Partial<InitIdentity> = {}): InitIdentity => ({
  name: "Acme Labs",
  slug: "acme-labs",
  scope: "@acme",
  domain: "acme.dev",
  repo: "acme/acme-labs",
  emailFrom: "Acme Labs <no-reply@send.acme.dev>",
  holder: "Acme Labs",
  workersSubdomain: undefined,
  year: YEAR,
  ...overrides,
});

const files = (entries: Readonly<Record<string, string | Uint8Array>>) =>
  Object.entries(entries).map(
    ([path, content]): TrackedFile => ({
      path,
      bytes: typeof content === "string" ? encoder.encode(content) : content,
    })
  );

const contentOf = (plan: InitPlan, path: string): string | undefined =>
  plan.edits.find((edit) => edit.path === path)?.content;

// Applies a plan to an in-memory file list, mirroring apply.ts.
const applied = (
  input: readonly TrackedFile[],
  plan: InitPlan
): readonly TrackedFile[] => {
  const byPath = new Map(input.map((file) => [file.path, file.bytes]));
  for (const edit of plan.edits) {
    byPath.set(edit.path, encoder.encode(edit.content));
  }
  for (const { from, to } of plan.renames) {
    byPath.set(to, byPath.get(from) as Uint8Array);
    byPath.delete(from);
  }
  for (const path of plan.deletions) byPath.delete(path);
  return [...byPath].map(([path, bytes]) => ({ path, bytes }));
};

const options = (parsed: ParsedArguments) => {
  if (parsed.kind !== "options") throw new Error(JSON.stringify(parsed));
  return parsed.options;
};

const CAPABILITIES = [
  "project:",
  "  name: DarkFactory",
  "  slug: darkfactory",
  "  version: 0.2.1",
  "  language: typescript",
  "",
  "workspace:",
  "  name: stays",
  "",
].join("\n");

describe("parseInitArguments", () => {
  it("accepts the required identity and derives repo, sender and holder", () => {
    expect(options(parseInitArguments(REQUIRED, YEAR))).toEqual({
      identity: identity(),
      dryRun: false,
      force: false,
      skipInstall: false,
      withoutOperator: false,
      freshHistory: false,
    });
  });

  it("accepts every option in both spellings and the boolean switches", () => {
    const parsed = options(
      parseInitArguments(
        [
          "--name=Acme Labs",
          "--slug",
          "acme",
          "--scope=@acme-co",
          "--domain",
          "app.acme.dev",
          "--repo",
          "Acme-Co/acme.web",
          "--email-from",
          " Acme Team <hello@acme.dev> ",
          "--holder",
          "Acme, Inc.",
          "--workers-subdomain",
          "acme-co",
          "--dry-run",
          "--force",
          "--skip-install",
          "--without-operator",
          "--fresh-history",
        ],
        YEAR
      )
    );
    expect(parsed).toEqual({
      identity: identity({
        slug: "acme",
        scope: "@acme-co",
        domain: "app.acme.dev",
        repo: "Acme-Co/acme.web",
        emailFrom: "Acme Team <hello@acme.dev>",
        holder: "Acme, Inc.",
        workersSubdomain: "acme-co",
      }),
      dryRun: true,
      force: true,
      skipInstall: true,
      withoutOperator: true,
      freshHistory: true,
    });
  });

  it("reports help before validating anything else", () => {
    expect(parseInitArguments(["--help"], YEAR)).toEqual({ kind: "help" });
  });

  it.each([
    [["positional"], "Unexpected argument: positional"],
    [["--unknown", "x"], "Unexpected argument: --unknown"],
    [["--dry-run=yes"], "Unexpected argument: --dry-run=yes"],
    [["--name", "A", "--name", "B"], "Duplicate option: --name"],
    [["--name"], "Missing value for --name"],
    [["--name", "--slug", "x"], "Missing value for --name"],
    [["--name", "Acme"], "--name, --slug, --scope and --domain are required"],
    [
      [...REQUIRED.slice(0, 6), "--domain", ""],
      "--name, --slug, --scope and --domain are required",
    ],
  ])("rejects malformed arguments %j", (arguments_, message) => {
    expect(parseInitArguments(arguments_, YEAR)).toEqual({
      kind: "error",
      message,
    });
  });

  it.each([
    ["--name", "1Acme"],
    ["--name", "Acme  Labs"],
    ["--name", 'Acme "Labs"'],
    ["--name", "A".repeat(65)],
    ["--slug", "a"],
    ["--slug", "Acme"],
    ["--slug", "acme-"],
    ["--slug", "acme--labs"],
    ["--slug", `a${"b".repeat(39)}`],
    ["--scope", "acme"],
    ["--scope", "@Acme"],
    ["--scope", `@${"a".repeat(214)}`],
    ["--domain", "localhost"],
    ["--domain", "Acme.dev"],
    ["--domain", "-acme.dev"],
    ["--repo", "acme"],
    ["--repo", "acme/.."],
    ["--repo", "-acme/web"],
    ["--email-from", "no-reply@acme.dev"],
    ["--email-from", "Acme <no-reply@acme.dev>\nBcc: x"],
    ["--holder", "Acme <x>"],
    ["--workers-subdomain", "Acme"],
  ])("rejects an invalid %s %j", (flag, value) => {
    expect(parseInitArguments(withOption(flag, value), YEAR)).toEqual({
      kind: "error",
      message: `Invalid ${flag}: ${value.trim()}`,
    });
  });

  it.each([
    ["--slug", "darkfactory-two"],
    ["--repo", "jeffscottward/app"],
    ["--holder", "Jeffscott Ward"],
    ["--workers-subdomain", "jsward-18"],
  ])("refuses to reuse the template identity in %s", (flag, value) => {
    expect(parseInitArguments(withOption(flag, value), YEAR)).toEqual({
      kind: "error",
      message: `${flag} must not reuse the template identity: ${value}`,
    });
  });
});

describe("helpers", () => {
  it("detects binaries by a NUL byte", () => {
    expect(isBinary(Uint8Array.of(1, 0, 2))).toBe(true);
    expect(isBinary(encoder.encode("text"))).toBe(false);
  });

  it("classifies instance-only history, including the init tooling itself", () => {
    for (const path of [
      ".bestpractices.json",
      ".omp-status.md",
      "docs/evidence-map.md",
      "docs/assets/darkfactory-banner.webp",
      "docs/archive/old.md",
      "docs/assessments/openssf.md",
      "plans/next.md",
      "scripts/init.ts",
      "scripts/init/plan.ts",
    ]) {
      expect(isInstanceOnly(path), path).toBe(true);
    }
    expect(isInstanceOnly("docs/architecture.md")).toBe(false);
    expect(isInstanceOnly("scripts/initialize.ts")).toBe(false);
  });

  it("reads the capabilities project slug", () => {
    expect(projectSlugOf(CAPABILITIES)).toBe("darkfactory");
    expect(projectSlugOf('project:\n  name: X\n  slug: "acme"\n')).toBe("acme");
    expect(projectSlugOf("workspace:\n  slug: other\n")).toBeUndefined();
    expect(projectSlugOf("project: [unclosed\n")).toBeUndefined();
    expect(projectSlugOf("- a list\n")).toBeUndefined();
    expect(projectSlugOf("project: plain\n")).toBeUndefined();
    expect(projectSlugOf("project:\n  slug:\n    nested: x\n")).toBeUndefined();
    expect(projectSlugOf('project:\n  slug: ""\n')).toBeUndefined();
  });

  it("parses the slug in linear time on adversarial input (CodeQL js/redos)", () => {
    const adversarial = `project:\n${"  a\n".repeat(50_000)}`;
    const started = performance.now();
    expect(projectSlugOf(adversarial)).toBeUndefined();
    expect(performance.now() - started).toBeLessThan(2000);
  });

  it("writes a Keep-a-Changelog reset for the new repository", () => {
    expect(changelogFor(identity())).toContain("## [Unreleased]\n");
    expect(changelogFor(identity())).toContain(
      "[Unreleased]: https://github.com/acme/acme-labs/commits/main\n"
    );
  });

  it("only adds the version rule when there is a different template version", () => {
    const count = (version: string | undefined) =>
      identityRules(identity(), version).length;
    expect(count("0.2.1")).toBe(count(undefined) + 1);
    expect(count("0.1.0")).toBe(count(undefined));
  });
});

describe("planInit replacements", () => {
  const rewrite = (source: string, overrides: Partial<InitIdentity> = {}) =>
    contentOf(planInit(identity(overrides), files({ "a.ts": source })), "a.ts");

  it("applies the most specific rule first in a single pass", () => {
    expect(
      rewrite(
        [
          "https://github.com/jeffscottward/darkfactory.git",
          "no-reply@send.darkfactory.jeffscott.world",
          "https://darkfactory.jeffscott.world",
          "https://darkfactory-web-staging.jsward-17.workers.dev",
          'import { x } from "@darkfactory/db/server";',
          'pnpm --filter "@darkfactory" run build',
          "https://darkfactory.localhost:1355",
          "__DARKFACTORY_THEME__ DARKFACTORY_POSTGRES_PORT",
          "darkfactory_test_runner",
          "type DarkFactoryAuth; createDarkFactory; DarkFactory Staging",
          "globalThis.__darkfactoryDatabase",
          "portless darkfactory; darkfactory-theme",
          "Copyright (c) 2026 Jeff Scott Ward",
          "DARKFACTORY Darkfactory",
          "noreply@darkfactory.test",
        ].join("\n")
      )
    ).toBe(
      [
        "https://github.com/acme/acme-labs.git",
        "no-reply@send.acme.dev",
        "https://acme.dev",
        `https://acme-labs-web-staging.${WORKERS_PLACEHOLDER}`,
        'import { x } from "@acme/db/server";',
        'pnpm --filter "@acme" run build',
        "https://acme-labs.localhost:1355",
        "__ACME_LABS_THEME__ ACME_LABS_POSTGRES_PORT",
        "acme_labs_test_runner",
        "type AcmeLabsAuth; createAcmeLabs; Acme Labs Staging",
        "globalThis.__acmeLabsDatabase",
        "portless acme-labs; acme-labs-theme",
        "Copyright (c) 2026 Acme Labs",
        "ACME_LABS acme-labs",
        "noreply@acme-labs.test",
      ].join("\n")
    );
  });

  it("never rescans replacement output, even when the scope equals the slug", () => {
    expect(
      rewrite('"@darkfactory/api" darkfactory', {
        scope: "@acme",
        slug: "acme",
      })
    ).toBe('"@acme/api" acme');
  });

  it("uses a supplied workers.dev subdomain", () => {
    expect(
      rewrite("darkfactory-web-staging.jsward-17.workers.dev", {
        workersSubdomain: "acme-co",
      })
    ).toBe("acme-labs-web-staging.acme-co.workers.dev");
  });

  it("resets only version declarations of the template version, never in the lockfile", () => {
    const plan = planInit(
      identity(),
      files({
        "capabilities.yaml": CAPABILITIES,
        "package.json": '{ "version": "0.2.1", "dependency": "0.2.1" }\n',
        "a.ts":
          'version: "0.2.1"; version: 0.2.10; x.replace("version: 0.2.1")',
        "pnpm-lock.yaml": "version: 0.2.1\n  '@darkfactory/api':\n",
      })
    );
    expect(contentOf(plan, "package.json")).toBe(
      '{ "version": "0.1.0", "dependency": "0.2.1" }\n'
    );
    expect(contentOf(plan, "a.ts")).toBe(
      'version: "0.1.0"; version: 0.2.10; x.replace("version: 0.1.0")'
    );
    expect(contentOf(plan, "pnpm-lock.yaml")).toBe(
      "version: 0.2.1\n  '@acme/api':\n"
    );
  });

  it("skips binaries but still renames their paths", () => {
    const plan = planInit(
      identity(),
      files({ "assets/darkfactory.png": Uint8Array.of(0x64, 0, 0x66) })
    );
    expect(plan.edits).toEqual([]);
    expect(plan.renames).toEqual([
      { from: "assets/darkfactory.png", to: "assets/acme-labs.png" },
    ]);
  });

  it("renames identity-bearing paths and refuses to overwrite a tracked file", () => {
    expect(
      planInit(
        identity(),
        files({
          "docs/specs/DARKFACTORY_SPEC.md": "# Spec\n",
          ".darkfactory/features.json": "{}\n",
        })
      ).renames
    ).toEqual([
      { from: ".darkfactory/features.json", to: ".acme-labs/features.json" },
      {
        from: "docs/specs/DARKFACTORY_SPEC.md",
        to: "docs/specs/ACME_LABS_SPEC.md",
      },
    ]);
    expect(() =>
      planInit(
        identity(),
        files({ "darkfactory.txt": "", "acme-labs.txt": "" })
      )
    ).toThrow("Rename target already exists: darkfactory.txt -> acme-labs.txt");
  });

  it("deletes instance-only history", () => {
    const plan = planInit(
      identity(),
      files({
        ".bestpractices.json": "{}",
        "docs/assessments/x.json": "{}",
        "scripts/init/plan.ts": "darkfactory",
        "keep.md": "# Keep\n",
      })
    );
    expect(plan.deletions).toEqual([
      ".bestpractices.json",
      "docs/assessments/x.json",
      "scripts/init/plan.ts",
    ]);
    expect(plan.edits).toEqual([]);
  });

  it("re-pins SHA-256 digests of renamed content and Dockerfile argv", () => {
    const checks = '{ "identity": "darkfactory-verifier-checks-v1" }\n';
    const argv = '["/opt/darkfactory-verifier/runner.ts","--config"]';
    const hash = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const plan = planInit(
      identity(),
      files({
        "verifier/checks.json": checks,
        "verifier/Dockerfile": `FROM x\nCMD ${argv}\n`,
        "src/pins.ts": `const CONFIG = "${hash(checks)}";\nconst ARGV = "${hash(argv)}";\nconst OTHER = "${"a".repeat(64)}";\n`,
      })
    );
    const renamedChecks = contentOf(plan, "verifier/checks.json") as string;
    const renamedArgv = '["/opt/acme-labs-verifier/runner.ts","--config"]';
    expect(contentOf(plan, "src/pins.ts")).toBe(
      `const CONFIG = "${hash(renamedChecks)}";\nconst ARGV = "${hash(renamedArgv)}";\nconst OTHER = "${"a".repeat(64)}";\n`
    );
    expect(
      plan.edits.find((edit) => edit.path === "src/pins.ts")?.replacements
    ).toBe(2);
  });
});

describe("planInit structured edits", () => {
  const WRANGLER = `{
  "name": "darkfactory-web",
  "account_id": "9eaec6716c2f8d52dcb6b0463e690924",
  "routes": [
    {
      "pattern": "darkfactory.jeffscott.world",
      "custom_domain": true
    }
  ],
  "vars": {
    "APP_URL": "https://darkfactory.jeffscott.world",
    "BETTER_AUTH_URL": "https://example.com",
    "EMAIL_FROM": "DarkFactory <no-reply@send.darkfactory.jeffscott.world>"
  },
  "env": {
    "staging": {
      "vars": {
        "APP_URL": "https://darkfactory-web-staging.jsward-17.workers.dev",
        "BETTER_AUTH_URL": "https://darkfactory-web-staging.jsward-17.workers.dev"
      }
    }
  }
}
`;

  it("rewrites wrangler.jsonc without the account id and marks the staging placeholder", () => {
    const plan = planInit(
      identity({ emailFrom: "Acme <team@acme.dev>" }),
      files({ "apps/web/wrangler.jsonc": WRANGLER })
    );
    expect(contentOf(plan, "apps/web/wrangler.jsonc")).toBe(`{
  "name": "acme-labs-web",
  "routes": [
    {
      "pattern": "acme.dev",
      "custom_domain": true
    }
  ],
  "vars": {
    "APP_URL": "https://acme.dev",
    "BETTER_AUTH_URL": "https://acme.dev",
    "EMAIL_FROM": "Acme <team@acme.dev>"
  },
  "env": {
    "staging": {
      "vars": {
        // Placeholder: replace ${WORKERS_PLACEHOLDER} with <your-account>.workers.dev before deploying staging.
        "APP_URL": "https://acme-labs-web-staging.${WORKERS_PLACEHOLDER}",
        "BETTER_AUTH_URL": "https://acme-labs-web-staging.${WORKERS_PLACEHOLDER}"
      }
    }
  }
}
`);
  });

  it("sets the route when the rules could not, and tolerates sparse configs", () => {
    const plan = planInit(
      identity({ workersSubdomain: "acme" }),
      files({
        "apps/web/wrangler.jsonc":
          '{ "routes": [{ "pattern": "old.example" }] }\n',
        "apps/other/wrangler.jsonc": '{ "account_id": "x" }\n',
      })
    );
    expect(contentOf(plan, "apps/web/wrangler.jsonc")).toBe(
      '{ "routes": [{ "pattern": "acme.dev" }] }\n'
    );
    expect(contentOf(plan, "apps/other/wrangler.jsonc")).toBeUndefined();
    const empty = planInit(
      identity(),
      files({ "apps/web/wrangler.jsonc": "", "package.json": "" })
    );
    expect(empty.edits).toEqual([]);
  });

  it("rewrites the capabilities project and nothing outside it", () => {
    expect(
      contentOf(
        planInit(identity(), files({ "capabilities.yaml": CAPABILITIES })),
        "capabilities.yaml"
      )
    ).toBe(
      [
        "project:",
        "  name: Acme Labs",
        "  slug: acme-labs",
        "  version: 0.1.0",
        "  language: typescript",
        "",
        "workspace:",
        "  name: stays",
        "",
      ].join("\n")
    );
  });

  it("updates the license year and holder", () => {
    const plan = planInit(
      identity({ holder: "Acme, Inc." }),
      files({
        LICENSE: "MIT License\n\nCopyright (c) 2024-2026 Jeff Scott Ward\n",
      })
    );
    expect(contentOf(plan, "LICENSE")).toBe(
      `MIT License\n\nCopyright (c) ${YEAR} Acme, Inc.\n`
    );
    expect(plan.edits[0]?.replacements).toBe(2);
  });

  it("resets the changelog", () => {
    const plan = planInit(
      identity(),
      files({ "CHANGELOG.md": "# Changelog\n\n## [0.2.1]\n" })
    );
    expect(contentOf(plan, "CHANGELOG.md")).toBe(changelogFor(identity()));
  });

  it("removes the init script from the root manifest only", () => {
    const manifest = `{
  "scripts": {
    "setup": "bun scripts/setup.ts",
    "init": "bun scripts/init.ts",
    "dev": "vite"
  }
}
`;
    const plan = planInit(
      identity(),
      files({ "package.json": manifest, "packages/a/package.json": manifest })
    );
    expect(contentOf(plan, "package.json")).toBe(`{
  "scripts": {
    "setup": "bun scripts/setup.ts",
    "dev": "vite"
  }
}
`);
    expect(contentOf(plan, "packages/a/package.json")).toBeUndefined();
  });

  it("drops init blocks and badges, images and links to deleted history", () => {
    const readme = [
      "<!-- markdownlint-disable-next-line MD041 -->",
      "![DarkFactory banner](docs/assets/darkfactory-banner.webp)",
      "",
      "# DarkFactory",
      "",
      "| Area | Status |",
      "| --- | --- |",
      "| Health | [![CI](https://img.shields.io/ci.svg)](https://github.com/jeffscottward/darkfactory/actions) [![Score](https://img.shields.io/s.svg)](docs/assessments/score.json) <br> [![OpenSSF](https://img.shields.io/o.svg)](https://www.bestpractices.dev/projects/13782) |",
      "| Runtime | [![Bun](https://img.shields.io/b.svg)](https://bun.sh/) <br> [![Old](docs/assessments/badge.svg)](LICENSE) |",
      "",
      "See [the evidence](docs/evidence-map.md#top), [assessments](/docs/assessments), [docs](docs/architecture.md), [anchor](#top) and [site](https://example.com).",
      "",
      "<!-- init:start -->",
      "### Start your own project",
      "",
      "Run `bun run init`.",
      "<!-- init:end -->",
      "",
      "",
      "## Next",
      "",
    ].join("\n");
    const plan = planInit(
      identity(),
      files({
        "README.md": readme,
        "docs/assets/darkfactory-banner.webp": Uint8Array.of(0),
        "docs/evidence-map.md": "# Evidence\n",
        "docs/assessments/score.json": "{}",
        "docs/guide.md": "Read [the map](evidence-map.md) and [ADRs](adr/).\n",
      })
    );
    expect(contentOf(plan, "README.md")).toBe(
      [
        "# Acme Labs",
        "",
        "| Area | Status |",
        "| --- | --- |",
        "| Health | [![CI](https://img.shields.io/ci.svg)](https://github.com/acme/acme-labs/actions) |",
        "| Runtime | [![Bun](https://img.shields.io/b.svg)](https://bun.sh/) |",
        "",
        "See the evidence, assessments, [docs](docs/architecture.md), [anchor](#top) and [site](https://example.com).",
        "",
        "## Next",
        "",
      ].join("\n")
    );
    expect(contentOf(plan, "docs/guide.md")).toBe(
      "Read the map and [ADRs](adr/).\n"
    );
  });

  it("keeps a removed line's preceding content when it is not a lint directive", () => {
    const plan = planInit(
      identity(),
      files({
        "a.md": "Intro\n![old](plans/x.png)\nOutro\n",
        "b.md": "![old](plans/x.png)\n# Title\n",
        "plans/x.png": Uint8Array.of(0),
      })
    );
    expect(contentOf(plan, "a.md")).toBe("Intro\nOutro\n");
    expect(contentOf(plan, "b.md")).toBe("# Title\n");
  });
});

describe("planInit idempotence and reporting", () => {
  const TEMPLATE = files({
    "capabilities.yaml": CAPABILITIES,
    "package.json":
      '{\n  "name": "@darkfactory/root",\n  "version": "0.2.1",\n  "scripts": { "init": "bun scripts/init.ts" }\n}\n',
    "apps/web/wrangler.jsonc":
      '{\n  "account_id": "x",\n  "vars": {\n    "APP_URL": "https://darkfactory-web-staging.jsward-17.workers.dev"\n  }\n}\n',
    LICENSE: "Copyright (c) 2026 Jeff Scott Ward\n",
    "CHANGELOG.md": "# Changelog\n",
    "README.md":
      "# DarkFactory\n\n[![x](i.svg)](docs/assessments/a.md)\n\n<!-- init:start -->\nx\n<!-- init:end -->\n",
    "docs/assessments/a.md": "# A\n",
    "docs/specs/DARKFACTORY_SPEC.md": "DarkFactory spec\n",
    "logo.png": Uint8Array.of(0, 1),
  });

  it("plans nothing when run on its own output", () => {
    const first = planInit(identity(), TEMPLATE);
    expect(first.edits.length).toBeGreaterThan(0);
    const second = planInit(identity(), applied(TEMPLATE, first));
    expect(second).toEqual({ edits: [], renames: [], deletions: [] });
    for (const file of applied(TEMPLATE, first)) {
      if (isBinary(file.bytes)) continue;
      expect(decoder.decode(file.bytes)).not.toMatch(/darkfactory|jeffscott/iu);
    }
  });

  it("describes edits, renames and deletions with replacement counts", () => {
    const lines = describePlan(planInit(identity(), TEMPLATE));
    expect(lines[0]).toMatch(
      /^Edit 7 files \(\d+ replacements\), rename 1, delete 1\.$/u
    );
    expect(lines).toContain("  edit    LICENSE (2)");
    expect(lines).toContain(
      "  rename  docs/specs/DARKFACTORY_SPEC.md -> docs/specs/ACME_LABS_SPEC.md"
    );
    expect(lines).toContain("  delete  docs/assessments/a.md");
  });

  it("drops the agent-SDLC plane with --without-operator, then plans nothing", () => {
    const template = files({
      "capabilities.yaml": CAPABILITIES,
      "packages/jobs/package.json":
        '{ "name": "@darkfactory/jobs", "brick": "agent-sdlc" }\n',
      "packages/jobs/logo.png": Uint8Array.of(0),
      "packages/state/package.json":
        '{ "name": "@darkfactory/state", "brick": "product" }\n',
      ".env.example": "# --- Jobs\nWORKFLOW_ROOT=\n\n# --- App\nAPP=1\n",
      "docs/state.md": "See [jobs](../packages/jobs/package.json). Kept.\n",
    });
    const plan = planInit(identity(), template, { withoutOperator: true });
    expect(plan.deletions).toEqual([
      "packages/jobs/logo.png",
      "packages/jobs/package.json",
    ]);
    expect(contentOf(plan, ".env.example")).toBe("# --- App\nAPP=1\n");
    expect(contentOf(plan, "docs/state.md")).toBe("Kept.\n");
    expect(describePlan(plan)).toContain("  edit    .env.example (1)");
    expect(
      planInit(identity(), applied(template, plan), { withoutOperator: true })
    ).toEqual({ edits: [], renames: [], deletions: [] });
  });
});
