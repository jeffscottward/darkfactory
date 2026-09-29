import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import ts from "typescript";
import { afterEach, describe, expect, it } from "vitest";

import {
  type ApplyGenerationOptions,
  applyGenerationPlan,
} from "../../scripts/generate-feature/apply.ts";
import {
  renderContractRegistry,
  renderPublicRegistry,
  renderRouterRegistry,
  renderSchemaRegistry,
} from "../../scripts/generate-feature/live-templates.ts";
import { createGenerationPlan } from "../../scripts/generate-feature/plan.ts";
import { AUTH_USER_IDENTITY } from "../../scripts/generate-feature/reserved-identities.ts";
import type {
  GenerationPlan,
  PlannedFile,
} from "../../scripts/generate-feature/types.ts";
import { validateFeatureName } from "../../scripts/generate-feature/validate.ts";
import { verifyGeneration } from "../../scripts/generate-feature/verify.ts";
import {
  createGeneratorFixture,
  listFixtureEntries,
  readGeneratedFiles,
} from "./fixture.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  return await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

const fixture = async () => {
  const created = await createGeneratorFixture();
  cleanups.push(created.cleanup);
  return created;
};

const registryPaths = [
  ".darkfactory/features.json",
  "apps/web/src/features/generated-navigation.ts",
  "packages/api/src/generated/contract-registry.ts",
  "packages/api/src/generated/public-registry.ts",
  "packages/api/src/generated/router-registry.ts",
  "packages/db/migrations/meta/_journal.json",
  "packages/db/src/generated/repository-registry.ts",
  "packages/db/src/generated/schema-registry.ts",
] as const;

const liveCreatePaths = [
  "apps/web/src/app/(portal)/order-items/page.tsx",
  "apps/web/src/features/order-item/feature.test.ts",
  "apps/web/src/features/order-item/graphify.json",
  "apps/web/src/features/order-item/index.ts",
  "apps/web/src/features/order-item/names.ts",
  "docs/features/order-item.md",
  "packages/api/src/generated/order-item/contract.ts",
  "packages/api/src/generated/order-item/service.ts",
  "packages/db/migrations/0000_order_items.sql",
  "packages/db/src/generated/order-item/repository.ts",
  "packages/db/src/generated/order-item/schema.ts",
] as const;

type LivePlannedFile = PlannedFile &
  Readonly<{
    operation: "create" | "replace";
    previousSha256?: string;
  }>;

const liveFiles = (plan: GenerationPlan): readonly LivePlannedFile[] => {
  return plan.files as readonly LivePlannedFile[];
};

describe("DF-069 live feature registration", () => {
  it("plans exact live leaves and generator-owned registry replacements", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const files = liveFiles(plan);

    expect(
      files
        .filter((file) => file.operation === "create")
        .map((file) => file.path)
    ).toEqual(liveCreatePaths);
    expect(
      files
        .filter((file) => file.operation === "replace")
        .map((file) => file.path)
    ).toEqual(registryPaths);
    return expect(
      files
        .filter((file) => file.operation === "replace")
        .every((file) => file.previousSha256?.match(/^[a-f0-9]{64}$/))
    ).toBe(true);
  });

  it("applies a consumer-visible contract, repository, migration, route, docs, and graph entry", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );

    await applyGenerationPlan(plan);
    await expect(verifyGeneration(plan)).resolves.toMatchObject({
      isValid: true,
      filesChecked: liveCreatePaths.length + registryPaths.length,
    });

    const registries = await readGeneratedFiles(root, registryPaths);
    expect(
      registries["packages/api/src/generated/contract-registry.ts"]
    ).toContain("orderItemContract");
    expect(
      registries["packages/api/src/generated/router-registry.ts"]
    ).toContain("createOrderItemService");
    expect(
      registries["packages/db/src/generated/schema-registry.ts"]
    ).toContain("orderItems");
    expect(
      registries["packages/db/src/generated/repository-registry.ts"]
    ).toContain("createOrderItemRepository");
    expect(
      registries["apps/web/src/features/generated-navigation.ts"]
    ).toContain('href: "/order-items"');
    expect(JSON.parse(registries[".darkfactory/features.json"]!)).toMatchObject(
      {
        generated: [
          { name: "order-item", route: "/order-items", table: "order_items" },
        ],
      }
    );
    return expect(
      JSON.parse(registries["packages/db/migrations/meta/_journal.json"]!)
    ).toMatchObject({
      entries: [{ idx: 0, tag: "0000_order_items" }],
    });
  });

  it("emits generated TypeScript consumers that the TypeScript parser accepts", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const sources = liveFiles(plan).filter(
      (file) => file.operation === "create" && /\.tsx?$/.test(file.path)
    );
    const diagnostics = sources
      .flatMap(
        (file) =>
          ts.transpileModule(file.content, {
            fileName: file.path,
            reportDiagnostics: true,
            compilerOptions: {
              jsx: ts.JsxEmit.Preserve,
              module: ts.ModuleKind.ESNext,
              target: ts.ScriptTarget.ES2022,
            },
          }).diagnostics ?? []
      )
      .map((diagnostic) =>
        ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")
      );

    expect(sources).toHaveLength(8);
    return expect(diagnostics).toEqual([]);
  });

  it("points generated ownership at the reserved auth user table", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const contentOf = (path: string): string => {
      return liveFiles(plan).find((file) => file.path === path)!.content;
    };
    const migration = contentOf("packages/db/migrations/0000_order_items.sql");
    const schema = contentOf("packages/db/src/generated/order-item/schema.ts");

    expect(AUTH_USER_IDENTITY).toMatchObject({
      table: "user",
      schemaExport: "users",
    });
    expect(migration).toContain(
      'REFERENCES "public"."user"("id") ON DELETE cascade'
    );
    expect(migration).toContain('CONSTRAINT "order_items_name_check"');
    return expect(schema).toContain(
      'import { users } from "../../schema/index.ts"'
    );
  });

  it("restores every registry and removes every leaf on mid-registration failure", async () => {
    const { root } = await fixture();
    const beforeEntries = await listFixtureEntries(root);
    const beforeRegistries = await readGeneratedFiles(root, registryPaths);
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );

    await expect(
      applyGenerationPlan(plan, {
        afterFilePromotion: async (_file, index) => {
          if (index === 5) throw new Error("injected registration failure");
          return;
        },
      } as ApplyGenerationOptions)
    ).rejects.toThrow("injected registration failure");

    expect(await listFixtureEntries(root)).toEqual(beforeEntries);
    return expect(await readGeneratedFiles(root, registryPaths)).toEqual(
      beforeRegistries
    );
  });

  it("refuses a duplicate without changing registered consumers", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    await applyGenerationPlan(plan);
    const before = await listFixtureEntries(root);

    await expect(
      createGenerationPlan(root, validateFeatureName("order-item"))
    ).rejects.toThrow(/collision/i);
    return expect(await listFixtureEntries(root)).toEqual(before);
  });

  it.each([
    "docs/features/order-item.md",
    "apps/web/src/features/order-item/graphify.json",
  ])("detects stale generated metadata at %s", async (path) => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    await applyGenerationPlan(plan);
    await writeFile(join(root, path), "stale", "utf8");

    return await expect(verifyGeneration(plan)).rejects.toMatchObject({
      code: "VERIFICATION_FAILED",
    });
  });

  return it("renders canonical empty registries before the first live feature", () => {
    const header =
      "// Generator-owned. Edit through `pnpm generate:feature` only.\n";
    return expect({
      contracts: renderContractRegistry([]),
      publicApi: renderPublicRegistry([]),
      routers: renderRouterRegistry([]),
      schema: renderSchemaRegistry([]),
    }).toEqual({
      contracts: `${header}export const generatedFeatureContracts = Object.freeze({\n})\n`,
      publicApi: `${header}export const GENERATED_API_FEATURES = Object.freeze([] as const)\n`,
      routers: `${header}export const generatedFeatureRouters = Object.freeze({})\n`,
      schema: `${header}export const generatedFeatureTables = Object.freeze({\n})\n`,
    });
  });
});
