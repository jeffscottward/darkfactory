import { randomBytes } from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

import {
  canonicalBaseURL,
  parsePortlessPort,
} from "./tests/e2e/helpers/runtime";
import { createE2ERunId } from "./tests/e2e/helpers/run-artifacts";
import { E2E_PLAYWRIGHT_SHUTDOWN_TIMEOUT_MILLISECONDS } from "./tests/e2e/helpers/lifecycle-budgets";
import {
  assertOwnedE2ERunRootsReady,
  createE2ERunPaths,
} from "./tests/e2e/helpers/run-artifacts";
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
    ignoreHTTPSErrors: true,
    url: new URL("/sign-in", appUrl).toString(),
    reuseExistingServer: false,
    timeout: 180_000,
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
const extraCaCertificates = process.env["NODE_EXTRA_CA_CERTS"];
const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: ["**/helpers/**"],
  outputDir: "./test-results/artifacts",
  fullyParallel: false,
  forbidOnly: isCI,
  preserveOutput: "failures-only",
  retries: isCI ? 2 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
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
