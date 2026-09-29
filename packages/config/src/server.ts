import { z } from "zod";
import { CANONICAL_APP_URL } from "./client.ts";
import {
  DATABASE_PROVIDERS,
  isLocalHostname,
  RequestDatabaseEndpointError,
  validateRequestDatabaseEndpoint,
} from "./database.ts";

const emptyStringToUndefined = (value: unknown): unknown => {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
};

const optionalString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional()
);

const MAILBOX_PATTERN =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/;
const optionalContactRecipient = z.preprocess(
  emptyStringToUndefined,
  z
    .string()
    .trim()
    .refine(
      (value) => value.length <= 254 && MAILBOX_PATTERN.test(value),
      "CONTACT_EMAIL_TO must be a valid email address of at most 254 characters"
    )
    .optional()
);

const isHeaderSafeEmailFrom = (value: string): boolean => {
  if (value.length > 400 || /[\r\n]/.test(value)) return false;
  if (MAILBOX_PATTERN.test(value)) return true;
  if (!/^[^<>]+<[^<>]+>$/.test(value)) return false;
  const mailboxStart = value.indexOf("<");
  const displayName = value.slice(0, mailboxStart).trim();
  const mailbox = value.slice(mailboxStart + 1, -1).trim();
  return (
    displayName.length > 0 &&
    displayName.length <= 100 &&
    MAILBOX_PATTERN.test(mailbox)
  );
};

const emailFromSchema = z
  .string()
  .trim()
  .min(1)
  .refine(
    isHeaderSafeEmailFrom,
    "EMAIL_FROM must be a header-safe mailbox or display mailbox"
  );

const parseUrl = (value: string): URL | undefined => {
  try {
    return new URL(value);
  } catch (_error) {
    return undefined;
  }
};

const optionalUrl = (name: string) => {
  return z.preprocess(
    emptyStringToUndefined,
    z.url({ error: `${name} must be a valid URL` }).optional()
  );
};

const httpsUrl = (name: string) => {
  return z
    .url({ error: `${name} must be a valid URL` })
    .refine((value) => value.startsWith("https://"), {
      message: `${name} must use HTTPS`,
    })
    .refine((value) => !value.endsWith("/"), {
      message: `${name} must not have a trailing slash`,
    })
    .refine((value) => parseUrl(value)?.origin === value, {
      message: `${name} must be a clean HTTPS origin`,
    });
};
const environmentBoolean = (name: string, defaultValue: boolean) => {
  return z.preprocess(
    (value) => {
      if (typeof value !== "string") return value;

      const normalized = value.trim().toLowerCase();
      if (normalized === "true") return true;
      if (normalized === "false") return false;
      return value;
    },
    z.boolean({ error: `${name} must be true or false` }).default(defaultValue)
  );
};

const isPostgresUrl = (value: string): boolean => {
  const url = parseUrl(value);
  return (
    url !== undefined &&
    (url.protocol === "postgres:" || url.protocol === "postgresql:") &&
    url.hostname.length > 0
  );
};

// Optional here because Hyperdrive supplies the connection; serverEnvSchema requires it for URL providers.
const databaseUrlSchema = z.preprocess(
  emptyStringToUndefined,
  z
    .string({ error: "DATABASE_URL must be a PostgreSQL URL" })
    .trim()
    .refine(isPostgresUrl, "DATABASE_URL must be a PostgreSQL URL")
    .optional()
);

const secretSchema = (name: string) => {
  return z
    .string({ error: `${name} is required` })
    .min(1, `${name} is required`)
    .min(32, `${name} must contain at least 32 characters`);
};

const baseServerEnvSchema = z.object({
  APP_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: httpsUrl("APP_URL").default(CANONICAL_APP_URL),
  APP_NAME: z.string().trim().min(1).default("DarkFactory"),

  DATABASE_PROVIDER: z.enum(DATABASE_PROVIDERS).default("postgres"),
  DATABASE_URL: databaseUrlSchema,

  BETTER_AUTH_SECRET: secretSchema("BETTER_AUTH_SECRET"),
  BETTER_AUTH_URL: httpsUrl("BETTER_AUTH_URL").default(CANONICAL_APP_URL),
  CONTACT_THROTTLE_SECRET: secretSchema("CONTACT_THROTTLE_SECRET"),
  WORKFLOW_REPOSITORY_GRANTS: optionalString,

  AI_PROVIDER: z.enum(["groq"]).default("groq"),
  GROQ_API_KEY: optionalString,
  GROQ_MODEL: optionalString,

  EMAIL_PROVIDER: z.enum(["resend", "disabled"]).default("resend"),
  EMAIL_TRANSPORT: z.enum(["preview", "resend", "disabled"]).default("preview"),
  RESEND_API_KEY: optionalString,
  EMAIL_FROM: emailFromSchema.default("DarkFactory <noreply@domain.test>"),
  CONTACT_EMAIL_TO: optionalContactRecipient,

  ANALYTICS_PROVIDER: z.enum(["posthog"]).default("posthog"),
  POSTHOG_KEY: optionalString,
  POSTHOG_HOST: optionalUrl("POSTHOG_HOST"),

  OTEL_ENABLED: environmentBoolean("OTEL_ENABLED", true),
  OTEL_SERVICE_NAME: z.string().trim().min(1).default("darkfactory-web"),
  OTEL_EXPORTER_OTLP_ENDPOINT: optionalUrl("OTEL_EXPORTER_OTLP_ENDPOINT"),

  STORAGE_ENABLED: environmentBoolean("STORAGE_ENABLED", false),
  STORAGE_PROVIDER: z.enum(["r2"]).default("r2"),
  R2_ACCOUNT_ID: optionalString,
  R2_ACCESS_KEY_ID: optionalString,
  R2_SECRET_ACCESS_KEY: optionalString,
  R2_BUCKET: optionalString,

  DOCS_ENABLED: environmentBoolean("DOCS_ENABLED", false),
  DOCS_PUBLIC: environmentBoolean("DOCS_PUBLIC", false),
  JOBS_ENABLED: environmentBoolean("JOBS_ENABLED", false),
  JOBS_ENGINE: z.enum(["celery"]).default("celery"),
  FLOWER_ENABLED: environmentBoolean("FLOWER_ENABLED", false),
  UPTIME_KUMA_ENABLED: environmentBoolean("UPTIME_KUMA_ENABLED", false),
  ERROR_TRACKING_ENABLED: environmentBoolean("ERROR_TRACKING_ENABLED", false),
  ERROR_TRACKING_PROVIDER: z.enum(["glitchtip"]).default("glitchtip"),
  ERROR_TRACKING_DSN: optionalUrl("ERROR_TRACKING_DSN"),
  MEMORI_ENABLED: environmentBoolean("MEMORI_ENABLED", false),
});

const STORAGE_REQUIRED_KEYS = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
] as const;

export const serverEnvSchema = baseServerEnvSchema
  .refine(
    (env) =>
      env.DATABASE_PROVIDER === "hyperdrive" || env.DATABASE_URL !== undefined,
    {
      path: ["DATABASE_URL"],
      message: "DATABASE_URL is required",
      // Run beside other field errors so a missing DATABASE_URL is reported in the same pass.
      when: (payload) =>
        typeof payload.value === "object" && payload.value !== null,
    }
  )
  .superRefine((env, context): void => {
    if (env.APP_URL !== env.BETTER_AUTH_URL) {
      context.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_URL"],
        message: "BETTER_AUTH_URL must match APP_URL",
      });
    }

    if (env.APP_ENV === "production") {
      for (const [name, value] of [
        ["APP_URL", env.APP_URL],
        ["BETTER_AUTH_URL", env.BETTER_AUTH_URL],
      ] as const) {
        const parsedUrl = parseUrl(value);
        if (parsedUrl === undefined || !isLocalHostname(parsedUrl.hostname))
          continue;
        context.addIssue({
          code: "custom",
          path: [name],
          message: `${name} cannot use a local origin in production`,
        });
      }
      if (env.DATABASE_URL !== undefined && isPostgresUrl(env.DATABASE_URL)) {
        try {
          validateRequestDatabaseEndpoint({
            appEnvironment: env.APP_ENV,
            provider: env.DATABASE_PROVIDER,
            connectionString: env.DATABASE_URL,
          });
        } catch (error) {
          if (!(error instanceof RequestDatabaseEndpointError)) throw error;
          context.addIssue({
            code: "custom",
            path: ["DATABASE_URL"],
            message: error.diagnostic,
          });
        }
      }
    }

    if (
      (env.EMAIL_PROVIDER === "disabled") !==
      (env.EMAIL_TRANSPORT === "disabled")
    ) {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "EMAIL_PROVIDER and EMAIL_TRANSPORT must be disabled together",
      });
    }

    if (env.EMAIL_TRANSPORT === "resend" && !env.RESEND_API_KEY) {
      context.addIssue({
        code: "custom",
        path: ["RESEND_API_KEY"],
        message: "RESEND_API_KEY is required when EMAIL_TRANSPORT is resend",
      });
    }

    if (env.APP_ENV === "production" && env.EMAIL_TRANSPORT === "preview") {
      context.addIssue({
        code: "custom",
        path: ["EMAIL_TRANSPORT"],
        message: "EMAIL_TRANSPORT cannot use preview in production",
      });
    }

    if (env.STORAGE_ENABLED) {
      for (const key of STORAGE_REQUIRED_KEYS) {
        if (env[key]) continue;
        context.addIssue({
          code: "custom",
          path: [key],
          message: `${key} is required when STORAGE_ENABLED is true`,
        });
      }
    }

    if (env.DOCS_PUBLIC && !env.DOCS_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["DOCS_PUBLIC"],
        message: "DOCS_PUBLIC requires DOCS_ENABLED to be true",
      });
    }

    if (env.FLOWER_ENABLED && !env.JOBS_ENABLED) {
      context.addIssue({
        code: "custom",
        path: ["FLOWER_ENABLED"],
        message: "FLOWER_ENABLED requires JOBS_ENABLED to be true",
      });
    }

    if (env.ERROR_TRACKING_ENABLED && !env.ERROR_TRACKING_DSN) {
      context.addIssue({
        code: "custom",
        path: ["ERROR_TRACKING_DSN"],
        message:
          "ERROR_TRACKING_DSN is required when ERROR_TRACKING_ENABLED is true",
      });
    }
  });

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;
export type EnvironmentIssue = Readonly<{
  path: string;
  message: string;
}>;

export class EnvironmentValidationError extends Error {
  readonly issues: readonly EnvironmentIssue[];

  constructor(issues: readonly EnvironmentIssue[]) {
    super(
      [
        "Invalid server environment:",
        ...issues.map(({ path, message }) => `- ${path}: ${message}`),
      ].join("\n")
    );
    this.name = "EnvironmentValidationError";
    this.issues = issues;
  }
}

export const parseServerEnv = (source: EnvironmentSource): ServerEnv => {
  const result = serverEnvSchema.safeParse(source);
  if (result.success) return result.data;

  const issues = result.error.issues.map(
    (issue): EnvironmentIssue => ({
      path: issue.path.length > 0 ? issue.path.join(".") : "environment",
      message: issue.message,
    })
  );
  throw new EnvironmentValidationError(issues);
};

export type ProviderCapabilities = Readonly<{
  ai: boolean;
  emailDelivery: boolean;
  analytics: boolean;
  telemetryExport: boolean;
  storage: boolean;
  errorTracking: boolean;
}>;

/** Environment readiness only; capability manifests still own installation and availability. */
export const getProviderCapabilities = (
  env: ServerEnv
): ProviderCapabilities => ({
  ai: Boolean(env.GROQ_API_KEY && env.GROQ_MODEL),
  emailDelivery: Boolean(
    env.EMAIL_TRANSPORT === "resend" && env.RESEND_API_KEY && env.EMAIL_FROM
  ),
  analytics: Boolean(env.POSTHOG_KEY && env.POSTHOG_HOST),
  telemetryExport: Boolean(env.OTEL_ENABLED && env.OTEL_EXPORTER_OTLP_ENDPOINT),
  storage: Boolean(
    env.STORAGE_ENABLED && STORAGE_REQUIRED_KEYS.every((key) => env[key])
  ),
  errorTracking: Boolean(env.ERROR_TRACKING_ENABLED && env.ERROR_TRACKING_DSN),
});
