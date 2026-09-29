import { describe, expect, it } from "vitest"

import {
  isE2eFixtureEnabled,
  resolveE2eEmailPreviewOptions,
} from "./e2e-fixtures.ts"

describe("E2E-only route fixtures", function() {
  it("enables fixtures only for the explicit isolated E2E process", function() {
    expect(isE2eFixtureEnabled({ APP_ENV: "test", E2E_FIXTURES: "1" })).toBe(true)
    return expect(isE2eFixtureEnabled({
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      NODE_ENV: "development",
    })).toBe(true)
  })

  it("fails closed when the flag or isolated test environment is absent", function() {
    expect(isE2eFixtureEnabled({ APP_ENV: "test" })).toBe(false)
    expect(isE2eFixtureEnabled({
      APP_ENV: "test",
      E2E_FIXTURES: "true",
      NODE_ENV: "test",
    })).toBe(false)
    expect(isE2eFixtureEnabled({ E2E_FIXTURES: "1", NODE_ENV: "test" })).toBe(false)
    expect(isE2eFixtureEnabled({
      APP_ENV: "staging",
      E2E_FIXTURES: "1",
      NODE_ENV: "development",
    })).toBe(false)
    return expect(isE2eFixtureEnabled({
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      NODE_ENV: "production",
    })).toBe(false)
  })

  it("binds isolated auth and contact directories to the exact E2E run", function() {
    const hmacKey = "a".repeat(43)
    expect(resolveE2eEmailPreviewOptions({
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      E2E_RUN_ID: "run_123",
      E2E_EMAIL_PREVIEW_HMAC_KEY: hmacKey,
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://127.0.0.1:43123/v1/capture",
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "  /repo/test-results/e2e-runs/run_123/previews/auth  ",
    })).toEqual({
      captureEndpoint: "http://127.0.0.1:43123/v1/capture",
      authDirectory: "/repo/test-results/e2e-runs/run_123/previews/auth",
      contactDirectory: "/repo/test-results/e2e-runs/run_123/previews/contact",
      binding: { runId: "run_123", hmacKey },
    })
    return expect(resolveE2eEmailPreviewOptions({
      APP_ENV: "development",
      E2E_FIXTURES: "1",
    })).toBeUndefined()
  })

  it("fails closed instead of accepting shared or cross-run previews", function() {
    const valid = {
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      E2E_RUN_ID: "run_123",
      E2E_EMAIL_PREVIEW_HMAC_KEY: "a".repeat(43),
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://127.0.0.1:43123/v1/capture",
    }
    expect(() => resolveE2eEmailPreviewOptions(valid)).toThrowError(
      "E2E_EMAIL_PREVIEW_DIRECTORY is required when E2E fixtures are enabled",
    )
    expect(() => resolveE2eEmailPreviewOptions({
      ...valid,
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "/repo/test-results/e2e-runs/other-run/previews/auth",
    })).toThrowError("E2E email preview directory must belong to E2E_RUN_ID")
    expect(() => resolveE2eEmailPreviewOptions({
      ...valid,
      E2E_EMAIL_PREVIEW_HMAC_KEY: "not-a-key",
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "/repo/test-results/e2e-runs/run_123/previews/auth",
    })).toThrowError("E2E_EMAIL_PREVIEW_HMAC_KEY must be 32-byte base64url")
    return expect(() => resolveE2eEmailPreviewOptions({
      ...valid,
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://localhost:43123/v1/capture",
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "/repo/test-results/e2e-runs/run_123/previews/auth",
    })).toThrowError("E2E_EMAIL_PREVIEW_ENDPOINT must be an exact loopback capture URL")
  })

  it("rejects missing or non-canonical run identifiers before resolving paths", function() {
    const base = {
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      E2E_EMAIL_PREVIEW_HMAC_KEY: "a".repeat(43),
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://127.0.0.1:43123/v1/capture",
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "/repo/test-results/e2e-runs/run_123/previews/auth",
    }

    const results=[];for (const runId of [undefined, "", "../run", "run.with.dot", "x".repeat(129)]) {
      results.push(expect(() => resolveE2eEmailPreviewOptions({
        ...base,
        ...(runId === undefined ? {} : { E2E_RUN_ID: runId }),
      })).toThrowError("E2E_RUN_ID is required for E2E email previews"))
    };return results;
  })

  return it("rejects an absent or unparsable preview capture endpoint", function() {
    const base = {
      APP_ENV: "test",
      E2E_FIXTURES: "1",
      E2E_RUN_ID: "run_123",
      E2E_EMAIL_PREVIEW_HMAC_KEY: "a".repeat(43),
      E2E_EMAIL_PREVIEW_DIRECTORY:
        "/repo/test-results/e2e-runs/run_123/previews/auth",
    }

    const results1=[];for (const endpoint of [undefined, "not a URL"]) {
      results1.push(expect(() => resolveE2eEmailPreviewOptions({
        ...base,
        ...(endpoint === undefined
          ? {}
          : { E2E_EMAIL_PREVIEW_ENDPOINT: endpoint }),
      })).toThrowError(
        "E2E_EMAIL_PREVIEW_ENDPOINT must be an exact loopback capture URL",
      ))
    };return results1;
  })
})
