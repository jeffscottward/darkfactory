import { GeneratorError } from "./errors.ts";
import type { FeatureNames } from "./types.ts";

type ReservedIdentity = Readonly<{
  name: string;
  schemaExport?: string;
  table?: string;
  route?: string;
  apiNamespace?: string;
}>;

// Generated features reference the Better Auth user table; keep the FK target
// and the Drizzle import derived from this single reserved identity.
export const AUTH_USER_IDENTITY = Object.freeze({
  name: "user",
  schemaExport: "users",
  table: "user",
} as const);

const RESERVED_CORE_IDENTITIES: readonly ReservedIdentity[] = Object.freeze(
  [
    { name: "account", schemaExport: "accounts", table: "account" },
    { name: "address", schemaExport: "addresses", table: "addresses" },
    {
      name: "audit-record",
      schemaExport: "auditRecords",
      table: "audit_records",
    },
    {
      name: "contact-rate-limit",
      schemaExport: "contactRateLimits",
      table: "contact_rate_limits",
    },
    {
      name: "feature-item",
      schemaExport: "featureItems",
      table: "feature_items",
      route: "/feature-items",
      apiNamespace: "featureItems",
    },
    {
      name: "outbox-event",
      schemaExport: "outboxEvents",
      table: "outbox_events",
    },
    {
      name: "preference",
      route: "/preferences",
      apiNamespace: "preferences",
    },
    { name: "profile", schemaExport: "profiles", table: "profiles" },
    { name: "session", schemaExport: "sessions", table: "session" },
    AUTH_USER_IDENTITY,
    {
      name: "user-preference",
      schemaExport: "userPreferences",
      table: "user_preferences",
    },
    {
      name: "verification",
      schemaExport: "verifications",
      table: "verification",
    },
  ].map((identity) => Object.freeze(identity))
);

export const assertCoreIdentityAvailable = (names: FeatureNames): void => {
  const candidate = {
    name: names.kebab,
    schemaExport: names.pluralCamel,
    table: names.pluralSnake,
    route: `/${names.pluralKebab}`,
    apiNamespace: names.pluralCamel,
  };
  const collision = RESERVED_CORE_IDENTITIES.some((reserved) => {
    return (
      reserved.name === candidate.name ||
      reserved.schemaExport === candidate.schemaExport ||
      reserved.table === candidate.table ||
      reserved.route === candidate.route ||
      reserved.apiNamespace === candidate.apiNamespace
    );
  });
  if (collision) {
    throw new GeneratorError(
      "TARGET_COLLISION",
      "Feature identity collides with a reserved core resource"
    );
  }
};
