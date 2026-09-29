import { describe, expect, it } from "vitest";
import { type Texts, withoutOperator } from "./without-operator.ts";

const texts = (entries: Readonly<Record<string, string | undefined>>): Texts =>
  new Map(Object.entries(entries));

const PLANE = {
  "apps/operator/package.json":
    '{ "name": "@darkfactory/operator-app", "brick": "agent-sdlc" }\n',
  "apps/operator/src/page.tsx": "export const Page = () => null;\n",
  "packages/jobs/package.json":
    '{ "name": "@darkfactory/jobs", "brick": "agent-sdlc" }\n',
  "packages/jobs/verifier/Dockerfile": "FROM node\n",
  "packages/jobs/logo.png": undefined,
  "packages/operator/package.json":
    '{ "name": "@darkfactory/operator", "brick": "agent-sdlc" }\n',
  "docs/operator.md": "# Operator\n",
} as const;

const PRODUCT = {
  "packages/state/package.json":
    '{\n  "name": "@darkfactory/state",\n  "brick": "product",\n  "dependencies": { "@darkfactory/db": "workspace:*", "@darkfactory/jobs": "workspace:*" }\n}\n',
  "packages/odd/package.json": '{ "name": 7, "brick": "agent-sdlc" }\n',
  "packages/raw/package.json": undefined,
} as const;

describe("withoutOperator", () => {
  it("deletes every agent-sdlc package, its doc page and the tests that import it", () => {
    const result = withoutOperator(
      texts({
        ...PLANE,
        ...PRODUCT,
        "tests/integration/workflow.test.ts":
          'import { run } from "@darkfactory/jobs/server/run";\n',
        "tests/e2e/mocked.spec.ts": 'vi.mock("@darkfactory/operator");\n',
        "tests/unit/keep.test.ts":
          'const name = "@darkfactory/operator-app";\n',
        "scripts/docs/fixture.test.ts":
          "const probe = [\n  'import type * as Jobs from \"@darkfactory/jobs/schema\";',\n  'vi.mock(\"@darkfactory/jobs\");',\n];\n",
        "tests/integration/multiline.test.ts":
          'import {\n  run,\n} from "@darkfactory/jobs/server/run";\n',
        "tests/fixture.bin.ts": undefined,
        "docs/jobs-guide.md": "# Kept\n",
      })
    );
    expect([...result.removed].sort()).toEqual([
      "apps/operator/package.json",
      "apps/operator/src/page.tsx",
      "docs/operator.md",
      "packages/jobs/logo.png",
      "packages/jobs/package.json",
      "packages/jobs/verifier/Dockerfile",
      "packages/operator/package.json",
      "tests/e2e/mocked.spec.ts",
      "tests/integration/multiline.test.ts",
      "tests/integration/workflow.test.ts",
    ]);
    expect([...result.texts.keys()].sort()).toEqual([
      "docs/jobs-guide.md",
      "packages/odd/package.json",
      "packages/raw/package.json",
      "packages/state/package.json",
      "scripts/docs/fixture.test.ts",
      "tests/fixture.bin.ts",
      "tests/unit/keep.test.ts",
    ]);
    expect(result.texts.get("packages/state/package.json")).toBe(
      '{\n  "name": "@darkfactory/state",\n  "brick": "product",\n  "dependencies": {\n    "@darkfactory/db": "workspace:*"\n  }\n}\n'
    );
    expect(result.texts.get("tests/fixture.bin.ts")).toBeUndefined();
  });

  it("refuses when product code imports the plane", () => {
    expect(() =>
      withoutOperator(
        texts({
          ...PLANE,
          "packages/api/src/index.ts":
            'export * from "@darkfactory/operator/server";\n',
        })
      )
    ).toThrow(
      "packages/api/src/index.ts imports an agent-sdlc package; move that code out of the product before --without-operator."
    );
  });

  it("drops root dependencies and the scripts named for or citing the plane", () => {
    const root = [
      "{",
      '  "scripts": {',
      '    "dev": "bun scripts/dev.ts web",',
      '    "operator:dev": "bun scripts/dev.ts operator",',
      '    "verifier": "pnpm --filter @darkfactory/jobs build",',
      '    "image": "docker build packages/jobs/verifier",',
      '    "count": 3',
      "  },",
      '  "devDependencies": { "@darkfactory/jobs": "workspace:*", "vitest": "5" }',
      "}",
      "",
    ].join("\n");
    const result = withoutOperator(texts({ ...PLANE, "package.json": root }));
    expect(JSON.parse(result.texts.get("package.json") as string)).toEqual({
      scripts: { dev: "bun scripts/dev.ts web", count: 3 },
      devDependencies: { vitest: "5" },
    });
  });

  it("keeps root scripts when there is no root manifest", () => {
    const result = withoutOperator(
      texts({ ...PLANE, "packages/x/package.json": "{}\n" })
    );
    expect(result.texts.get("packages/x/package.json")).toBe("{}\n");
  });

  it("removes the plane's env keys, their comments and emptied sections", () => {
    const example = [
      "WORKFLOW_FIRST=",
      "# --- App",
      "# App name.",
      "APP_NAME=x",
      "",
      "# --- Operator",
      "# Grants. Secret.",
      "WORKFLOW_GRANTS=",
      "# Worker tuning.",
      "WORKFLOW_ROOT=",
      "OMP_MODEL=",
      "",
      "# --- Mixed",
      "KEEP=1",
      "# Tuning.",
      "WORKFLOW_LAST=",
      "",
      "# --- Trailing operator",
      "WORKFLOW_END=",
      "",
    ].join("\n");
    const result = withoutOperator(texts({ ".env.example": example }));
    expect(result.texts.get(".env.example")).toBe(
      [
        "# --- App",
        "# App name.",
        "APP_NAME=x",
        "",
        "# --- Mixed",
        "KEEP=1",
        "",
      ].join("\n")
    );
  });

  it("removes single-line WORKFLOW_ properties from code", () => {
    const schema = [
      "const schema = z.object({",
      "  APP_ENV: appEnvironment,",
      "  WORKFLOW_REPOSITORY_GRANTS: optionalString,",
      "  OMP_MODEL: optionalString,",
      "  WORKFLOW_STRICT: z",
      "    .string(),",
      "});",
      "",
    ].join("\n");
    expect(
      withoutOperator(texts({ "src/server.ts": schema })).texts.get(
        "src/server.ts"
      )
    ).toBe(
      [
        "const schema = z.object({",
        "  APP_ENV: appEnvironment,",
        "  WORKFLOW_STRICT: z",
        "    .string(),",
        "});",
        "",
      ].join("\n")
    );
  });

  it("drops config entries and keys that cite the plane, and overrides left empty", () => {
    const biome = [
      "{",
      '  "overrides": [',
      '    { "includes": ["packages/jobs/a.ts", "packages/ui/b.ts"] },',
      "    {",
      '      "includes": ["packages/jobs/verifier/runner.ts"],',
      "      // The verifier runs under Bun.",
      '      "javascript": { "globals": ["Bun"] }',
      "    }",
      "  ],",
      '  "ignore": ["apps/operator/"],',
      '  "includes": ["packages/operator"],',
      '  "nested": [["packages/jobs"]],',
      "  // knip: one entry per workspace.",
      '  "workspaces": {',
      '    "apps/operator": { "entry": ["src/app/page.tsx"] },',
      '    "apps/web": { "entry": ["src/app/page.tsx"] }',
      "  },",
      '  "count": 1',
      "}",
      "",
    ].join("\n");
    const result = withoutOperator(
      texts({
        ...PLANE,
        "biome.jsonc": biome,
        "empty.json": "",
        "config.yaml": "path: packages/jobs\n",
      })
    );
    expect(result.texts.get("biome.jsonc")).toBe(
      [
        "{",
        '  "overrides": [',
        "    {",
        '      "includes": [',
        '        "packages/ui/b.ts"',
        "      ]",
        "    }",
        "  ],",
        '  "ignore": [],',
        '  "includes": [],',
        '  "nested": [',
        "    []",
        "  ],",
        "  // knip: one entry per workspace.",
        '  "workspaces": {',
        '    "apps/web": {',
        '      "entry": [',
        '        "src/app/page.tsx"',
        "      ]",
        "    }",
        "  },",
        '  "count": 1',
        "}",
        "",
      ].join("\n")
    );
    expect(result.texts.get("empty.json")).toBe("");
    expect(result.texts.get("config.yaml")).toBe("path: packages/jobs\n");
  });

  it("drops the Markdown rows, items, sentences and listed links that cite the plane", () => {
    const markdown = [
      "# Guide",
      "",
      "| Brick | Path |",
      "| --- | --- |",
      "| product | `packages/state` |",
      "| agent-sdlc | `packages/jobs/src/omp.ts#run` |",
      "",
      "- Keep this item.",
      "- Run `bun run operator:dev` first.",
      "1. Set `WORKFLOW_ROOT` to an absolute path.",
      "",
      "Docs: [Start](start.md), [Operator](operator.md), [Deploy](/docs/deploy.md).",
      "[Operator](operator.md), [Deploy](deploy.md) and more.",
      "",
      "The app deploys. The operator lives in `apps/operator/`. It is optional. See [home](https://example.com) and [top](#guide).",
      "",
      "> **Heads-up.** Install `@darkfactory/jobs` first.",
      "",
      "Only [the plane](../packages/operator/README.md) matters here.",
      "",
      "```sh",
      "pnpm --filter @darkfactory/jobs build",
      "```",
      "",
      "End.",
      "",
    ].join("\n");
    const root =
      '{ "scripts": { "operator:dev": "bun scripts/dev.ts operator" } }\n';
    const result = withoutOperator(
      texts({ ...PLANE, "package.json": root, "docs/guide.md": markdown })
    );
    expect(result.texts.get("docs/guide.md")).toBe(
      [
        "# Guide",
        "",
        "| Brick | Path |",
        "| --- | --- |",
        "| product | `packages/state` |",
        "",
        "- Keep this item.",
        "",
        "Docs: [Start](start.md), [Deploy](/docs/deploy.md).",
        "[Deploy](deploy.md) and more.",
        "",
        "The app deploys. It is optional. See [home](https://example.com) and [top](#guide).",
        "",
        "> **Heads-up.**",
        "",
        "```sh",
        "pnpm --filter @darkfactory/jobs build",
        "```",
        "",
        "End.",
        "",
      ].join("\n")
    );
  });

  it("changes nothing but env keys when no package is an agent-sdlc brick", () => {
    const readme = "Run `bun run dev`. See [ops](ops.md).\n";
    const result = withoutOperator(
      texts({ ...PRODUCT, "README.md": readme, "a.ts": "import x from 'y';\n" })
    );
    expect(result.removed.size).toBe(0);
    expect(result.texts.get("README.md")).toBe(readme);
    expect(result.texts.get("a.ts")).toBe("import x from 'y';\n");
  });
});
