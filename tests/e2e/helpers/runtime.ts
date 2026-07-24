import type { E2ERunPaths } from "./run-artifacts";

const CANONICAL_APP_ORIGIN = "https://darkfactory.localhost";
const PORT_PATTERN = /^\d+$/;
const MINIMUM_SECRET_LENGTH = 32;
const HMAC_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const E2E_EXECUTION_ENVIRONMENT_KEYS = [
  "CI",
  "COLORTERM",
  "FORCE_COLOR",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "NODE_EXTRA_CA_CERTS",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
] as const;

export const E2E_WORKER_BINDING_KEYS = [
  "APP_ENV",
  "APP_URL",
  "APP_NAME",
  "DATABASE_PROVIDER",
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CONTACT_THROTTLE_SECRET",
  "CONTACT_EMAIL_TO",
  "EMAIL_TRANSPORT",
  "E2E_FIXTURES",
  "E2E_EMAIL_PREVIEW_DIRECTORY",
  "E2E_EMAIL_PREVIEW_ENDPOINT",
  "E2E_EMAIL_PREVIEW_HMAC_KEY",
  "E2E_RUN_ID",
  "PORTLESS_PORT",
  "GROQ_API_KEY",
  "GROQ_MODEL",
  "RESEND_API_KEY",
  "POSTHOG_KEY",
  "POSTHOG_HOST",
  "OTEL_ENABLED",
  "OTEL_EXPORTER_OTLP_ENDPOINT",
  "STORAGE_ENABLED",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "DOCS_ENABLED",
  "DOCS_PUBLIC",
  "JOBS_ENABLED",
  "FLOWER_ENABLED",
  "UPTIME_KUMA_ENABLED",
  "ERROR_TRACKING_ENABLED",
  "ERROR_TRACKING_DSN",
  "MEMORI_ENABLED",
] as const;

export const E2E_SENSITIVE_BINDING_KEYS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "CONTACT_THROTTLE_SECRET",
  "E2E_EMAIL_PREVIEW_HMAC_KEY",
  "GROQ_API_KEY",
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

export const parsePortlessPort = (
  value: string | undefined
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const port = Number(value);
  if (!PORT_PATTERN.test(value) || port < 1 || port > 65_535) {
    throw new RangeError(
      "PORTLESS_PORT must be an integer between 1 and 65535."
    );
  }

  return port;
};

export const canonicalBaseURL = (port: number | undefined): string =>
  port === undefined ? CANONICAL_APP_ORIGIN : `${CANONICAL_APP_ORIGIN}:${port}`;

export type E2EProcessEnvironment = Record<string, string | undefined>;

const assertRuntimeInput = ({
  databaseUrl,
  secret,
  source,
}: {
  readonly databaseUrl: string;
  readonly secret: string;
  readonly source: E2EProcessEnvironment;
}): void => {
  if (source["APP_ENV"] !== "test") {
    throw new Error("E2E server lifecycle requires APP_ENV=test.");
  }
  if (secret.length < MINIMUM_SECRET_LENGTH) {
    throw new Error("E2E runtime secret must contain at least 32 characters.");
  }
  const hmacKey = source["E2E_EMAIL_PREVIEW_HMAC_KEY"];
  if (
    hmacKey === undefined ||
    !HMAC_KEY_PATTERN.test(hmacKey) ||
    Buffer.from(hmacKey, "base64url").length !== 32
  ) {
    throw new Error("E2E email preview HMAC key must be 32-byte base64url.");
  }

  const database = new URL(databaseUrl);
  if (
    (database.protocol !== "postgres:" &&
      database.protocol !== "postgresql:") ||
    !database.pathname.startsWith("/darkfactory_test_") ||
    database.pathname === "/darkfactory_test_maintenance"
  ) {
    throw new Error("E2E web server requires an isolated test database URL.");
  }
};

export const createE2EExecutionEnvironment = (
  source: E2EProcessEnvironment
): E2EProcessEnvironment => {
  const environment: E2EProcessEnvironment = { NODE_ENV: "development" };
  for (const key of E2E_EXECUTION_ENVIRONMENT_KEYS) {
    const value = source[key];
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  return environment;
};

export const sensitiveBindingValues = (
  environment: E2EProcessEnvironment
): readonly string[] =>
  Array.from(
    new Set(
      E2E_SENSITIVE_BINDING_KEYS.map((key) => environment[key]).filter(
        (value): value is string => value !== undefined && value.length > 0
      )
    )
  );

export const redactSensitiveBindingValues = (
  value: string,
  environment: E2EProcessEnvironment
): string => {
  let redacted = value;
  for (const sensitiveValue of sensitiveBindingValues(environment)) {
    redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
  }
  return redacted;
};

export const createE2EServerEnvironment = ({
  databaseUrl,
  portlessPort,
  runPaths,
  previewCaptureEndpoint,
  secret,
  source,
}: {
  readonly databaseUrl: string;
  readonly portlessPort: number | undefined;
  readonly previewCaptureEndpoint: string;
  readonly runPaths: E2ERunPaths;
  readonly secret: string;
  readonly source: E2EProcessEnvironment;
}): E2EProcessEnvironment => {
  assertRuntimeInput({ databaseUrl, secret, source });
  const appUrl = canonicalBaseURL(portlessPort);
  const captureEndpoint = new URL(previewCaptureEndpoint);
  if (
    captureEndpoint.protocol !== "http:" ||
    captureEndpoint.hostname !== "127.0.0.1" ||
    captureEndpoint.port.length === 0 ||
    captureEndpoint.pathname !== "/v1/capture" ||
    captureEndpoint.username !== "" ||
    captureEndpoint.password !== "" ||
    captureEndpoint.search !== "" ||
    captureEndpoint.hash !== ""
  ) {
    throw new Error(
      "E2E preview capture endpoint must be an exact loopback URL."
    );
  }

  return {
    ...createE2EExecutionEnvironment(source),
    APP_ENV: "test",
    APP_URL: appUrl,
    APP_NAME: "DarkFactory",
    DATABASE_PROVIDER: "postgres",
    DATABASE_URL: databaseUrl,
    BETTER_AUTH_SECRET: secret,
    BETTER_AUTH_URL: appUrl,
    CONTACT_THROTTLE_SECRET: secret,
    CONTACT_EMAIL_TO: "contact@darkfactory.test",
    EMAIL_TRANSPORT: "preview",
    E2E_FIXTURES: "1",
    E2E_EMAIL_PREVIEW_DIRECTORY: runPaths.authPreviews,
    E2E_EMAIL_PREVIEW_ENDPOINT: captureEndpoint.href,
    E2E_EMAIL_PREVIEW_HMAC_KEY: source["E2E_EMAIL_PREVIEW_HMAC_KEY"],
    E2E_RUN_ID: runPaths.runId,
    PORTLESS_PORT: portlessPort?.toString() ?? "",
    GROQ_API_KEY: "",
    GROQ_MODEL: "",
    RESEND_API_KEY: "",
    POSTHOG_KEY: "",
    POSTHOG_HOST: "",
    OTEL_ENABLED: "false",
    OTEL_EXPORTER_OTLP_ENDPOINT: "",
    STORAGE_ENABLED: "false",
    R2_ACCOUNT_ID: "",
    R2_ACCESS_KEY_ID: "",
    R2_SECRET_ACCESS_KEY: "",
    R2_BUCKET: "",
    DOCS_ENABLED: "false",
    DOCS_PUBLIC: "false",
    JOBS_ENABLED: "false",
    FLOWER_ENABLED: "false",
    UPTIME_KUMA_ENABLED: "false",
    ERROR_TRACKING_ENABLED: "false",
    ERROR_TRACKING_DSN: "",
    MEMORI_ENABLED: "false",
  };
};
