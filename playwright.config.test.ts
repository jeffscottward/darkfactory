import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PlaywrightTestConfig } from "@playwright/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { spkiPinArguments } from "./tests/e2e/env.ts";
import {
  BrowserErrorCollector,
  type ExpectedHttpError,
} from "./tests/e2e/helpers/browser-errors.ts";
import { extractPreviewLink } from "./tests/e2e/helpers/preview-email.ts";

// Public certificate only (no key): a fixed input for the SPKI pin. Pin from
// `openssl x509 -pubkey -noout | openssl pkey -pubin -outform der | openssl dgst -sha256 -binary | base64`.
const FIXTURE_CA = `-----BEGIN CERTIFICATE-----
MIIBozCCAUmgAwIBAgIUBAotcKGlGHP8eh3IxCcayviHaEMwCgYIKoZIzj0EAwIw
JjEkMCIGA1UEAwwbRGFya0ZhY3RvcnkgdGVzdCBmaXh0dXJlIENBMCAXDTI2MDky
OTA2NDAyOVoYDzIxMjYwOTA1MDY0MDI5WjAmMSQwIgYDVQQDDBtEYXJrRmFjdG9y
eSB0ZXN0IGZpeHR1cmUgQ0EwWTATBgcqhkjOPQIBBggqhkjOPQMBBwNCAAS1nW6N
SHxc1y8z5AsySRmS2gv6sisYe/mgU0kQq2WAuhO+DtYKTWQXTMY4s8py5DBvIUfi
X3Dt/Gq0hG2zaJYSo1MwUTAdBgNVHQ4EFgQUrvlUtCIYQ6imJMbXyiecFg+w7T4w
HwYDVR0jBBgwFoAUrvlUtCIYQ6imJMbXyiecFg+w7T4wDwYDVR0TAQH/BAUwAwEB
/zAKBggqhkjOPQQDAgNIADBFAiEAu/kP85lG+biSkbRTTLBdo0QZLsDES66XJXe/
QefqIGACIEzpGD5XHY4fdEkwtKj2/nya++0FDKDi0Jk7y9dmyftG
-----END CERTIFICATE-----
`;
const FIXTURE_PIN =
  "--ignore-certificate-errors-spki-list=aTgTlpKFtIWd2YDFtuKJXThboCoOVzczFFmWOAYmr9k=";
const MAINTENANCE_DATABASE_URL =
  "postgresql://darkfactory_test_runner:test-only@127.0.0.1:55432/darkfactory_test_maintenance";
const CALLER_SECRETS = {
  AWS_SECRET_ACCESS_KEY: "caller-aws-secret",
  GITHUB_TOKEN: "caller-github-token",
  GROQ_API_KEY: "caller-groq-key",
  OPENAI_API_KEY: "caller-openai-key",
  R2_SECRET_ACCESS_KEY: "caller-r2-secret",
  RESEND_API_KEY: "caller-resend-key",
} as const;
// Playwright's own webServer defaults, merged before process.env.
const PLAYWRIGHT_DEFAULTS = {
  BROWSER: "none",
  DEBUG_COLORS: "1",
  FORCE_COLOR: "1",
};

type WebServer = Readonly<{
  command: string;
  env: Record<string, string | undefined>;
  gracefulShutdown?: unknown;
  name?: string;
  port?: number;
  reuseExistingServer?: boolean;
  url?: string;
}>;

let temporaryDirectory = "";

const loadConfig = async (
  overrides: Record<string, string | undefined> = {}
): Promise<PlaywrightTestConfig> => {
  for (const [key, value] of Object.entries({
    APP_ENV: "test",
    CI: undefined,
    DATABASE_URL: MAINTENANCE_DATABASE_URL,
    E2E_APP_PORT: "43124",
    E2E_AUTH_SECRET: "a".repeat(64),
    E2E_CAPTURE_PORT: "43125",
    E2E_EMAIL_PREVIEW_HMAC_KEY: "h".repeat(43),
    E2E_HTTPS_PORT: "1356",
    E2E_RUN_ID: "config_contract",
    NODE_EXTRA_CA_CERTS: undefined,
    TEST_WORKER_INDEX: undefined,
    TMPDIR: temporaryDirectory,
    // A caller's portless preferences must not turn off the run's HTTPS.
    PORTLESS_HTTPS: "0",
    ...CALLER_SECRETS,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }
  vi.resetModules();
  return (await import("./playwright.config.ts")).default;
};

const webServers = (config: PlaywrightTestConfig): WebServer[] =>
  config.webServer as WebServer[];

// The environment a webServer child really receives, spawned the way Playwright does.
const childEnvironment = (server: WebServer): Record<string, string> =>
  JSON.parse(
    execFileSync(
      process.execPath,
      ["-e", "process.stdout.write(JSON.stringify(process.env))"],
      {
        encoding: "utf8",
        env: { ...PLAYWRIGHT_DEFAULTS, ...process.env, ...server.env },
      }
    )
  ) as Record<string, string>;

beforeEach(() => {
  temporaryDirectory = mkdtempSync(join(tmpdir(), "darkfactory-config-"));
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(temporaryDirectory, { force: true, recursive: true });
});

describe("Playwright harness", () => {
  it("runs both projects in one invocation over the production HTTPS origin", async () => {
    const config = await loadConfig();
    expect(config.use).toMatchObject({
      baseURL: "https://darkfactory.localhost:1356",
      launchOptions: { args: [] },
      screenshot: "only-on-failure",
      trace: "on-first-retry",
    });
    expect(config.globalSetup).toBe("./tests/e2e/global-setup.ts");
    expect(config.workers).toBe(1);
    expect(config.projects?.map((project) => project.name)).toEqual([
      "e2e",
      "a11y",
    ]);
    const [proxy, app] = webServers(config);
    expect(proxy).toMatchObject({
      command:
        "node_modules/.bin/portless proxy start --foreground --skip-trust --port 1356",
      name: "https",
      port: 1356,
      reuseExistingServer: false,
    });
    expect(app).toMatchObject({
      command:
        "rm -f apps/web/dist/server/.dev.vars && node_modules/.bin/portless darkfactory corepack pnpm --filter @darkfactory/web run start --mode test",
      name: "app",
      reuseExistingServer: false,
      url: "http://127.0.0.1:43124/robots.txt",
    });
    expect(proxy?.gracefulShutdown).toBeDefined();
    return expect(app?.gracefulShutdown).toBeDefined();
  });

  it("never bypasses TLS: no ignoreHTTPSErrors anywhere", async () => {
    const config = await loadConfig();
    const uses = [config.use, ...(config.projects ?? []).map((p) => p.use)];
    for (const use of uses) {
      expect(use).not.toHaveProperty("ignoreHTTPSErrors");
    }
    return expect(process.env["NODE_EXTRA_CA_CERTS"]).toBe(
      join(
        temporaryDirectory,
        `darkfactory-e2e-portless-${process.getuid?.()}`,
        "ca.pem"
      )
    );
  });

  it("pins exactly the generated CA key in worker browsers", async () => {
    const stateDirectory = join(
      temporaryDirectory,
      `darkfactory-e2e-portless-${process.getuid?.()}`
    );
    mkdirSync(stateDirectory, { mode: 0o700 });
    writeFileSync(join(stateDirectory, "ca.pem"), FIXTURE_CA);
    expect(spkiPinArguments(join(stateDirectory, "ca.pem"))).toEqual([
      FIXTURE_PIN,
    ]);
    const config = await loadConfig({ TEST_WORKER_INDEX: "0" });
    expect(config.use?.launchOptions?.args).toEqual([FIXTURE_PIN]);
    rmSync(join(stateDirectory, "ca.pem"));
    // A worker without the CA fails closed instead of browsing unpinned.
    return await expect(
      loadConfig({ TEST_WORKER_INDEX: "0" })
    ).rejects.toThrow();
  });

  it("gives servers only toolchain variables and blanks remote credentials", async () => {
    const config = await loadConfig();
    const allowed = new Set([
      "CI",
      "COREPACK_HOME",
      "HOME",
      "LANG",
      "LC_ALL",
      "LOGNAME",
      "NO_COLOR",
      "PATH",
      "PNPM_HOME",
      "SHELL",
      "TEMP",
      "TERM",
      "TMP",
      "TMPDIR",
      "USER",
      "XDG_CACHE_HOME",
      "XDG_CONFIG_HOME",
      "XDG_DATA_HOME",
      "PORTLESS_PORT",
      "PORTLESS_STATE_DIR",
      "PORTLESS_SYNC_HOSTS",
    ]);
    const [proxy, app] = webServers(config);
    const proxyEnvironment = childEnvironment(proxy as WebServer);
    expect(
      Object.keys(proxyEnvironment).filter((key) => !allowed.has(key))
    ).toEqual([]);
    const appEnvironment = childEnvironment(app as WebServer);
    expect(appEnvironment).not.toHaveProperty("PORTLESS_HTTPS");
    for (const [key, value] of Object.entries(CALLER_SECRETS)) {
      expect(Object.values(appEnvironment)).not.toContain(value);
      expect(Object.values(proxyEnvironment)).not.toContain(value);
      if (
        key === "GROQ_API_KEY" ||
        key === "RESEND_API_KEY" ||
        key === "R2_SECRET_ACCESS_KEY"
      ) {
        expect(appEnvironment[key]).toBe("");
      } else {
        expect(appEnvironment).not.toHaveProperty(key);
      }
    }
    expect(appEnvironment).toMatchObject({
      APP_ENV: "test",
      APP_URL: "https://darkfactory.localhost:1356",
      BETTER_AUTH_URL: "https://darkfactory.localhost:1356",
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      DATABASE_PROVIDER: "postgres",
      E2E_EMAIL_PREVIEW_ENDPOINT: "http://127.0.0.1:43125/v1/capture",
      E2E_FIXTURES: "1",
      EMAIL_TRANSPORT: "preview",
      OTEL_ENABLED: "false",
      PORTLESS_APP_PORT: "43124",
      POSTHOG_KEY: "",
      STORAGE_ENABLED: "false",
    });
    return expect(
      new URL(appEnvironment["DATABASE_URL"] ?? "").pathname
    ).toMatch(/^\/darkfactory_test_e2e_config_contract_[a-f0-9]+$/u);
  });

  it("runs every spec in exactly one project", async () => {
    const config = await loadConfig();
    expect(config.testMatch).toBe("**/*.spec.ts");
    const specs = readdirSync("tests/e2e").filter((file) =>
      file.endsWith(".spec.ts")
    );
    expect(specs.length).toBeGreaterThan(0);
    const owners = (file: string) =>
      (config.projects ?? [])
        .filter((project) => {
          const match = project.testMatch as RegExp | undefined;
          const ignore = project.testIgnore as RegExp | undefined;
          return (
            (match === undefined || match.test(file)) &&
            (ignore === undefined || !ignore.test(file))
          );
        })
        .map((project) => project.name);
    for (const file of specs) {
      expect(owners(file), file).toEqual([
        file.endsWith(".a11y.spec.ts") ? "a11y" : "e2e",
      ]);
    }
  });

  it("fails fast on CI: no .only, one retry, flaky counts as failure", async () => {
    const local = await loadConfig();
    expect(local).toMatchObject({
      failOnFlakyTests: false,
      forbidOnly: false,
      retries: 0,
    });
    return expect(await loadConfig({ CI: "true" })).toMatchObject({
      failOnFlakyTests: true,
      forbidOnly: true,
      retries: 1,
    });
  });

  it("refuses any database but the local maintenance database", async () => {
    await expect(
      loadConfig({
        DATABASE_URL:
          "postgresql://darkfactory_test_runner:test-only@db.example.test:5432/darkfactory_test_maintenance",
      })
    ).rejects.toThrow("non-local host");
    return await expect(
      loadConfig({ DATABASE_URL: undefined })
    ).rejects.toThrow("DATABASE_URL is required");
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
