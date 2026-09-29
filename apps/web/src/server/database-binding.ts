// Carries the ambient `cloudflare:workers` types into programs outside apps/web (tests/integration imports the handlers).
/// <reference path="../cloudflare-workers.d.ts" />
import { env as workerEnv } from "cloudflare:workers";
import {
  DatabaseConfigurationError,
  type DatabaseRequestBinding,
} from "@darkfactory/config/database";

/** The slice of the Worker env read here; wrangler.jsonc declares `HYPERDRIVE` per environment. */
export type HyperdriveEnvironment = Readonly<{ HYPERDRIVE?: unknown }>;

/**
 * The request's Hyperdrive binding, or undefined when the Worker declares none.
 * Whether the configured provider may use it is decided by
 * `packages/config/src/database.ts#composeDatabaseProfile`, which fails closed both ways.
 */
export const resolveDatabaseRequestBinding = (
  source: HyperdriveEnvironment = workerEnv
): DatabaseRequestBinding | undefined => {
  const hyperdrive = source.HYPERDRIVE;
  if (hyperdrive === undefined) return undefined;
  const connectionString =
    typeof hyperdrive === "object" &&
    hyperdrive !== null &&
    "connectionString" in hyperdrive
      ? hyperdrive.connectionString
      : undefined;
  if (typeof connectionString !== "string") {
    throw new DatabaseConfigurationError(
      "HYPERDRIVE binding must expose a connectionString"
    );
  }
  return { connectionString, trustedPlatform: "cloudflare-hyperdrive" };
};
