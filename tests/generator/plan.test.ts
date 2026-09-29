import { createHash } from "node:crypto"
import { mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

import {
  assertGenerationPlanIntegrity,
  createGenerationPlan,
  generationPlanValidatorsForTest,
  sha256,
} from "../../scripts/generate-feature/plan.ts"
import type { GenerationPlan } from "../../scripts/generate-feature/types.ts"
import { validateFeatureName } from "../../scripts/generate-feature/validate.ts"
import { createGeneratorFixture } from "./fixture.ts"

const cleanups: Array<() => Promise<void>> = []

const fixture = async () => {
  const created = await createGeneratorFixture()
  cleanups.push(created.cleanup)
  return created
}

afterEach(async function() {
  return await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()))
})

const descriptor = (
  name = "order-item",
  migration = "0000_order_items",
) => {
  const names = validateFeatureName(name)
  return {
    name,
    route: `/${names.pluralKebab}`,
    apiNamespace: names.pluralCamel,
    table: names.pluralSnake,
    migration,
    docs: `docs/features/${names.kebab}.md`,
    graph: `apps/web/src/features/${names.kebab}/graphify.json`,
  }
}

const registry = (generated: unknown[] = []) => ({
  version: 1,
  builtIn: {
    name: "feature-item",
    route: "/feature-items",
    apiNamespace: "featureItems",
    table: "feature_items",
    status: "canonical-reference",
  },
  generated,
})

const journalEntry = (
  idx = 0,
  when = 1,
  tag = "0000_order_items",
) => ({
  idx,
  version: "7",
  when,
  tag,
  breakpoints: true,
})

const journal = (entries: unknown[] = []) => ({
  version: "7",
  dialect: "postgresql",
  entries,
})

const parseRegistryValue = (value: unknown): unknown => {
  return generationPlanValidatorsForTest.parseRegistry(JSON.stringify(value))
}

const parseJournalValue = (value: unknown): unknown => {
  return generationPlanValidatorsForTest.parseJournal(JSON.stringify(value))
}

const writeJson = async (path: string, value: unknown): Promise<void> => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8")
}

type Mutation = (value: any) => void

describe("generate-feature plan validators", function() {
  it("hashes UTF-8 content deterministically", function() {
    const value = "deterministic π content"
    expect(sha256(value)).toBe(
      createHash("sha256").update(value, "utf8").digest("hex"),
    )
    return expect(sha256(value)).toMatch(/^[a-f0-9]{64}$/)
  })

  it("orders strings by locale-independent UTF-16 code units", function() {
    expect(generationPlanValidatorsForTest.compareCodeUnits("alpha", "beta")).toBe(-1)
    expect(generationPlanValidatorsForTest.compareCodeUnits("beta", "alpha")).toBe(1)
    return expect(generationPlanValidatorsForTest.compareCodeUnits("same", "same")).toBe(0)
  })

  it("accepts the exact registry schema including a canonical ordered descriptor", function() {
    const value = registry([descriptor()])
    expect(parseRegistryValue(value)).toEqual(value)
    return expect(Object.isFrozen(generationPlanValidatorsForTest)).toBe(true)
  })

  it("rejects malformed registry roots and exact-key violations", function() {
    const results=[];for (const [label, content] of [
      ["malformed JSON", "{"],
      ["null", "null"],
      ["primitive", '"registry"'],
      ["array", "[]"],
      ["wrong root keys", '{"version":1}'],
    ] as const) {
      results.push(expect(
        () => generationPlanValidatorsForTest.parseRegistry(content),
        label,
      ).toThrowError("Feature registry is invalid"))
    };return results;
  })

  it("rejects every malformed built-in registry field", function() {
    const cases: Array<readonly [string, Mutation]> = [
      ["version", (value) => {
        return value.version = 2
      }
      ],
      ["missing built-in", (value) => {
        return value.builtIn = null
      }
      ],
      ["primitive built-in", (value) => {
        return value.builtIn = "feature-item"
      }
      ],
      ["built-in keys", (value) => {
        return value.builtIn.extra = true
      }
      ],
      ["name", (value) => {
        return value.builtIn.name = "other"
      }
      ],
      ["route", (value) => {
        return value.builtIn.route = "/other"
      }
      ],
      ["namespace", (value) => {
        return value.builtIn.apiNamespace = "other"
      }
      ],
      ["table", (value) => {
        return value.builtIn.table = "other"
      }
      ],
      ["status", (value) => {
        return value.builtIn.status = "other"
      }
      ],
      ["generated collection", (value) => {
        return value.generated = {}
      }
      ],
    ]

    const results1=[];for (const [label, mutate] of cases) {
      const value: any = registry()
      mutate(value)
      results1.push(expect(() => parseRegistryValue(value), label).toThrowError(
        "Feature registry is invalid",
      ))
    };return results1;
  })

  it("rejects every malformed generated feature descriptor field", function() {
    const cases: Array<readonly [string, Mutation]> = [
      ["missing descriptor", (value) => {
        return value.generated[0] = null
      }
      ],
      ["primitive descriptor", (value) => {
        return value.generated[0] = "order-item"
      }
      ],
      ["descriptor keys", (value) => {
        return value.generated[0].extra = true
      }
      ],
      ["name type", (value) => {
        return value.generated[0].name = 1
      }
      ],
      ["route type", (value) => {
        return value.generated[0].route = 1
      }
      ],
      ["namespace type", (value) => {
        return value.generated[0].apiNamespace = 1
      }
      ],
      ["table type", (value) => {
        return value.generated[0].table = 1
      }
      ],
      ["migration type", (value) => {
        return value.generated[0].migration = 1
      }
      ],
      ["docs type", (value) => {
        return value.generated[0].docs = 1
      }
      ],
      ["graph type", (value) => {
        return value.generated[0].graph = 1
      }
      ],
      ["canonical name", (value) => {
        return value.generated[0].name = "OrderItem"
      }
      ],
      ["route value", (value) => {
        return value.generated[0].route = "/wrong"
      }
      ],
      ["namespace value", (value) => {
        return value.generated[0].apiNamespace = "wrong"
      }
      ],
      ["table value", (value) => {
        return value.generated[0].table = "wrong"
      }
      ],
      ["migration prefix", (value) => {
        return value.generated[0].migration = "bad_order_items"
      }
      ],
      ["migration suffix", (value) => {
        return value.generated[0].migration = "0000_wrong"
      }
      ],
      ["docs value", (value) => {
        return value.generated[0].docs = "docs/features/wrong.md"
      }
      ],
      ["graph value", (value) => {
        return value.generated[0].graph = "apps/web/src/features/wrong/graphify.json"
      }
      ],
      ["strict ordering", (value) => {
        return value.generated = [
          descriptor("order-item", "0001_order_items"),
          descriptor("invoice-item", "0000_invoice_items"),
        ]
      }
      ],
      ["duplicate name", (value) => {
        return value.generated = [descriptor(), descriptor()]
      }
      ],
    ]

    const results2=[];for (const [label, mutate] of cases) {
      const value: any = registry([descriptor()])
      mutate(value)
      results2.push(expect(() => parseRegistryValue(value), label).toThrowError(
        "Feature registry is invalid",
      ))
    };return results2;
  })

  it("accepts the exact migration journal schema and increasing unique entries", function() {
    const value = journal([
      journalEntry(0, 10, "0000_invoice_items"),
      journalEntry(1, 11, "0001_order_items"),
    ])
    return expect(parseJournalValue(value)).toEqual(value)
  })

  it("rejects malformed journal roots and exact-key violations", function() {
    for (const [label, content] of [
      ["malformed JSON", "{"],
      ["null", "null"],
      ["primitive", '"journal"'],
      ["array", "[]"],
      ["wrong root keys", '{"version":"7"}'],
    ] as const) {
      expect(
        () => generationPlanValidatorsForTest.parseJournal(content),
        label,
      ).toThrowError("Migration journal is invalid")
    }

    const cases: Array<readonly [string, Mutation]> = [
      ["version", (value) => {
        return value.version = "6"
      }
      ],
      ["dialect", (value) => {
        return value.dialect = "sqlite"
      }
      ],
      ["entries", (value) => {
        return value.entries = {}
      }
      ],
    ]
    const results3=[];for (const [label, mutate] of cases) {
      const value: any = journal()
      mutate(value)
      results3.push(expect(() => parseJournalValue(value), label).toThrowError(
        "Migration journal is invalid",
      ))
    };return results3;
  })

  return it("rejects every malformed migration journal entry field", function() {
    const cases: Array<readonly [string, Mutation]> = [
      ["missing entry", (value) => {
        return value.entries[0] = null
      }
      ],
      ["primitive entry", (value) => {
        return value.entries[0] = "entry"
      }
      ],
      ["entry keys", (value) => {
        return value.entries[0].extra = true
      }
      ],
      ["index", (value) => {
        return value.entries[0].idx = 1
      }
      ],
      ["entry version", (value) => {
        return value.entries[0].version = "6"
      }
      ],
      ["timestamp type", (value) => {
        return value.entries[0].when = 1.5
      }
      ],
      ["timestamp order", (value) => {
        return value.entries = [journalEntry(0, 10, "0000_first"), journalEntry(1, 10, "0001_second")]
      }
      ],
      ["tag type", (value) => {
        return value.entries[0].tag = 1
      }
      ],
      ["tag shape", (value) => {
        return value.entries[0].tag = "../escape"
      }
      ],
      ["duplicate tag", (value) => {
        return value.entries = [journalEntry(0, 10, "same_tag"), journalEntry(1, 11, "same_tag")]
      }
      ],
      ["breakpoints", (value) => {
        return value.entries[0].breakpoints = "true"
      }
      ],
    ]

    const results4=[];for (const [label, mutate] of cases) {
      const value: any = journal([journalEntry()])
      mutate(value)
      results4.push(expect(() => parseJournalValue(value), label).toThrowError(
        "Migration journal is invalid",
      ))
    };return results4;
  })
})

describe("createGenerationPlan", function() {
  it("issues a deeply immutable capability and rejects every structural clone", async function() {
    const { root } = await fixture()
    const plan = await createGenerationPlan(root, validateFeatureName("order-item"))

    expect(Object.isFrozen(plan)).toBe(true)
    expect(Object.isFrozen(plan.names)).toBe(true)
    expect(Object.isFrozen(plan.files)).toBe(true)
    expect(plan.files.every((file) => Object.isFrozen(file))).toBe(true)
    expect(() => assertGenerationPlanIntegrity(plan)).not.toThrow()

    const results5=[];for (const clone of [
      { ...plan },
      { ...plan, files: [...plan.files] },
      { ...plan, targetRoot: `${plan.targetRoot}-rebound` },
    ]) {
      results5.push(expect(() => assertGenerationPlanIntegrity(clone as GenerationPlan)).toThrowError(
        "Generation plan capability was not issued",
      ))
    };return results5;
  })

  it("rejects inconsistent caller-supplied name forms before filesystem access", async function() {
    const names = {
      ...validateFeatureName("order-item"),
      pluralKebab: "wrong-items",
    }
    return await expect(createGenerationPlan("/not-consulted", names)).rejects.toMatchObject({
      code: "PLAN_INVALID",
    })
  })

  it("wraps unavailable required registries without leaking filesystem details", async function() {
    const { root } = await fixture()
    await rm(join(root, "packages/api/src/generated/public-registry.ts"))

    return await expect(createGenerationPlan(root, validateFeatureName("order-item"))).rejects.toMatchObject({
      code: "PLAN_INVALID",
      cause: { code: "ENOENT" },
    })
  })

  it("rejects a required registry that is not a regular file", async function() {
    const { root } = await fixture()
    const registryPath = join(root, "packages/api/src/generated/public-registry.ts")
    await rm(registryPath)
    await mkdir(registryPath)

    return await expect(createGenerationPlan(root, validateFeatureName("order-item"))).rejects.toMatchObject({
      code: "SYMLINK_UNSAFE",
    })
  })

  it("rejects an already registered feature even without an owned-directory collision", async function() {
    const { root } = await fixture()
    await writeJson(
      join(root, ".darkfactory/features.json"),
      registry([descriptor()]),
    )
    await writeJson(
      join(root, "packages/db/migrations/meta/_journal.json"),
      journal([journalEntry()]),
    )

    return await expect(createGenerationPlan(root, validateFeatureName("order-item"))).rejects.toMatchObject({
      code: "TARGET_COLLISION",
    })
  })

  it("rejects a registry whose descriptor has no matching journal tag", async function() {
    const { root } = await fixture()
    await writeJson(
      join(root, ".darkfactory/features.json"),
      registry([descriptor()]),
    )

    return await expect(createGenerationPlan(root, validateFeatureName("invoice-item"))).rejects.toMatchObject({
      code: "PLAN_INVALID",
    })
  })

  it("rejects a colliding generated leaf outside the feature-owned directories", async function() {
    const { root } = await fixture()
    const documentationPath = join(root, "docs/features/order-item.md")
    await mkdir(join(root, "docs/features"), { recursive: true })
    await writeFile(documentationPath, "user-authored documentation", "utf8")

    return await expect(createGenerationPlan(root, validateFeatureName("order-item"))).rejects.toMatchObject({
      code: "TARGET_COLLISION",
    })
  })

  return it("sorts an appended descriptor and advances a non-empty migration journal", async function() {
    const { root } = await fixture()
    await writeJson(
      join(root, ".darkfactory/features.json"),
      registry([descriptor("invoice-item", "0000_invoice_items")]),
    )
    await writeJson(
      join(root, "packages/db/migrations/meta/_journal.json"),
      journal([journalEntry(0, 10, "0000_invoice_items")]),
    )

    const plan = await createGenerationPlan(root, validateFeatureName("order-item"))
    const descriptorFile = plan.files.find((file) => file.path === ".darkfactory/features.json")
    const journalFile = plan.files.find(
      (file) => file.path === "packages/db/migrations/meta/_journal.json"
    )

    expect(plan.files.map((file) => file.path)).toEqual(
      [...plan.files.map((file) => file.path)].sort(
        generationPlanValidatorsForTest.compareCodeUnits,
      ),
    )
    if (!descriptorFile || !journalFile) {
      throw new Error("Expected generated registry replacements")
    }
    expect(descriptorFile.content.indexOf('"invoice-item"')).toBeLessThan(
      descriptorFile.content.indexOf('"order-item"'),
    )
    expect(journalFile.content).toContain('"idx": 1')
    expect(journalFile.content).toContain('"when": 11')
    return expect(journalFile.content).toContain('"tag": "0001_order_items"')
  })
})
