import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Dynamic import intentionally verifies the discovery-only module-loading boundary.
const originalArguments = process.argv;
process.argv = [...process.argv, "--list"];
const {
  E2E_LIFECYCLE_GLOBAL_SETUP,
  createCanonicalWebServerConfig,
  default: playwrightConfig,
  parseMaintenanceDatabaseUrl,
  resolveNodeExtraCaCertificates,
} = await import("./playwright.config");
process.argv = originalArguments;

import {
  BrowserErrorCollector,
  type ExpectedHttpError,
} from "./tests/e2e/helpers/browser-errors";
import {
  E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS,
  E2E_PROCESS_TERMINATION_WORST_CASE_MILLISECONDS,
  E2E_PROCESS_TERMINATION_OPTIONS,
  E2E_RESOURCE_CLEANUP_HEADROOM_MILLISECONDS,
  E2E_WEB_SERVER_READY_MARKER,
} from "./tests/e2e/helpers/lifecycle-budgets";
import { extractPreviewLink } from "./tests/e2e/helpers/preview-email";
import { createE2ERunPaths } from "./tests/e2e/helpers/run-artifacts";
import {
  canonicalBaseURL,
  createE2EServerEnvironment,
  parsePortlessPort,
} from "./tests/e2e/helpers/runtime";

const MAINTENANCE_DATABASE_URL =
  "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance";
const ISOLATED_DATABASE_URL =
  "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_harness";
const TEST_SECRET = "test-secret-with-at-least-32-characters";
const PREVIEW_HMAC_KEY = Buffer.alloc(32, 7).toString("base64url");

describe("canonical Playwright runtime", () => {
  it("derives the exact Portless HTTPS origin and rejects unsafe ports", () => {
    expect(parsePortlessPort(undefined)).toBeUndefined();
    expect(parsePortlessPort("1355")).toBe(1355);
    expect(canonicalBaseURL(undefined)).toBe("https://darkfactory.localhost");
    expect(canonicalBaseURL(1355)).toBe("https://darkfactory.localhost:1355");

    for (const value of ["0", "65536", "1.5", " 1355", "abc"]) {
      expect(() => parsePortlessPort(value)).toThrowError(
        "PORTLESS_PORT must be an integer between 1 and 65535."
      );
    }
  });

  it("forces isolated test-only server capabilities without retaining remote credentials", () => {
    const environment = createE2EServerEnvironment({
      databaseUrl: ISOLATED_DATABASE_URL,
      portlessPort: 1355,
      previewCaptureEndpoint: "http://127.0.0.1:43123/v1/capture",
      runPaths: createE2ERunPaths("runtime_contract"),
      secret: TEST_SECRET,
      source: {
        APP_ENV: "test",
        E2E_EMAIL_PREVIEW_HMAC_KEY: PREVIEW_HMAC_KEY,
        DATABASE_URL: MAINTENANCE_DATABASE_URL,
        GROQ_API_KEY: "production-ai-key",
        RESEND_API_KEY: "production-email-key",
        POSTHOG_KEY: "production-analytics-key",
        OTEL_EXPORTER_OTLP_ENDPOINT: "https://telemetry.example.test",
        R2_SECRET_ACCESS_KEY: "production-storage-key",
        PATH: "/safe/bin",
        UNRELATED_SECRET: "must-not-cross-process-boundary",
      },
    });

    expect(environment).toMatchObject({
      APP_ENV: "test",
      APP_URL: "https://darkfactory.localhost:1355",
      BETTER_AUTH_URL: "https://darkfactory.localhost:1355",
      DATABASE_PROVIDER: "postgres",
      DATABASE_URL: ISOLATED_DATABASE_URL,
      EMAIL_TRANSPORT: "preview",
      E2E_FIXTURES: "1",
      E2E_EMAIL_PREVIEW_DIRECTORY:
        createE2ERunPaths("runtime_contract").authPreviews,
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://127.0.0.1:43123/v1/capture",
      E2E_EMAIL_PREVIEW_HMAC_KEY: PREVIEW_HMAC_KEY,
      OTEL_ENABLED: "false",
      STORAGE_ENABLED: "false",
      E2E_RUN_ID: "runtime_contract",
    });
    expect(environment["PATH"]).toBe("/safe/bin");
    expect(environment["UNRELATED_SECRET"]).toBeUndefined();
    expect(environment["GROQ_API_KEY"]).toBe("");
    expect(environment["RESEND_API_KEY"]).toBe("");
    expect(environment["POSTHOG_KEY"]).toBe("");
    expect(environment["OTEL_EXPORTER_OTLP_ENDPOINT"]).toBe("");
    expect(environment["R2_SECRET_ACCESS_KEY"]).toBe("");
  });

  it("accepts only the dedicated local maintenance database contract", () => {
    const safe =
      "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance";
    expect(parseMaintenanceDatabaseUrl(safe, true)).toBe(safe);
    expect(parseMaintenanceDatabaseUrl(undefined, false)).toBe("");
    for (const unsafe of [
      undefined,
      "postgresql://darkfactory_test_runner:test-only@remote.test:55432/darkfactory_test_maintenance",
      "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/other",
      "postgresql://darkfactory_test_runner@127.0.0.1:55432/darkfactory_test_maintenance",
      "https://127.0.0.1:55432/darkfactory_test_maintenance",
    ]) {
      expect(() => parseMaintenanceDatabaseUrl(unsafe, true)).toThrow(
        /maintenance database/i
      );
    }
  });
  it("provides a verified Portless CA to the spawned Node webserver", () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "darkfactory-portless-"));
    try {
      const portlessDirectory = join(homeDirectory, ".portless");
      const portlessCa = join(portlessDirectory, "ca.pem");
      const overrideCa = join(homeDirectory, "override.pem");
      mkdirSync(portlessDirectory);
      writeFileSync(portlessCa, "trusted portless test CA");
      writeFileSync(overrideCa, "trusted override test CA");

      const derivedCa = resolveNodeExtraCaCertificates({
        explicitPath: undefined,
        homeDirectory,
        required: true,
      });
      expect(derivedCa).toBe(portlessCa);

      const webServer = createCanonicalWebServerConfig({
        appUrl: "https://darkfactory.localhost:43123",
        databaseUrl: MAINTENANCE_DATABASE_URL,
        extraCaCertificates: derivedCa,
        portlessPort: 43_123,
        previewHmacKey: PREVIEW_HMAC_KEY,
        runAdoption: "test-adoption",
        runId: "test-run",
      });
      expect(webServer.env["NODE_EXTRA_CA_CERTS"]).toBe(portlessCa);

      expect(
        resolveNodeExtraCaCertificates({
          explicitPath: overrideCa,
          homeDirectory,
          required: true,
        })
      ).toBe(overrideCa);
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true });
    }
  });

  it("fails closed instead of inventing missing or unsafe CA paths", () => {
    const homeDirectory = mkdtempSync(join(tmpdir(), "darkfactory-portless-"));
    try {
      expect(
        resolveNodeExtraCaCertificates({
          explicitPath: undefined,
          homeDirectory,
          required: false,
        })
      ).toBeUndefined();
      expect(() =>
        resolveNodeExtraCaCertificates({
          explicitPath: undefined,
          homeDirectory,
          required: true,
        })
      ).toThrow(/extra CA certificate is unavailable/i);
      expect(() =>
        resolveNodeExtraCaCertificates({
          explicitPath: "relative-ca.pem",
          homeDirectory,
          required: true,
        })
      ).toThrow(/extra CA certificate path is unsafe/i);
      expect(() =>
        resolveNodeExtraCaCertificates({
          explicitPath: join(homeDirectory, "missing.pem"),
          homeDirectory,
          required: true,
        })
      ).toThrow(/extra CA certificate is unavailable/i);
      expect(() =>
        resolveNodeExtraCaCertificates({
          explicitPath: homeDirectory,
          homeDirectory,
          required: true,
        })
      ).toThrow(/extra CA certificate path is unsafe/i);
    } finally {
      rmSync(homeDirectory, { force: true, recursive: true });
    }
  });

  it("rejects direct runtime before any webserver inherits caller secrets", () => {
    const sentinel = "must-not-reach-webserver";
    const cliPath = fileURLToPath(import.meta.resolve("@playwright/test/cli"));
    const result = spawnSync(
      process.execPath,
      [cliPath, "test", "tests/e2e/auth.spec.ts", "--workers=1"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          DATABASE_URL:
            "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance",
          E2E_EMAIL_PREVIEW_HMAC_KEY: "h".repeat(43),
          E2E_RUN_ID: "direct-runtime",
          HOME: process.env["HOME"] ?? "",
          PATH: process.env["PATH"] ?? "",
          PORTLESS_PORT: "43123",
          SECRET_SENTINEL: sentinel,
          NODE_ENV: "test",
        },
        timeout: 30_000,
      }
    );
    const output = `${result.stdout}${result.stderr}`;
    expect(result.status).not.toBe(0);
    expect(output).toMatch(/runner adoption is unavailable/i);
    expect(output).not.toContain(sentinel);
    expect(output).not.toContain("[WebServer]");
    expect(output).not.toContain("web-server.civet");
  });

  it("serializes DB-backed journeys and never reuses an unknown local server", () => {
    expect(playwrightConfig.workers).toBe(1);
    expect(playwrightConfig.fullyParallel).toBe(false);
    expect(playwrightConfig.testIgnore).toEqual(["**/helpers/**"]);
    expect(playwrightConfig.preserveOutput).toBe("failures-only");
    expect(playwrightConfig.failOnFlakyTests).toBe(Boolean(process.env["CI"]));
    expect(playwrightConfig.use?.ignoreHTTPSErrors).toBe(true);
    expect(playwrightConfig.use?.screenshot).toBe("off");
    expect(playwrightConfig.use?.trace).toBe("off");
    expect(playwrightConfig.use?.video).toBe("off");
    expect(E2E_PROCESS_TERMINATION_OPTIONS).toEqual({
      forceTimeoutMillis: 2000,
      gracefulTimeoutMillis: 2000,
    });
    expect(E2E_PROCESS_TERMINATION_WORST_CASE_MILLISECONDS).toBe(4000);
    expect(E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS).toBeGreaterThan(
      E2E_PROCESS_TERMINATION_WORST_CASE_MILLISECONDS +
        E2E_RESOURCE_CLEANUP_HEADROOM_MILLISECONDS
    );
    expect(playwrightConfig.webServer).toBeUndefined();
    expect(playwrightConfig.globalSetup).toBeUndefined();
    expect(E2E_LIFECYCLE_GLOBAL_SETUP).toBe(
      "./tests/e2e/helpers/server-readiness.ts"
    );
    const runtimeInput = {
      appUrl: "https://darkfactory.localhost:43123",
      databaseUrl:
        "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance",
      portlessPort: 43_123,
      previewHmacKey: "h".repeat(43),
      runAdoption: "test-adoption",
      runId: "test-run",
    } as const;
    const runtimeWebServer = createCanonicalWebServerConfig(runtimeInput);
    expect(runtimeWebServer).not.toHaveProperty("url");
    expect(runtimeWebServer).not.toHaveProperty("port");
    expect(runtimeWebServer).toMatchObject({
      command:
        "node --experimental-strip-types --import ./tests/e2e/helpers/register-civet-loader.mjs ./tests/e2e/helpers/web-server.civet",
      gracefulShutdown: {
        signal: "SIGTERM",
        timeout: E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS,
      },
      stderr: "pipe",
      stdout: "pipe",
      env: {
        APP_ENV: "test",
        DATABASE_URL:
          "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance",
        E2E_EMAIL_PREVIEW_HMAC_KEY: "h".repeat(43),
        E2E_RUN_ADOPTION: "test-adoption",
        E2E_RUN_ID: "test-run",
        PORTLESS_PORT: "43123",
      },
      wait: {
        stderr: new RegExp(`^${E2E_WEB_SERVER_READY_MARKER}$`, "mu"),
      },
    });
    expect(
      runtimeWebServer.wait.stderr.test(
        `prefix-${E2E_WEB_SERVER_READY_MARKER}-suffix`
      )
    ).toBe(false);
    for (const unsafeAppUrl of [
      "http://darkfactory.localhost:43123",
      "https://user@darkfactory.localhost:43123",
      "https://darkfactory.localhost:43123/dashboard",
      "https://darkfactory.localhost:43123?next=/sign-in",
      "https://darkfactory.localhost:43124",
    ]) {
      expect(() =>
        createCanonicalWebServerConfig({
          ...runtimeInput,
          appUrl: unsafeAppUrl,
        })
      ).toThrow(/app URL is unsafe/i);
    }
    const serverEnvironment: Readonly<Record<string, string | undefined>> =
      runtimeWebServer.env;
    expect(serverEnvironment).toBeDefined();
    for (const forbidden of [
      "GROQ_API_KEY",
      "OPENAI_API_KEY",
      "RESEND_API_KEY",
      "R2_SECRET_ACCESS_KEY",
      "UNRELATED_SECRET",
    ]) {
      expect(serverEnvironment?.[forbidden]).toBeUndefined();
    }
  });
});

describe("browser error allowlist", () => {
  const expected429: ExpectedHttpError = {
    method: "POST",
    pathname: "/api/orpc/contact.submit",
    status: 429,
  };

  it("allows only an observed, precisely declared HTTP error", () => {
    const collector = new BrowserErrorCollector([expected429]);
    collector.recordResponse({
      method: "POST",
      status: 429,
      url: "https://darkfactory.localhost/api/orpc/contact.submit",
    });
    collector.recordConsole(
      "error",
      "Failed to load resource: the server responded with a status of 429 (Too Many Requests)"
    );

    expect(collector.failures()).toEqual([]);
  });

  it("fails closed for wrong routes, statuses, console errors, and page errors", () => {
    const collector = new BrowserErrorCollector([expected429]);
    collector.recordResponse({
      method: "POST",
      status: 503,
      url: "https://darkfactory.localhost/api/orpc/contact.submit",
    });
    collector.recordConsole("error", "Unexpected client failure");
    collector.recordPageError(new Error("Hydration failed"));

    const failures = collector.failures();
    expect(failures).toHaveLength(3);
    expect(failures[0]).toBe("Unexpected HTTP 503 response");
    expect(failures[1]).toMatch(
      /^Unexpected console error \[category=unknown fingerprint=[a-f0-9]{64} route=\/ name=ConsoleError\]$/u
    );
    expect(failures[2]).toMatch(
      /^Unexpected page error \[category=react-hydration fingerprint=[a-f0-9]{64} route=\/ name=Error source=other-app:\d+\]$/u
    );
  });

  it("fails every undeclared 4xx/5xx and never persists raw diagnostic content", () => {
    const collector = new BrowserErrorCollector();
    for (const status of [401, 404, 500]) {
      collector.recordResponse({
        method: "GET",
        status,
        url: `https://darkfactory.localhost/api/auth/reset-password/raw-secret-${status}?token=query-secret`,
      });
    }
    collector.recordConsole(
      "error",
      "Authorization: Bearer header.payload.signature Cookie: session=private user@domain.test"
    );
    collector.recordPageError(
      new Error("Set-Cookie: private-token; password=private-password")
    );

    const failures = collector.failures();
    expect(failures).toHaveLength(5);
    expect(failures.slice(0, 3)).toEqual([
      "Unexpected HTTP 401 response",
      "Unexpected HTTP 404 response",
      "Unexpected HTTP 500 response",
    ]);
    expect(failures[3]).toMatch(
      /^Unexpected console error \[category=unknown fingerprint=[a-f0-9]{64} route=\/ name=ConsoleError\]$/u
    );
    expect(failures[4]).toMatch(
      /^Unexpected page error \[category=unknown fingerprint=[a-f0-9]{64} route=\/ name=Error source=other-app:\d+\]$/u
    );
    expect(JSON.stringify(failures)).not.toMatch(
      /raw-secret|query-secret|header\.payload|private|domain\.test/iu
    );
  });
});

describe("preview token isolation", () => {
  it("extracts only a trusted operation-specific HTTPS link", () => {
    const link = extractPreviewLink({
      appOrigin: "https://darkfactory.localhost:1355",
      operation: "reset-password",
      text: "Reset your password\nhttps://darkfactory.localhost:1355/api/auth/reset-password/test-token?callbackURL=https%3A%2F%2Fdarkfactory.localhost%3A1355%2Freset-password",
    });

    expect(link.pathname).toBe("/api/auth/reset-password/test-token");
  });

  it("rejects foreign origins and never includes token-bearing content in the error", () => {
    const token = "sensitive-reset-token";
    expect(() =>
      extractPreviewLink({
        appOrigin: "https://darkfactory.localhost:1355",
        operation: "reset-password",
        text: `https://attacker.invalid/api/auth/reset-password/${token}?callbackURL=https%3A%2F%2Fdarkfactory.localhost%3A1355%2Freset-password`,
      })
    ).toThrowError(
      "Preview artifact did not contain a trusted reset-password link."
    );

    try {
      extractPreviewLink({
        appOrigin: "https://darkfactory.localhost:1355",
        operation: "reset-password",
        text: token,
      });
    } catch (error) {
      expect(String(error)).not.toContain(token);
    }
  });
});
