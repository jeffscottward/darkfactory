import { randomBytes } from "node:crypto";
import { accessSync, constants, type Stats, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { defineConfig, devices } from "@playwright/test";
import {
  E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS,
  E2E_PLAYWRIGHT_WEB_SERVER_TIMEOUT_MILLISECONDS,
  E2E_WEB_SERVER_READY_MARKER,
} from "./tests/e2e/helpers/lifecycle-budgets";
import {
  assertOwnedE2ERunRootsReady,
  createE2ERunId,
  createE2ERunPaths,
} from "./tests/e2e/helpers/run-artifacts";
import {
  canonicalBaseURL,
  parsePortlessPort,
} from "./tests/e2e/helpers/runtime";
export const E2E_LIFECYCLE_GLOBAL_SETUP =
  "./tests/e2e/helpers/server-readiness.ts";

export const parseMaintenanceDatabaseUrl = (
  value: string | undefined,
  required: boolean
): string => {
  if (value === undefined || value.length === 0) {
    if (required) {
      throw new Error("Canonical E2E maintenance database is unavailable");
    }
    return "";
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Canonical E2E maintenance database is unsafe");
  }
  const port = Number(parsed.port);
  if (
    parsed.protocol !== "postgresql:" ||
    parsed.hostname !== "127.0.0.1" ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    parsed.pathname !== "/darkfactory_test_maintenance" ||
    parsed.username !== "darkfactory_test_runner" ||
    parsed.password.length === 0 ||
    parsed.search.length > 0 ||
    parsed.hash.length > 0
  ) {
    throw new Error("Canonical E2E maintenance database is unsafe");
  }
  return value;
};

const validateExtraCaCertificatePath = (
  candidate: string,
  required: boolean
): string | undefined => {
  if (candidate.length === 0 || !isAbsolute(candidate)) {
    throw new Error("Canonical E2E extra CA certificate path is unsafe");
  }
  let certificate: Stats;
  try {
    certificate = statSync(candidate);
    accessSync(candidate, constants.R_OK);
  } catch (error) {
    if (
      !required &&
      error instanceof Error &&
      "code" in error &&
      (error.code === "ENOENT" || error.code === "ENOTDIR")
    ) {
      return undefined;
    }
    throw new Error("Canonical E2E extra CA certificate is unavailable");
  }
  if (!certificate.isFile()) {
    throw new Error("Canonical E2E extra CA certificate path is unsafe");
  }
  return candidate;
};

export const resolveNodeExtraCaCertificates = ({
  explicitPath,
  homeDirectory,
  required,
}: Readonly<{
  explicitPath: string | undefined;
  homeDirectory: string | undefined;
  required: boolean;
}>): string | undefined => {
  if (explicitPath !== undefined) {
    return validateExtraCaCertificatePath(explicitPath, true);
  }
  if (homeDirectory === undefined || homeDirectory.length === 0) {
    if (required) {
      throw new Error("Canonical E2E extra CA certificate is unavailable");
    }
    return undefined;
  }
  if (!isAbsolute(homeDirectory)) {
    throw new Error("Canonical E2E extra CA certificate path is unsafe");
  }
  return validateExtraCaCertificatePath(
    join(homeDirectory, ".portless", "ca.pem"),
    required
  );
};

export const createCanonicalWebServerConfig = ({
  appUrl,
  databaseUrl,
  extraCaCertificates,
  portlessPort,
  previewHmacKey,
  runAdoption,
  runId,
}: Readonly<{
  appUrl: string;
  databaseUrl: string;
  extraCaCertificates?: string | undefined;
  portlessPort: number;
  previewHmacKey: string;
  runAdoption: string;
  runId: string;
}>) => {
  if (appUrl !== canonicalBaseURL(portlessPort)) {
    throw new Error("Canonical E2E app URL is unsafe");
  }
  return {
    command:
      "node --experimental-strip-types --import ./tests/e2e/helpers/register-civet-loader.mjs ./tests/e2e/helpers/web-server.civet",
    env: {
      APP_ENV: "test",
      DATABASE_URL: databaseUrl,
      E2E_EMAIL_PREVIEW_HMAC_KEY: previewHmacKey,
      E2E_RUN_ADOPTION: runAdoption,
      E2E_RUN_ID: runId,
      PORTLESS_PORT: portlessPort.toString(),
      ...(extraCaCertificates === undefined
        ? {}
        : { NODE_EXTRA_CA_CERTS: extraCaCertificates }),
    },
    gracefulShutdown: {
      signal: "SIGTERM" as const,
      timeout: E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS,
    },
    stderr: "pipe" as const,
    stdout: "pipe" as const,
    wait: {
      stderr: new RegExp(`^${E2E_WEB_SERVER_READY_MARKER}$`, "mu"),
    },
    timeout: E2E_PLAYWRIGHT_WEB_SERVER_TIMEOUT_MILLISECONDS,
  };
};

const portlessPort = parsePortlessPort(process.env["PORTLESS_PORT"]);
const baseURL = canonicalBaseURL(portlessPort);
const discoveryOnly = process.argv.includes("--list");
const suppliedRunId = process.env["E2E_RUN_ID"];
const suppliedPreviewHmacKey = process.env["E2E_EMAIL_PREVIEW_HMAC_KEY"];
if (
  !discoveryOnly &&
  (suppliedRunId === undefined ||
    !/^[A-Za-z0-9_-]{1,128}$/u.test(suppliedRunId) ||
    suppliedPreviewHmacKey === undefined ||
    !/^[A-Za-z0-9_-]{43}$/u.test(suppliedPreviewHmacKey))
) {
  throw new Error("Canonical E2E runner credentials are unavailable");
}
const e2eRunId = suppliedRunId ?? createE2ERunId();
process.env["E2E_RUN_ID"] = e2eRunId;
const previewHmacKey =
  suppliedPreviewHmacKey ?? randomBytes(32).toString("base64url");
process.env["E2E_EMAIL_PREVIEW_HMAC_KEY"] = previewHmacKey;
const runAdoption = process.env["E2E_RUN_ADOPTION"];
if (!discoveryOnly) {
  if (runAdoption === undefined) {
    throw new Error("Canonical E2E runner adoption is unavailable");
  }
  const runPaths = createE2ERunPaths(e2eRunId);
  if (!(await assertOwnedE2ERunRootsReady(runPaths, runAdoption))) {
    throw new Error("Canonical E2E runner adoption is invalid");
  }
}
const maintenanceDatabaseUrl = parseMaintenanceDatabaseUrl(
  process.env["DATABASE_URL"],
  !discoveryOnly
);
if (!discoveryOnly && portlessPort === undefined) {
  throw new Error("Canonical E2E Portless port is unavailable");
}
const extraCaCertificates = resolveNodeExtraCaCertificates({
  explicitPath: process.env["NODE_EXTRA_CA_CERTS"],
  homeDirectory: process.env["HOME"] ?? homedir(),
  required: !discoveryOnly,
});
const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/helpers/**"],
  outputDir: "./test-results/artifacts",
  fullyParallel: false,
  forbidOnly: isCI,
  failOnFlakyTests: isCI,
  preserveOutput: "failures-only",
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  ...(discoveryOnly
    ? {}
    : {
        globalSetup: E2E_LIFECYCLE_GLOBAL_SETUP,
        webServer: createCanonicalWebServerConfig({
          appUrl: baseURL,
          databaseUrl: maintenanceDatabaseUrl,
          extraCaCertificates,
          portlessPort: portlessPort as number,
          previewHmacKey,
          runAdoption: runAdoption as string,
          runId: e2eRunId,
        }),
      }),
});
