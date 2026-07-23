import { defineConfig, devices } from "@playwright/test";

const canonicalBaseURL = "https://darkfactory.localhost";
const PORTLESS_PORT_PATTERN = /^\d+$/;

const parsePortlessPort = (value: string | undefined): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const port = Number(value);
  if (!PORTLESS_PORT_PATTERN.test(value) || port < 1 || port > 65_535) {
    throw new RangeError(
      "PORTLESS_PORT must be an integer between 1 and 65535."
    );
  }

  return port;
};

// biome-ignore lint/complexity/useLiteralKeys: Strict ProcessEnv typing requires indexed access.
const portlessPort = parsePortlessPort(process.env["PORTLESS_PORT"]);
const baseURL =
  portlessPort === undefined
    ? canonicalBaseURL
    : `${canonicalBaseURL}:${portlessPort}`;
// biome-ignore lint/complexity/useLiteralKeys: Strict ProcessEnv typing requires indexed access.
const isCI = Boolean(process.env["CI"]);

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  ...(isCI ? { workers: 1 } : {}),
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command:
      "corepack pnpm exec portless darkfactory corepack pnpm --filter @darkfactory/web run dev",
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    ignoreHTTPSErrors: true,
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
