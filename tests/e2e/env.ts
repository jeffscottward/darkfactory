import {
  createHash,
  randomBytes,
  randomUUID,
  X509Certificate,
} from "node:crypto";
import { once } from "node:events";
import { chmodSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresTestDatabaseUrl } from "@darkfactory/testkit/postgres";

// One browser run: identifiers, ports and secrets for the Playwright config,
// global setup and specs. Values live in process.env so Playwright workers,
// which re-load the config, inherit the runner's values instead of new ones.

type Source = Record<string, string | undefined>;

const REPOSITORY_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const APP_HOST = "darkfactory.localhost";
const DEFAULT_HTTPS_PORT = "1356";
const RUN_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const HMAC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/u;
const SECRET_PATTERN = /^[a-f0-9]{64}$/u;
const PORT_PATTERN = /^[1-9]\d{0,4}$/u;

/** Host variables the servers need to run their toolchain; nothing else passes through. */
export const E2E_INHERITED_KEYS = [
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
] as const;

/** Remote provider credentials and endpoints, always blank so a run never reaches a provider. */
export const E2E_BLANKED_REMOTE_KEYS = [
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "RESEND_API_KEY",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "ERROR_TRACKING_DSN",
] as const;

// Playwright adds these to every webServer environment.
const PLAYWRIGHT_DEFAULT_KEYS = ["BROWSER", "DEBUG_COLORS", "FORCE_COLOR"];

export type E2EEnvironment = Readonly<{
  appEnv: Record<string, string>;
  appPort: number;
  appUrl: string;
  authSecret: string;
  caPath: string;
  capturePort: number;
  databaseUrl: string;
  httpsPort: number;
  previewHmacKey: string;
  proxyEnv: Record<string, string>;
  runId: string;
  runPaths: Readonly<{
    authPreviews: string;
    contactPreviews: string;
    root: string;
  }>;
  stateDir: string;
}>;

const freePort = async (): Promise<string> => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  server.close();
  await once(server, "close");
  if (address === null || typeof address === "string") {
    throw new Error("E2E could not reserve a loopback port");
  }
  return address.port.toString();
};

const stateDirectory = (): string =>
  join(tmpdir(), `darkfactory-e2e-portless-${process.getuid?.() ?? "user"}`);

/** Fills the run's missing values once, in the runner, before workers spawn. */
export const prepareE2EEnvironment = async (
  source: Source = process.env
): Promise<void> => {
  source["E2E_RUN_ID"] ??= `${Date.now()}_${randomUUID().slice(0, 8)}`;
  source["E2E_EMAIL_PREVIEW_HMAC_KEY"] ??=
    randomBytes(32).toString("base64url");
  source["E2E_AUTH_SECRET"] ??= randomBytes(32).toString("hex");
  source["E2E_HTTPS_PORT"] ??= DEFAULT_HTTPS_PORT;
  source["E2E_APP_PORT"] ??= await freePort();
  source["E2E_CAPTURE_PORT"] ??= await freePort();
  // Node-side requests from specs trust the run's CA. Workers read this at
  // startup, after the proxy webServer has generated the CA.
  source["NODE_EXTRA_CA_CERTS"] = join(stateDirectory(), "ca.pem");
};

const required = (source: Source, key: string, pattern: RegExp): string => {
  const value = source[key];
  if (value === undefined || !pattern.test(value)) {
    throw new Error(`E2E ${key} is missing or invalid`);
  }
  return value;
};

const port = (source: Source, key: string): number => {
  const value = Number(required(source, key, PORT_PATTERN));
  if (value > 65_535) throw new Error(`E2E ${key} is missing or invalid`);
  return value;
};

/** A private, owner-only portless state directory, so no route table is shared. */
export const ensurePrivateStateDirectory = (directory: string): string => {
  mkdirSync(directory, { mode: 0o700, recursive: true });
  const details = lstatSync(directory);
  if (
    !details.isDirectory() ||
    details.isSymbolicLink() ||
    details.uid !== process.getuid?.()
  ) {
    throw new Error("E2E portless state directory is not privately owned");
  }
  chmodSync(directory, 0o700);
  return directory;
};

/**
 * Masks every inherited variable so a webServer receives exactly `values`.
 * Playwright spawns webServers with `{ ...process.env, ...env }`, and Node's
 * spawn drops keys whose value is undefined.
 */
export const isolatedEnvironment = (
  values: Record<string, string>,
  source: Source = process.env
): Record<string, string> => {
  const masked: Record<string, string | undefined> = {};
  for (const key of [...Object.keys(source), ...PLAYWRIGHT_DEFAULT_KEYS]) {
    masked[key] = undefined;
  }
  return { ...masked, ...values } as Record<string, string>;
};

const inherited = (source: Source): Record<string, string> => {
  const values: Record<string, string> = {};
  for (const key of E2E_INHERITED_KEYS) {
    const value = source[key];
    if (value !== undefined) values[key] = value;
  }
  return values;
};

/** Derives the run from process.env after `prepareE2EEnvironment`. */
export const e2eEnvironment = (
  source: Source = process.env
): E2EEnvironment => {
  const runId = required(source, "E2E_RUN_ID", RUN_ID_PATTERN);
  const previewHmacKey = required(
    source,
    "E2E_EMAIL_PREVIEW_HMAC_KEY",
    HMAC_KEY_PATTERN
  );
  const authSecret = required(source, "E2E_AUTH_SECRET", SECRET_PATTERN);
  const httpsPort = port(source, "E2E_HTTPS_PORT");
  const appPort = port(source, "E2E_APP_PORT");
  const capturePort = port(source, "E2E_CAPTURE_PORT");
  // testkit refuses anything but the local maintenance database and test role.
  const databaseUrl = postgresTestDatabaseUrl({
    ...(source["DATABASE_URL"] === undefined
      ? {}
      : { databaseUrl: source["DATABASE_URL"] }),
    runId: `e2e_${runId}`,
  });
  const appUrl = `https://${APP_HOST}:${httpsPort}`;
  const stateDir = stateDirectory();
  const caPath = join(stateDir, "ca.pem");
  const root = join(REPOSITORY_ROOT, "test-results", "e2e-runs", runId);
  const runPaths = Object.freeze({
    authPreviews: join(root, "previews", "auth"),
    contactPreviews: join(root, "previews", "contact"),
    root,
  });
  const portless = {
    PORTLESS_PORT: httpsPort.toString(),
    PORTLESS_STATE_DIR: stateDir,
    PORTLESS_SYNC_HOSTS: "0",
  };
  const proxyEnv = isolatedEnvironment(
    { ...inherited(source), ...portless },
    source
  );
  const appEnv = isolatedEnvironment(
    {
      ...inherited(source),
      ...portless,
      PORTLESS_APP_PORT: appPort.toString(),
      NODE_EXTRA_CA_CERTS: caPath,
      // The build's .dev.vars is removed, so wrangler takes bindings from this env.
      CLOUDFLARE_INCLUDE_PROCESS_ENV: "true",
      APP_ENV: "test",
      APP_URL: appUrl,
      APP_NAME: "DarkFactory",
      DATABASE_PROVIDER: "postgres",
      DATABASE_URL: databaseUrl,
      BETTER_AUTH_SECRET: authSecret,
      BETTER_AUTH_URL: appUrl,
      CONTACT_THROTTLE_SECRET: authSecret,
      CONTACT_EMAIL_TO: "contact@darkfactory.test",
      EMAIL_TRANSPORT: "preview",
      E2E_FIXTURES: "1",
      E2E_EMAIL_PREVIEW_DIRECTORY: runPaths.authPreviews,
      E2E_EMAIL_PREVIEW_ENDPOINT: `http://127.0.0.1:${capturePort}/v1/capture`,
      E2E_EMAIL_PREVIEW_HMAC_KEY: previewHmacKey,
      E2E_RUN_ID: runId,
      ...Object.fromEntries(E2E_BLANKED_REMOTE_KEYS.map((key) => [key, ""])),
      OTEL_ENABLED: "false",
      STORAGE_ENABLED: "false",
      DOCS_ENABLED: "false",
      DOCS_PUBLIC: "false",
      JOBS_ENABLED: "false",
      FLOWER_ENABLED: "false",
      UPTIME_KUMA_ENABLED: "false",
      ERROR_TRACKING_ENABLED: "false",
      MEMORI_ENABLED: "false",
    },
    source
  );
  return Object.freeze({
    appEnv,
    appPort,
    appUrl,
    authSecret,
    caPath,
    capturePort,
    databaseUrl,
    httpsPort,
    previewHmacKey,
    proxyEnv,
    runId,
    runPaths,
    stateDir,
  });
};

/**
 * Chromium flag that trusts exactly the run's generated CA key. It replaces
 * `ignoreHTTPSErrors` and system trust-store changes.
 */
export const spkiPinArguments = (caPath: string): string[] => {
  const certificate = new X509Certificate(readFileSync(caPath));
  const spki = certificate.publicKey.export({ format: "der", type: "spki" });
  const pin = createHash("sha256").update(spki).digest("base64");
  return [`--ignore-certificate-errors-spki-list=${pin}`];
};
