import { defineConfig, devices } from "@playwright/test";
import {
  e2eEnvironment,
  ensurePrivateStateDirectory,
  prepareE2EEnvironment,
  spkiPinArguments,
} from "./tests/e2e/env.ts";

await prepareE2EEnvironment();
const env = e2eEnvironment();
const isCI = Boolean(process.env["CI"]);
const isWorker = process.env["TEST_WORKER_INDEX"] !== undefined;
ensurePrivateStateDirectory(env.stateDir);

export default defineConfig({
  testDir: "./tests/e2e",
  // Specs only; tests/e2e/helpers/*.test.ts are Vitest files.
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/artifacts",
  fullyParallel: false,
  forbidOnly: isCI,
  failOnFlakyTests: isCI,
  preserveOutput: "failures-only",
  retries: isCI ? 1 : 0,
  // Specs share one app server and database, so they run serially.
  workers: 1,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: env.appUrl,
    // The runner never launches a browser and runs before the CA exists.
    launchOptions: { args: isWorker ? spkiPinArguments(env.caPath) : [] },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    video: "off",
  },
  projects: [
    {
      name: "e2e",
      testIgnore: /\.a11y\.spec\.ts$/u,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "a11y",
      testMatch: /\.a11y\.spec\.ts$/u,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: [
    {
      name: "https",
      command: `node_modules/.bin/portless proxy start --foreground --skip-trust --port ${env.httpsPort}`,
      env: env.proxyEnv,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      port: env.httpsPort,
      reuseExistingServer: false,
      timeout: 30_000,
    },
    {
      name: "app",
      // The build copies apps/web/.dev.vars into dist; without it the bindings
      // come from `env.appEnv`. `--mode test` stops vinext forcing
      // NODE_ENV=production, which would disable the E2E fixtures
      // (see apps/web/src/lib/e2e-fixtures.ts#isE2eFixtureEnabled).
      command:
        "rm -f apps/web/dist/server/.dev.vars && node_modules/.bin/portless darkfactory pnpm --filter @darkfactory/web run start --mode test",
      env: env.appEnv,
      gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
      reuseExistingServer: false,
      timeout: 120_000,
      url: `http://127.0.0.1:${env.appPort}/robots.txt`,
    },
  ],
});
