import {
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  rmdir,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

// A mutable copy of node:fs constants lets one test remove O_NOFOLLOW from the
// already-loaded generator modules. Re-importing them under vi.doMock would
// create a second module instance whose coverage Vitest 5 does not merge.
const fsMocks = vi.hoisted(() => ({
  constants: {} as Record<string, number | undefined>,
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  Object.assign(fsMocks.constants, actual.constants);
  return { ...actual, constants: fsMocks.constants };
});

import {
  type ApplyGenerationDependencies,
  type ApplyGenerationOptions,
  applyGenerationPlan,
} from "../../scripts/generate-feature/apply.ts";
import { parseGeneratorArguments } from "../../scripts/generate-feature/parse.ts";
import {
  assertNoSymlinkPath,
  hasIdentity,
  identityAt,
  pathExists,
} from "../../scripts/generate-feature/path-safety.ts";
import { createGenerationPlan } from "../../scripts/generate-feature/plan.ts";
import {
  createGenerationReport,
  formatHumanReport,
  serializeGenerationReport,
} from "../../scripts/generate-feature/report.ts";
import type { GenerationPlan } from "../../scripts/generate-feature/types.ts";
import { validateFeatureName } from "../../scripts/generate-feature/validate.ts";
import { verifyGeneration } from "../../scripts/generate-feature/verify.ts";
import {
  createGeneratorFixture,
  listFixtureEntries,
  readGeneratedFiles,
  replaceFeaturesDirectoryWithSymlink,
} from "./fixture.ts";

type RunFeatureGeneratorCli =
  typeof import("../../scripts/generate-feature/cli.ts")["runFeatureGeneratorCli"];
const runFeatureGeneratorCli = (
  ...arguments_: Parameters<RunFeatureGeneratorCli>
): ReturnType<RunFeatureGeneratorCli> => {
  return import("../../scripts/generate-feature/cli.ts").then(
    ({ runFeatureGeneratorCli: run }) => run(...arguments_)
  );
};
type GenerateFeature =
  typeof import("../../scripts/generate-feature/workflow.ts")["generateFeature"];
const generateFeature = (
  ...arguments_: Parameters<GenerateFeature>
): ReturnType<GenerateFeature> => {
  return import("../../scripts/generate-feature/workflow.ts").then(
    ({ generateFeature: generate }) => generate(...arguments_)
  );
};

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

describe("DF-069/DF-070 arguments and canonical names", () => {
  it("parses one name with plan-derived report options", () =>
    expect(
      parseGeneratorArguments(["order-item", "--dry-run", "--json"])
    ).toEqual({
      name: "order-item",
      dryRun: true,
      json: true,
    }));

  it.each([
    { arguments_: [] },
    { arguments_: ["one", "two"] },
    { arguments_: ["--unknown", "order-item"] },
    { arguments_: ["order-item", "--dry-run", "--dry-run"] },
  ])("rejects ambiguous invocation %#", ({ arguments_ }) =>
    expect(() => parseGeneratorArguments(arguments_)).toThrow()
  );

  it.each([
    "../escape",
    "a/../../escape",
    "/absolute",
    "C:\\absolute",
    "OrderItem",
    "order_item",
    "order--item",
    "-order",
    "order-",
    "order.item",
    "order\u0000item",
    "order\nitem",
    "éclair",
    "a".repeat(64),
    "con",
    "my-con",
    "prn",
    "aux",
    "nul",
    "com1",
    "com9",
    "lpt1",
    "lpt9",
  ])("rejects unsafe/nonportable name %j", (name) =>
    expect(() => validateFeatureName(name)).toThrow()
  );

  it("rejects empty and non-string feature names", () => {
    expect(() => validateFeatureName("")).toThrow("Feature name is invalid");
    return expect(() => validateFeatureName(undefined as never)).toThrow(
      "Feature name is invalid"
    );
  });

  it("derives stable identifiers", () =>
    expect(validateFeatureName("order-item")).toEqual({
      kebab: "order-item",
      pluralKebab: "order-items",
      camel: "orderItem",
      pluralCamel: "orderItems",
      pascal: "OrderItem",
      pluralPascal: "OrderItems",
      snake: "order_item",
      pluralSnake: "order_items",
    }));

  it("pluralizes consonant-y feature names without losing canonical forms", () =>
    expect(validateFeatureName("activity")).toMatchObject({
      kebab: "activity",
      pluralKebab: "activities",
      pluralCamel: "activities",
      pluralPascal: "Activities",
      pluralSnake: "activities",
    }));
  return it("bounds derived PostgreSQL identifiers", () => {
    const maximumSafe = validateFeatureName("a".repeat(49));
    expect(maximumSafe.pluralSnake).toHaveLength(50);
    expect(`${maximumSafe.pluralSnake}_owner_id_idx`).toHaveLength(63);
    expect(() => validateFeatureName("a".repeat(50))).toThrow(
      /database|identifier/i
    );
    const truncatingPrefix = "a".repeat(64);
    const firstCollision = `${truncatingPrefix}x`;
    const secondCollision = `${truncatingPrefix}y`;
    expect(`${firstCollision}s_owner_id_idx`.slice(0, 63)).toBe(
      `${secondCollision}s_owner_id_idx`.slice(0, 63)
    );
    expect(() => validateFeatureName(firstCollision)).toThrow();
    return expect(() => validateFeatureName(secondCollision)).toThrow();
  });
});

describe("DF-069 issued deterministic planning", () => {
  it("produces the same plan and report across workspace paths", async () => {
    const firstFixture = await fixture();
    const secondFixture = await fixture();
    const first = await createGenerationPlan(
      firstFixture.root,
      validateFeatureName("order-item")
    );
    const second = await createGenerationPlan(
      secondFixture.root,
      validateFeatureName("order-item")
    );

    expect(first.planId).toBe(second.planId);
    expect(first.files.map((file) => file.path)).toEqual(
      second.files.map((file) => file.path)
    );
    expect(createGenerationReport(first, "planned", true)).toEqual(
      createGenerationReport(second, "planned", true)
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.files)).toBe(true);
    return expect(first.files.every(Object.isFrozen)).toBe(true);
  });

  it("performs no writes when a live leaf collides", async () => {
    const { root } = await fixture();
    const collision = join(root, "apps/web/src/features/order-item");
    await mkdir(collision);
    await writeFile(join(collision, "names.ts"), "user work", "utf8");
    const before = await listFixtureEntries(root);

    await expect(
      createGenerationPlan(root, validateFeatureName("order-item"))
    ).rejects.toThrow(/collision/i);
    return expect(await listFixtureEntries(root)).toEqual(before);
  });

  it.each([
    "user",
    "session",
    "account",
    "verification",
    "profile",
    "address",
    "user-preference",
    "feature-item",
    "contact-rate-limit",
    "outbox-event",
    "audit-record",
    "preference",
  ])("rejects reserved core identity %j without writes", async (name) => {
    const { root } = await fixture();
    const before = await listFixtureEntries(root);

    await expect(
      createGenerationPlan(root, validateFeatureName(name))
    ).rejects.toMatchObject({ code: "TARGET_COLLISION" });
    return expect(await listFixtureEntries(root)).toEqual(before);
  });
  it.each([
    "user-note",
    "profile-note",
    "address-book",
    "account-link",
    "audit-entry",
  ])("allows near-safe identity %j", async (name) => {
    const { root } = await fixture();
    return await expect(
      createGenerationPlan(root, validateFeatureName(name))
    ).resolves.toMatchObject({
      names: { kebab: name },
    });
  });

  it("does not read a generated registry through an outside symlink", async () => {
    const { root } = await fixture();
    const outside = await mkdtemp(
      join(tmpdir(), "darkfactory-registry-outside-")
    );
    cleanups.push(async () => rm(outside, { force: true, recursive: true }));
    const registryPath = join(root, ".darkfactory/features.json");
    const outsideRegistry = join(outside, "features.json");
    const contents = await readFile(registryPath, "utf8");
    await writeFile(outsideRegistry, contents, "utf8");
    await rm(registryPath);
    await symlink(outsideRegistry, registryPath);

    await expect(
      createGenerationPlan(root, validateFeatureName("order-item"))
    ).rejects.toMatchObject({ code: "SYMLINK_UNSAFE" });
    return await expect(readFile(outsideRegistry, "utf8")).resolves.toBe(
      contents
    );
  });

  it.each([
    [
      "built-in table",
      (registry: any) => {
        return (registry.builtIn.table = "wrong");
      },
      undefined,
    ],
    [
      "generated migration path",
      (registry: any) => {
        return (registry.generated[0].migration = "../escape");
      },
      undefined,
    ],
    [
      "generated docs path",
      (registry: any) => {
        return (registry.generated[0].docs = "../escape");
      },
      undefined,
    ],
    [
      "generated graph path",
      (registry: any) => {
        return (registry.generated[0].graph = "../escape");
      },
      undefined,
    ],
    [
      "journal index type",
      undefined,
      (journal: any) => {
        return (journal.entries[0].idx = "0");
      },
    ],
    [
      "journal timestamp type",
      undefined,
      (journal: any) => {
        return (journal.entries[0].when = "1");
      },
    ],
    [
      "journal tag path",
      undefined,
      (journal: any) => {
        return (journal.entries[0].tag = "../escape");
      },
    ],
    [
      "journal breakpoint type",
      undefined,
      (journal: any) => {
        return (journal.entries[0].breakpoints = "true");
      },
    ],
    [
      "descriptor journal mismatch",
      (registry: any) => {
        return (registry.generated[0].migration = "9999_order_items");
      },
      undefined,
    ],
  ])(
    "rejects tampered registry metadata: %s",
    async (_label, mutateRegistry, mutateJournal) => {
      const { root } = await fixture();
      const initial = await createGenerationPlan(
        root,
        validateFeatureName("order-item")
      );
      await applyGenerationPlan(initial);
      const registryPath = join(root, ".darkfactory/features.json");
      const journalPath = join(
        root,
        "packages/db/migrations/meta/_journal.json"
      );
      const registry = JSON.parse(await readFile(registryPath, "utf8"));
      const journal = JSON.parse(await readFile(journalPath, "utf8"));
      mutateRegistry?.(registry);
      mutateJournal?.(journal);
      await writeFile(
        registryPath,
        `${JSON.stringify(registry, null, 2)}\n`,
        "utf8"
      );
      await writeFile(
        journalPath,
        `${JSON.stringify(journal, null, 2)}\n`,
        "utf8"
      );
      const before = await listFixtureEntries(root);

      await expect(
        createGenerationPlan(root, validateFeatureName("invoice-item"))
      ).rejects.toMatchObject({ code: "PLAN_INVALID" });
      return expect(await listFixtureEntries(root)).toEqual(before);
    }
  );

  return it("rejects unissued and rebound structural plans without writes", async () => {
    const first = await fixture();
    const second = await fixture();
    const plan = await createGenerationPlan(
      first.root,
      validateFeatureName("order-item")
    );
    const clones = [
      { ...plan, files: [...plan.files] } as GenerationPlan,
      { ...plan, targetRoot: second.root } as GenerationPlan,
    ];
    const beforeFirst = await listFixtureEntries(first.root);
    const beforeSecond = await listFixtureEntries(second.root);

    await expect(applyGenerationPlan(clones[0]!)).rejects.toThrow(
      /capability|issued/i
    );
    await expect(applyGenerationPlan(clones[1]!)).rejects.toThrow(
      /capability|issued/i
    );
    expect(await listFixtureEntries(first.root)).toEqual(beforeFirst);
    return expect(await listFixtureEntries(second.root)).toEqual(beforeSecond);
  });
});

describe("DF-069 transactional live apply and verification", () => {
  it("supports dry-run with no writes", async () => {
    const { root } = await fixture();
    const before = await listFixtureEntries(root);
    const result = await generateFeature(["order-item", "--dry-run"], {
      targetRoot: root,
    });

    expect(result.report).toMatchObject({ status: "planned", dryRun: true });
    return expect(await listFixtureEntries(root)).toEqual(before);
  });

  it("applies, verifies, and reports through the complete workflow", async () => {
    const { root } = await fixture();
    const result = await generateFeature(["order-item"], { targetRoot: root });

    expect(result.verification).toMatchObject({
      isValid: true,
      filesChecked: result.plan.files.length,
      planId: result.plan.planId,
    });
    expect(result.report).toMatchObject({
      status: "applied",
      dryRun: false,
      cleanup: "complete",
    });
    expect(
      await readFile(
        join(root, "apps/web/src/features/order-item/names.ts"),
        "utf8"
      )
    ).toContain('route: "/order-items"');
    return expect(await listFixtureEntries(root)).not.toContain(
      ".darkfactory/.generate-feature.lock"
    );
  });
  it("does not follow a feature-directory symlink outside the workspace", async () => {
    const { root } = await fixture();
    const outside = await mkdtemp(
      join(tmpdir(), "darkfactory-generator-outside-")
    );
    cleanups.push(async () => rm(outside, { force: true, recursive: true }));
    await replaceFeaturesDirectoryWithSymlink(root, outside);

    await expect(
      generateFeature(["order-item"], { targetRoot: root })
    ).rejects.toThrow();
    return expect(await readFile(join(root, "package.json"), "utf8")).toContain(
      "fixture"
    );
  });

  it("preserves a lock it did not acquire", async () => {
    const { root } = await fixture();
    const lock = join(root, ".darkfactory/.generate-feature.lock");
    await mkdir(lock);
    await writeFile(join(lock, "user-note.txt"), "preserve me", "utf8");
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );

    await expect(applyGenerationPlan(plan)).rejects.toThrow(/progress/i);
    return await expect(
      readFile(join(lock, "user-note.txt"), "utf8")
    ).resolves.toBe("preserve me");
  });

  it("rejects a workspace rebound after planning without writing through the alias", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const before = await listFixtureEntries(root);
    const movedRoot = `${root}-moved`;
    await rename(root, movedRoot);
    await symlink(movedRoot, root, "dir");
    cleanups.push(async () => rm(movedRoot, { force: true, recursive: true }));

    await expect(applyGenerationPlan(plan)).rejects.toMatchObject({
      code: "ANCESTOR_CHANGED",
    });
    return expect(await listFixtureEntries(movedRoot)).toEqual(before);
  });

  it("rejects a create target introduced after planning and preserves it", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const destination = join(root, "docs/features/order-item.md");
    await mkdir(join(root, "docs/features"), { recursive: true });
    await writeFile(destination, "user-authored documentation", "utf8");

    await expect(applyGenerationPlan(plan)).rejects.toMatchObject({
      code: "TARGET_COLLISION",
    });
    await expect(readFile(destination, "utf8")).resolves.toBe(
      "user-authored documentation"
    );
    return expect(
      (await listFixtureEntries(root)).some((entry) =>
        entry.startsWith(".generate-feature-")
      )
    ).toBe(false);
  });

  it("rejects missing and stale replacement targets after planning", async () => {
    for (const mutation of ["missing", "stale"] as const) {
      const { root } = await fixture();
      const plan = await createGenerationPlan(
        root,
        validateFeatureName("order-item")
      );
      const registryPath = join(root, ".darkfactory/features.json");
      if (mutation === "missing") {
        await unlink(registryPath);
      } else await writeFile(registryPath, "user registry edit", "utf8");
      const before = await listFixtureEntries(root);

      await expect(applyGenerationPlan(plan)).rejects.toMatchObject({
        code: "TARGET_COLLISION",
      });
      expect(await listFixtureEntries(root)).toEqual(before);
      if (mutation === "missing") {
        await expect(readFile(registryPath, "utf8")).rejects.toMatchObject({
          code: "ENOENT",
        });
      } else {
        await expect(readFile(registryPath, "utf8")).resolves.toBe(
          "user registry edit"
        );
      }
    }
  });

  it("serializes different features that share generated registries", async () => {
    const { root } = await fixture();
    const firstPlan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const secondPlan = await createGenerationPlan(
      root,
      validateFeatureName("invoice-item")
    );
    // Manual deferred: the configured lib predates Promise.withResolvers.
    const deferred = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((settle) => {
        resolve = settle;
      });
      return { promise, resolve };
    };
    const entered = deferred();
    const release = deferred();
    const firstApply = applyGenerationPlan(firstPlan, {
      beforePromotion: async () => {
        entered.resolve();
        return await release.promise;
      },
    });
    await entered.promise;

    await expect(applyGenerationPlan(secondPlan)).rejects.toMatchObject({
      code: "TARGET_COLLISION",
    });
    release.resolve();
    return await expect(firstApply).resolves.toMatchObject({
      cleanup: "complete",
    });
  });

  it("refuses occupied feature-owned directories without writing", async () => {
    for (const relativeDirectory of [
      "apps/web/src/features/order-item",
      "apps/web/src/app/(portal)/order-items",
      "packages/api/src/generated/order-item",
      "packages/db/src/generated/order-item",
    ]) {
      const { root } = await fixture();
      const occupied = join(root, ...relativeDirectory.split("/"));
      await mkdir(occupied, { recursive: true });
      await writeFile(join(occupied, "user-work.txt"), "preserve", "utf8");
      const before = await listFixtureEntries(root);

      await expect(
        createGenerationPlan(root, validateFeatureName("order-item"))
      ).rejects.toMatchObject({ code: "TARGET_COLLISION" });
      expect(await listFixtureEntries(root)).toEqual(before);
    }
  });
  it("refuses feature-owned directory occupancy introduced after planning", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const occupied = join(root, "packages/api/src/generated/order-item");
    await mkdir(occupied, { recursive: true });
    await writeFile(join(occupied, "user-work.txt"), "preserve", "utf8");

    await expect(applyGenerationPlan(plan)).rejects.toMatchObject({
      code: "TARGET_COLLISION",
    });
    return await expect(
      readFile(join(occupied, "user-work.txt"), "utf8")
    ).resolves.toBe("preserve");
  });

  it("fails closed when a generated parent identity changes before promotion", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const featureDirectory = join(root, "apps/web/src/features/order-item");
    const movedDirectory = join(root, "apps/web/src/features/order-item-moved");

    await expect(
      applyGenerationPlan(plan, {
        beforePromotion: async () => {
          await rename(featureDirectory, movedDirectory);
          return await mkdir(featureDirectory);
        },
      })
    ).rejects.toMatchObject({ code: "ROLLBACK_UNSAFE" });
    return expect(await listFixtureEntries(featureDirectory)).toEqual([]);
  });

  it("does not acquire its global lock through an outside symlink", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const outside = await mkdtemp(join(tmpdir(), "darkfactory-lock-outside-"));
    cleanups.push(async () => rm(outside, { force: true, recursive: true }));
    await writeFile(join(outside, "user-work.txt"), "preserve", "utf8");
    await rename(
      join(root, ".darkfactory"),
      join(root, ".darkfactory-original")
    );
    await symlink(outside, join(root, ".darkfactory"), "dir");
    const before = await listFixtureEntries(outside);

    await expect(applyGenerationPlan(plan)).rejects.toMatchObject({
      code: "SYMLINK_UNSAFE",
    });
    return expect(await listFixtureEntries(outside)).toEqual(before);
  });
  it("refuses a raced-in destination and restores registries", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const before = await readGeneratedFiles(root, registryPaths);
    const destination = join(
      root,
      "apps/web/src/app/(portal)/order-items/page.tsx"
    );

    await expect(
      applyGenerationPlan(plan, {
        beforePromotion: async () => {
          await mkdir(join(root, "apps/web/src/app/(portal)/order-items"), {
            recursive: true,
          });
          return await writeFile(destination, "user work", "utf8");
        },
      })
    ).rejects.toMatchObject({ code: "ROLLBACK_UNSAFE" });
    await expect(readFile(destination, "utf8")).resolves.toBe("user work");
    return expect(await readGeneratedFiles(root, registryPaths)).toEqual(
      before
    );
  });

  it("does not delete replacement work when rollback ownership changes", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const first = plan.files[0]!;
    const firstPath = join(root, ...first.path.split("/"));

    await expect(
      applyGenerationPlan(plan, {
        afterFilePromotion: async (_file, index) => {
          if (index !== 0) return;
          await writeFile(firstPath, "replacement user work", "utf8");
          throw new Error("injected replacement");
        },
      } as ApplyGenerationOptions)
    ).rejects.toMatchObject({ code: "ROLLBACK_UNSAFE" });
    return await expect(readFile(firstPath, "utf8")).resolves.toBe(
      "replacement user work"
    );
  });
  it("does not delete a same-byte replacement with a different inode", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const first = plan.files[0]!;
    const firstPath = join(root, ...first.path.split("/"));

    await expect(
      applyGenerationPlan(plan, {
        afterFilePromotion: async (_file, index) => {
          if (index !== 0) return;
          await unlink(firstPath);
          await writeFile(firstPath, first.content, "utf8");
          throw new Error("injected same-byte replacement");
        },
      })
    ).rejects.toMatchObject({ code: "ROLLBACK_UNSAFE" });
    return await expect(readFile(firstPath, "utf8")).resolves.toBe(
      first.content
    );
  });

  it("preserves a promoted artifact when rollback ownership validation faults", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const created = plan.files.find((file) => file.operation === "create")!;
    const destination = join(plan.targetRoot, ...created.path.split("/"));
    const registriesBefore = await readGeneratedFiles(
      plan.targetRoot,
      registryPaths
    );
    let rollbackReady = false;
    let rollbackValidations = 0;
    let promotedIdentity: Awaited<ReturnType<typeof identityAt>> | undefined;

    await expect(
      applyGenerationPlan(plan, {
        dependencies: {
          assertNoSymlinkPath: async (targetRoot, relativePath) => {
            const candidate = join(targetRoot, ...relativePath.split("/"));
            if (rollbackReady && candidate === destination) {
              rollbackValidations += 1;
              throw Object.assign(
                new Error("injected rollback validation failure"),
                {
                  code: "EIO",
                }
              );
            }
            return assertNoSymlinkPath(targetRoot, relativePath);
          },
        },
        afterFilePromotion: async (file) => {
          if (file.path !== created.path) return;
          promotedIdentity = await identityAt(destination);
          rollbackReady = true;
          throw new Error("injected post-promotion failure");
        },
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_UNSAFE",
      cause: { message: "injected post-promotion failure" },
    });
    expect(rollbackValidations).toBe(1);
    expect(await hasIdentity(promotedIdentity!)).toBe(true);
    await expect(readFile(destination, "utf8")).resolves.toBe(created.content);
    return expect(
      await readGeneratedFiles(plan.targetRoot, registryPaths)
    ).toEqual(registriesBefore);
  });

  it("restores promoted work when a replacement changes during promotion", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const navigationPath = "apps/web/src/features/generated-navigation.ts";
    expect(plan.files[2]?.path).toBe(navigationPath);
    const descriptorBefore = await readFile(
      join(root, ".darkfactory/features.json"),
      "utf8"
    );

    await expect(
      applyGenerationPlan(plan, {
        afterFilePromotion: async (_file, index) => {
          if (index === 1) {
            return await writeFile(
              join(root, navigationPath),
              "raced user navigation",
              "utf8"
            );
          }
          return;
        },
      })
    ).rejects.toMatchObject({ code: "TARGET_COLLISION" });

    await expect(readFile(join(root, navigationPath), "utf8")).resolves.toBe(
      "raced user navigation"
    );
    await expect(
      readFile(join(root, ".darkfactory/features.json"), "utf8")
    ).resolves.toBe(descriptorBefore);
    return await expect(
      readFile(
        join(root, "apps/web/src/app/(portal)/order-items/page.tsx"),
        "utf8"
      )
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rolls back when a staged destination parent disappears before linking", async () => {
    const { root } = await fixture();
    const beforeEntries = await listFixtureEntries(root);
    const beforeRegistries = await readGeneratedFiles(root, registryPaths);
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const destinationParent = join(
      root,
      "apps/web/src/app/(portal)/order-items"
    );

    await expect(
      applyGenerationPlan(plan, {
        beforePromotion: async () => {
          return await rm(destinationParent, { force: true, recursive: true });
        },
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_UNSAFE",
      cause: { code: "ANCESTOR_CHANGED" },
    });
    expect(await listFixtureEntries(root)).toEqual(beforeEntries);
    return expect(await readGeneratedFiles(root, registryPaths)).toEqual(
      beforeRegistries
    );
  });

  it("reports manual cleanup when its staging identity disappears after commit", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const result = await applyGenerationPlan(plan, {
      afterPromotion: async () => {
        const stagingEntry = (await listFixtureEntries(root)).find(
          (entry) =>
            entry.startsWith(".generate-feature-") && !entry.includes("/")
        );
        if (!stagingEntry)
          throw new Error("Expected generator staging directory");
        return await rm(join(root, stagingEntry), {
          force: true,
          recursive: true,
        });
      },
    });

    expect(result.cleanup).toBe("manual-cleanup-required");
    await expect(verifyGeneration(plan)).resolves.toMatchObject({
      isValid: true,
      filesChecked: plan.files.length,
    });
    return expect(
      (await listFixtureEntries(root)).some((entry) =>
        entry.startsWith(".generate-feature-")
      )
    ).toBe(false);
  });
  it("emits valid Drizzle SQL interpolation in generated schemas", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const schema = plan.files.find((file) => file.path.endsWith("/schema.ts"))!;

    expect(schema.content).toContain("${table.status}");
    expect(schema.content).toContain("${table.name}");
    return expect(schema.content).not.toContain("4{table.");
  });

  it("fails safe rather than replacing a registry when backup tracking is unavailable", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const registryPath = ".darkfactory/features.json";
    expect(plan.files[0]?.path).toBe(registryPath);
    const originalGet = Map.prototype.get;
    let registryGets = 0;
    const getSpy = vi.spyOn(Map.prototype, "get").mockImplementation(function (
      this: Map<unknown, unknown>,
      key: unknown
    ): unknown {
      if (key === registryPath && ++registryGets === 2) return undefined;
      return originalGet.call(this, key);
    });

    try {
      await expect(
        applyGenerationPlan(plan, {
          afterFilePromotion: async (_file, index) => {
            if (index === 0)
              throw new Error("injected post-replacement failure");
            return;
          },
        })
      ).rejects.toMatchObject({
        code: "ROLLBACK_UNSAFE",
        cause: { message: "injected post-replacement failure" },
      });
      expect(registryGets).toBeGreaterThanOrEqual(2);
      return await expect(
        readFile(join(root, registryPath), "utf8")
      ).resolves.toBe(plan.files[0]!.content);
    } finally {
      getSpy.mockRestore();
    }
  });

  it("detects generated registry tampering", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    await applyGenerationPlan(plan);
    await writeFile(
      join(root, "packages/api/src/generated/contract-registry.ts"),
      "stale",
      "utf8"
    );

    return await expect(verifyGeneration(plan)).rejects.toMatchObject({
      code: "VERIFICATION_FAILED",
    });
  });

  it("distinguishes non-files from missing artifacts during verification", async () => {
    const nonFileFixture = await fixture();
    const nonFilePlan = await createGenerationPlan(
      nonFileFixture.root,
      validateFeatureName("order-item")
    );
    await applyGenerationPlan(nonFilePlan);
    const nonFile = nonFilePlan.files.find(
      (file) => file.operation === "create"
    )!;
    const nonFilePath = join(nonFileFixture.root, ...nonFile.path.split("/"));
    await unlink(nonFilePath);
    await mkdir(nonFilePath);

    await expect(verifyGeneration(nonFilePlan)).rejects.toMatchObject({
      code: "VERIFICATION_FAILED",
      message: "Generated artifact is not a regular file",
    });

    const missingFixture = await fixture();
    const missingPlan = await createGenerationPlan(
      missingFixture.root,
      validateFeatureName("invoice-item")
    );
    await applyGenerationPlan(missingPlan);
    const missing = missingPlan.files.at(-1)!;
    await unlink(join(missingFixture.root, ...missing.path.split("/")));

    return await expect(verifyGeneration(missingPlan)).rejects.toMatchObject({
      code: "VERIFICATION_FAILED",
      message: "Generation verification failed",
      cause: { code: "ENOENT" },
    });
  });

  it("uses portable verification flags when O_NOFOLLOW is unavailable", async () => {
    const { root } = await fixture();
    const noFollow = fsMocks.constants["O_NOFOLLOW"];
    Reflect.deleteProperty(fsMocks.constants, "O_NOFOLLOW");

    try {
      const plan = await createGenerationPlan(
        root,
        validateFeatureName("order-item")
      );
      await applyGenerationPlan(plan);
      return await expect(verifyGeneration(plan)).resolves.toMatchObject({
        isValid: true,
        filesChecked: plan.files.length,
      });
    } finally {
      fsMocks.constants["O_NOFOLLOW"] = noFollow;
    }
  });

  return it("fails closed if application returns without running verification", async () => {
    const { root } = await fixture();
    const before = await listFixtureEntries(root);
    vi.doMock("../../scripts/generate-feature/apply.ts", () => ({
      applyGenerationPlan: vi.fn(async () =>
        Object.freeze({
          capsulePath: "unused",
          promotedFiles: Object.freeze([]),
          cleanup: "complete" as const,
        })
      ),
    }));
    vi.resetModules();

    try {
      const { generateFeature: generateWithoutVerification } = await import(
        "../../scripts/generate-feature/workflow.ts"
      );
      await expect(
        generateWithoutVerification(["order-item"], { targetRoot: root })
      ).rejects.toThrow("Generation verification did not complete");
      return expect(await listFixtureEntries(root)).toEqual(before);
    } finally {
      vi.doUnmock("../../scripts/generate-feature/apply.ts");
      vi.resetModules();
    }
  });
});

describe("DF-070 deterministic reports and thin CLI", () => {
  it("renders deterministic human and machine reports", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const first = createGenerationReport(plan, "planned", true);
    const second = createGenerationReport(plan, "planned", true);

    expect(first).toEqual(second);
    expect(first.integration).toBe("generator-owned-registries");
    expect(formatHumanReport(first)).toBe(formatHumanReport(second));
    return expect(serializeGenerationReport(first)).toBe(
      serializeGenerationReport(second)
    );
  });

  it("sanitizes control-bearing options and filesystem paths", async () => {
    const { root } = await fixture();
    const dangerous = "--bad\u001b[31m";
    const errors: string[] = [];
    const invalidCode = await runFeatureGeneratorCli(
      ["order-item", dangerous, "--json"],
      {
        targetRoot: root,
        writeOutput: () => undefined,
        writeError: (value) => errors.push(value),
      }
    );
    const missingCode = await runFeatureGeneratorCli(["order-item", "--json"], {
      targetRoot: join(root, "missing"),
      writeOutput: () => undefined,
      writeError: (value) => errors.push(value),
    });

    expect([invalidCode, missingCode]).toEqual([1, 1]);
    expect(errors.join(" ")).not.toContain(dangerous);
    return expect(errors.join(" ")).not.toContain(root);
  });

  it("renders the applied human-report branches and default cleanup", async () => {
    const { root } = await fixture();
    const plan = await createGenerationPlan(
      root,
      validateFeatureName("order-item")
    );
    const report = createGenerationReport(plan, "applied", false);
    const human = formatHumanReport(report);

    expect(report.cleanup).toBe("complete");
    expect(human).toContain("Feature capsule generated: order-item");
    expect(human).toContain(
      "The capsule was atomically promoted and verified."
    );
    return expect(human).not.toContain("No files were written.");
  });

  it("writes successful human and JSON CLI reports", async () => {
    const { root } = await fixture();
    const humanOutput: string[] = [];
    const humanErrors: string[] = [];
    const humanCode = await runFeatureGeneratorCli(
      ["order-item", "--dry-run"],
      {
        targetRoot: root,
        writeOutput: (value) => humanOutput.push(value),
        writeError: (value) => humanErrors.push(value),
      }
    );
    const jsonOutput: string[] = [];
    const jsonErrors: string[] = [];
    const jsonCode = await runFeatureGeneratorCli(
      ["order-item", "--dry-run", "--json"],
      {
        targetRoot: root,
        writeOutput: (value) => jsonOutput.push(value),
        writeError: (value) => jsonErrors.push(value),
      }
    );

    expect([humanCode, jsonCode]).toEqual([0, 0]);
    expect(humanErrors).toEqual([]);
    expect(jsonErrors).toEqual([]);
    expect(humanOutput).toHaveLength(1);
    expect(humanOutput[0]).toContain("Feature generation plan: order-item");
    return expect(JSON.parse(jsonOutput[0]!)).toMatchObject({
      version: 1,
      status: "planned",
      feature: "order-item",
      dryRun: true,
    });
  });

  return it("writes human typed failures and sanitizes an unexpected output-sink failure", async () => {
    const { root } = await fixture();
    const humanErrors: string[] = [];
    const typedCode = await runFeatureGeneratorCli(["OrderItem"], {
      targetRoot: root,
      writeOutput: () => undefined,
      writeError: (value) => humanErrors.push(value),
    });
    const genericErrors: string[] = [];
    const genericCode = await runFeatureGeneratorCli(
      ["order-item", "--dry-run", "--json"],
      {
        targetRoot: root,
        writeOutput: () => {
          throw new Error("private sink failure");
        },
        writeError: (value) => genericErrors.push(value),
      }
    );

    expect([typedCode, genericCode]).toEqual([1, 1]);
    expect(humanErrors).toEqual([
      "Feature generation failed [NAME_INVALID]: Feature name must be lowercase kebab-case\n",
    ]);
    expect(JSON.parse(genericErrors[0]!)).toEqual({
      version: 1,
      status: "failed",
      error: {
        code: "GENERATION_FAILED",
        message: "Feature generation could not be completed",
      },
    });
    return expect(genericErrors[0]).not.toContain("private sink failure");
  });
});

describe("DF-069 deterministic filesystem fault handling", () =>
  it("covers safe-parent, lock, owned-root, cleanup, and removal races", async () => {
    const faults = {
      kind: "none",
      target: "",
      code: "EIO",
      lstatCalls: 0,
    };
    const injectedError = (code: string): NodeJS.ErrnoException => {
      return Object.assign(new Error(`injected ${code}`), { code });
    };
    const configure = (kind: string, target: string, code = "EIO"): void => {
      faults.kind = kind;
      faults.target = target;
      faults.code = code;
      faults.lstatCalls = 0;
    };
    const observeLstat = async (path: string): Promise<void> => {
      if (faults.kind !== "rollback-disappears" || path !== faults.target)
        return;
      faults.lstatCalls += 1;
      if (faults.lstatCalls === 3) {
        await unlink(path);
      }
    };
    const faultDependencies: Readonly<Partial<ApplyGenerationDependencies>> = {
      assertNoSymlinkPath: async (root, relativePath) => {
        await observeLstat(join(root, ...relativePath.split("/")));
        return assertNoSymlinkPath(root, relativePath);
      },
      hasIdentity: async (expected) => {
        await observeLstat(expected.path);
        return hasIdentity(expected);
      },
      identityAt: async (path) => {
        if (
          faults.kind === "temp-identity-error" &&
          path.startsWith(join(faults.target, ".generate-feature-"))
        )
          throw injectedError(faults.code);
        return identityAt(path);
      },
      link: async (existingPath, newPath) => {
        if (faults.kind === "link-error" && newPath === faults.target) {
          throw injectedError(faults.code);
        }
        return link(existingPath, newPath);
      },
      lstat: async (path) => {
        await observeLstat(path);
        return lstat(path);
      },
      mkdir: async (path, options) => {
        if (faults.kind === "mkdir-error" && path === faults.target) {
          throw injectedError(faults.code);
        }
        if (faults.kind === "mkdir-eexist-file" && path === faults.target) {
          await writeFile(path, "raced parent", "utf8");
          throw injectedError("EEXIST");
        }
        if (
          faults.kind === "mkdir-eexist-directory" &&
          path === faults.target
        ) {
          await mkdir(path);
          throw injectedError("EEXIST");
        }
        return mkdir(path, options);
      },
      pathExists: async (path) => {
        await observeLstat(path);
        return pathExists(path);
      },
      rm: async (path, options) => {
        if (
          faults.kind === "rm-error" &&
          path.startsWith(join(faults.target, ".generate-feature-"))
        )
          throw injectedError(faults.code);
        return rm(path, options);
      },
      rmdir: async (path) => {
        if (faults.kind === "rmdir-enoent" && path === faults.target) {
          await rmdir(path);
          throw injectedError("ENOENT");
        }
        return rmdir(path);
      },
    };
    const applyWithFaults = (
      plan: GenerationPlan,
      options: ApplyGenerationOptions = {}
    ): ReturnType<typeof applyGenerationPlan> => {
      return applyGenerationPlan(plan, {
        ...options,
        dependencies: {
          ...options.dependencies,
          ...faultDependencies,
        },
      });
    };
    const planFor = async (root: string): Promise<GenerationPlan> => {
      configure("none", "");
      return createGenerationPlan(root, validateFeatureName("order-item"));
    };

    const tempIdentityFixture = await fixture();
    const tempIdentityPlan = await planFor(tempIdentityFixture.root);
    configure("temp-identity-error", tempIdentityPlan.targetRoot, "EIO");
    await expect(applyWithFaults(tempIdentityPlan)).rejects.toMatchObject({
      code: "ROLLBACK_UNSAFE",
      cause: { code: "EIO" },
    });
    expect(
      (await listFixtureEntries(tempIdentityFixture.root)).some((entry) =>
        entry.startsWith(".generate-feature-")
      )
    ).toBe(true);

    const lockFixture = await fixture();
    const lockPlan = await planFor(lockFixture.root);
    const lockBefore = await listFixtureEntries(lockFixture.root);
    configure(
      "mkdir-error",
      join(lockPlan.targetRoot, ".darkfactory/.generate-feature.lock"),
      "EACCES"
    );
    await expect(applyWithFaults(lockPlan)).rejects.toMatchObject({
      code: "EACCES",
    });
    expect(await listFixtureEntries(lockFixture.root)).toEqual(lockBefore);

    const parentFailureFixture = await fixture();
    const parentFailurePlan = await planFor(parentFailureFixture.root);
    const parentFailureBefore = await listFixtureEntries(
      parentFailureFixture.root
    );
    configure(
      "mkdir-error",
      join(parentFailurePlan.targetRoot, "apps/web/src/app"),
      "EACCES"
    );
    await expect(applyWithFaults(parentFailurePlan)).rejects.toMatchObject({
      code: "EACCES",
    });
    expect(await listFixtureEntries(parentFailureFixture.root)).toEqual(
      parentFailureBefore
    );

    const parentRaceFixture = await fixture();
    const parentRacePlan = await planFor(parentRaceFixture.root);
    const parentRacePath = join(parentRacePlan.targetRoot, "apps/web/src/app");
    configure("mkdir-eexist-file", parentRacePath);
    await expect(applyWithFaults(parentRacePlan)).rejects.toMatchObject({
      code: "SYMLINK_UNSAFE",
    });
    await expect(readFile(parentRacePath, "utf8")).resolves.toBe(
      "raced parent"
    );

    const directoryRaceFixture = await fixture();
    const directoryRacePlan = await planFor(directoryRaceFixture.root);
    configure(
      "mkdir-eexist-directory",
      join(directoryRacePlan.targetRoot, "apps/web/src/app")
    );
    await expect(applyWithFaults(directoryRacePlan)).resolves.toMatchObject({
      cleanup: "complete",
    });
    await expect(
      readFile(
        join(
          directoryRaceFixture.root,
          "apps/web/src/app/(portal)/order-items/page.tsx"
        ),
        "utf8"
      )
    ).resolves.toContain("OrderItems");

    const existingParentFixture = await fixture();
    const existingParentPlan = await planFor(existingParentFixture.root);
    const existingParentPath = join(
      existingParentFixture.root,
      "apps/web/src/app"
    );
    const movedExistingParentPath = `${existingParentPath}-moved`;
    const existingParentRegistries = await readGeneratedFiles(
      existingParentFixture.root,
      registryPaths
    );
    await expect(
      applyWithFaults(existingParentPlan, {
        beforePromotion: async () => {
          await rename(existingParentPath, movedExistingParentPath);
          return await writeFile(existingParentPath, "raced parent", "utf8");
        },
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_UNSAFE",
      cause: { code: "ANCESTOR_CHANGED" },
    });
    await expect(readFile(existingParentPath, "utf8")).resolves.toBe(
      "raced parent"
    );
    expect(
      await readGeneratedFiles(existingParentFixture.root, registryPaths)
    ).toEqual(existingParentRegistries);

    const ownedRootFixture = await fixture();
    const ownedRootPlan = await planFor(ownedRootFixture.root);
    const ownedRootBefore = await listFixtureEntries(ownedRootFixture.root);
    configure(
      "mkdir-error",
      join(ownedRootPlan.targetRoot, "apps/web/src/features/order-item"),
      "EIO"
    );
    await expect(applyWithFaults(ownedRootPlan)).rejects.toMatchObject({
      code: "EIO",
    });
    expect(await listFixtureEntries(ownedRootFixture.root)).toEqual(
      ownedRootBefore
    );

    const linkFailureFixture = await fixture();
    const linkFailurePlan = await planFor(linkFailureFixture.root);
    const linkFailureBefore = await listFixtureEntries(linkFailureFixture.root);
    const linkFailureRegistries = await readGeneratedFiles(
      linkFailureFixture.root,
      registryPaths
    );
    configure(
      "link-error",
      join(
        linkFailurePlan.targetRoot,
        "apps/web/src/app/(portal)/order-items/page.tsx"
      ),
      "ENOENT"
    );
    await expect(applyWithFaults(linkFailurePlan)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(await listFixtureEntries(linkFailureFixture.root)).toEqual(
      linkFailureBefore
    );
    expect(
      await readGeneratedFiles(linkFailureFixture.root, registryPaths)
    ).toEqual(linkFailureRegistries);

    const disappearingFixture = await fixture();
    const disappearingPlan = await planFor(disappearingFixture.root);
    const disappearingFile = disappearingPlan.files.find(
      (file) => file.path === "apps/web/src/app/(portal)/order-items/page.tsx"
    )!;
    const disappearingPath = join(
      disappearingPlan.targetRoot,
      ...disappearingFile.path.split("/")
    );
    const disappearingDescriptor = await readFile(
      join(disappearingFixture.root, ".darkfactory/features.json"),
      "utf8"
    );
    await expect(
      applyWithFaults(disappearingPlan, {
        afterFilePromotion: async (_file, index) => {
          if (index !== 1) return;
          configure("rollback-disappears", disappearingPath);
          throw new Error("injected disappearance");
        },
      })
    ).rejects.toMatchObject({
      code: "ROLLBACK_UNSAFE",
      cause: { message: "injected disappearance" },
    });
    expect(faults.lstatCalls).toBeGreaterThanOrEqual(3);
    await expect(readFile(disappearingPath, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(
      readFile(
        join(disappearingFixture.root, ".darkfactory/features.json"),
        "utf8"
      )
    ).resolves.toBe(disappearingDescriptor);

    const lockRemovalFixture = await fixture();
    const lockRemovalPlan = await planFor(lockRemovalFixture.root);
    configure(
      "rmdir-enoent",
      join(lockRemovalPlan.targetRoot, ".darkfactory/.generate-feature.lock")
    );
    await expect(applyWithFaults(lockRemovalPlan)).resolves.toMatchObject({
      cleanup: "complete",
    });
    expect(await listFixtureEntries(lockRemovalFixture.root)).not.toContain(
      ".darkfactory/.generate-feature.lock"
    );

    const cleanupFailureFixture = await fixture();
    const cleanupFailurePlan = await planFor(cleanupFailureFixture.root);
    configure("rm-error", cleanupFailurePlan.targetRoot, "EBUSY");
    await expect(applyWithFaults(cleanupFailurePlan)).resolves.toMatchObject({
      cleanup: "manual-cleanup-required",
    });
    return expect(
      (await listFixtureEntries(cleanupFailureFixture.root)).some((entry) =>
        entry.startsWith(".generate-feature-")
      )
    ).toBe(true);
  }));
