import { readdir, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"
import { parse } from "yaml"

// Durable security and structure invariants for every GitHub workflow. Keep
// this file free of step text, versions and shell snippets: those are free to
// change without weakening the pipeline.

type Step = {
  uses?: string
  with?: Record<string, unknown>
}
type Job = {
  name?: string
  uses?: string
  steps?: Step[]
  strategy?: { matrix?: Record<string, unknown> }
}
type Workflow = {
  on: unknown
  permissions?: unknown
  jobs: Record<string, Job>
}

const directory = new URL("../../.github/workflows/", import.meta.url)
const workflows = await Promise.all(
  (await readdir(directory))
    .filter((file) => /\.ya?ml$/.test(file))
    .sort()
    .map(async (file) => {
      const text = await readFile(new URL(file, directory), "utf8")
      return { file, text, workflow: parse(text) as Workflow }
    }
    ),
)
const jobs = workflows.flatMap(({ file, workflow }) => {
  return Object.entries(workflow.jobs).map(([id, job]) => ({ file, id, job }))
}
)
const steps = jobs.flatMap(({ file, id, job }) => {
  return (job.steps ?? []).map((step) => ({ file, id, step }))
}
)
const triggers = (on: unknown): string[] => {
  if (typeof on === "string") return [on]
  if (Array.isArray(on)) return on.map(String)
  return Object.keys(on as Record<string, unknown>)
}

describe("GitHub workflow invariants", () => {
  it("finds the workflow set", () => {
    return expect(workflows.map(({ file }) => file)).toEqual(expect.arrayContaining([
      "ci.yml", "codeql.yml", "dependency-review.yml", "scorecard.yml",
    ]))
  }
  )

  it("pins every action to a full commit SHA with a version comment", () => {
    const parsedUses = [
      ...jobs.flatMap(({ job }) => job.uses ?? []),
      ...steps.flatMap(({ step }) => step.uses ?? []),
    ]
    const lines = workflows.flatMap(({ file, text }) => {
      return text.split("\n")
        .filter((line) => /^\s*(?:-\s+)?uses:/.test(line))
        .map((line) => ({ file, line: line.trim() }))
    }
    )
    expect(lines).toHaveLength(parsedUses.length)
    expect(parsedUses.length).toBeGreaterThan(0)
    const results=[];for (const { file, line } of lines) {
      results.push(expect(line, file).toMatch(
        /^(?:-\s+)?uses:\s+[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s+v\d[\w.-]*$/,
      ))
    };return results;
  }
  )

  it("never triggers on pull_request_target", () => {
    const results1=[];for (const { file, workflow } of workflows) {
      results1.push(expect(triggers(workflow.on), file).not.toContain("pull_request_target"))
    };return results1;
  }
  )

  it("defaults every workflow token to no or read-only permissions", () => {
    const results2=[];for (const { file, workflow } of workflows) {
      const permissions = workflow.permissions
      if (permissions === "read-all") continue
      expect(permissions, file).toBeTypeOf("object")
      expect(permissions, file).not.toBeNull()
      const results3=[];for (const scope of Object.values(permissions as Record<string, unknown>)) {
        results3.push(expect(["read", "none"], file).toContain(scope))
      }results2.push(results3)
    };return results2;
  }
  )

  it("never persists checkout credentials", () => {
    const checkouts = steps.filter(({ step }) => {
      return step.uses?.startsWith("actions/checkout@")
    }
    )
    expect(checkouts.length).toBeGreaterThan(0)
    const results4=[];for (const { file, id, step } of checkouts) {
      results4.push(expect(step.with?.["persist-credentials"], `${file}#${id}`).toBe(false))
    };return results4;
  }
  )

  it("runs exactly the four CI verification lanes", () => {
    const ci = workflows.find(({ file }) => file === "ci.yml")!
    const lanes = Object.values(ci.workflow.jobs)
      .flatMap((job) => job.strategy?.matrix?.["lane"] ?? [])
    return expect(lanes).toEqual(["core", "coverage", "integration", "browser"])
  }
  )

  return it("keeps the job names that required status checks reference", () => {
    const names = jobs.map(({ job }) => job.name)
    return expect(names).toEqual(expect.arrayContaining([
      "Verification (${{ matrix.lane }})",
      "Analyze (${{ matrix.language }})",
      "Dependency Review",
    ]))
  }
  )
}
)
