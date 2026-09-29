import { readFileSync } from "node:fs";
import {
  DATABASE_PROVIDER_PROFILES,
  DATABASE_PROVIDERS,
  type DatabaseProvider,
  isDatabaseProvider,
  RequestDatabaseEndpointError,
  validateRequestDatabaseEndpoint,
} from "@darkfactory/config/database";
import { type ParseError, parse as parseJsonc } from "jsonc-parser";

export type DeploymentEnvironment = Readonly<
  Record<string, string | undefined>
>;
export type DeploymentDatabaseCheck = Readonly<{
  ok: boolean;
  message: string;
}>;
export type DeploymentCheckStream = Readonly<{
  write: (message: string) => unknown;
}>;
/** Returns the web Worker's wrangler.jsonc source. */
export type WranglerConfigReader = () => string;

type ConfigObject = Readonly<Record<string, unknown>>;

const WRANGLER_CONFIG_PATH = "apps/web/wrangler.jsonc";

const readWranglerConfig: WranglerConfigReader = () =>
  readFileSync(
    new URL("../../apps/web/wrangler.jsonc", import.meta.url),
    "utf8"
  );

const failed = (message: string): DeploymentDatabaseCheck => ({
  ok: false,
  message,
});

const isConfigObject = (value: unknown): value is ConfigObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const declaresHyperdriveBinding = (environment: ConfigObject): boolean => {
  const bindings = environment["hyperdrive"];
  return (
    Array.isArray(bindings) &&
    bindings.some(
      (binding) =>
        isConfigObject(binding) &&
        binding["binding"] === "HYPERDRIVE" &&
        typeof binding["id"] === "string" &&
        binding["id"].trim() !== ""
    )
  );
};

/**
 * Wrangler does not inherit `vars` or `hyperdrive` into named environments, so each
 * environment must pair DATABASE_PROVIDER=hyperdrive with its own HYPERDRIVE binding.
 * This is the deploy-time mirror of the per-request rule in
 * packages/config/src/database.ts#composeDatabaseProfile.
 */
const wranglerHyperdriveProblem = (
  source: string,
  provider: DatabaseProvider
): string | undefined => {
  const errors: ParseError[] = [];
  const config: unknown = parseJsonc(source, errors, {
    allowTrailingComma: true,
  });
  if (errors.length > 0 || !isConfigObject(config)) {
    return `${WRANGLER_CONFIG_PATH} could not be parsed`;
  }
  const namedEnvironments = isConfigObject(config["env"])
    ? Object.entries(config["env"]).map(
        ([name, environment]) => [`env.${name}`, environment] as const
      )
    : [];
  let hyperdriveEnvironments = 0;
  for (const [name, environment] of [
    ["top-level", config] as const,
    ...namedEnvironments,
  ]) {
    if (!isConfigObject(environment)) {
      return `${WRANGLER_CONFIG_PATH} ${name} must be an object`;
    }
    const vars = isConfigObject(environment["vars"]) ? environment["vars"] : {};
    const usesHyperdrive = vars["DATABASE_PROVIDER"] === "hyperdrive";
    if (usesHyperdrive !== declaresHyperdriveBinding(environment)) {
      return `${WRANGLER_CONFIG_PATH} ${name} must declare a HYPERDRIVE binding exactly when its DATABASE_PROVIDER var is hyperdrive`;
    }
    if (usesHyperdrive) hyperdriveEnvironments += 1;
  }
  if (provider === "hyperdrive" && hyperdriveEnvironments === 0) {
    return `DATABASE_PROVIDER=hyperdrive requires ${WRANGLER_CONFIG_PATH} to set DATABASE_PROVIDER=hyperdrive and declare a HYPERDRIVE binding`;
  }
  return undefined;
};

export const checkProductionWebDatabaseEndpoint = (
  source: DeploymentEnvironment,
  readConfig: WranglerConfigReader = readWranglerConfig
): DeploymentDatabaseCheck => {
  const provider = source["DATABASE_PROVIDER"]?.trim();
  if (!isDatabaseProvider(provider)) {
    return failed(
      `DATABASE_PROVIDER must be one of ${DATABASE_PROVIDERS.join(", ")} for production web deployment`
    );
  }

  const connectionString = source["DATABASE_URL"]?.trim() || undefined;
  if (provider !== "hyperdrive" && connectionString === undefined) {
    return failed("DATABASE_URL is required for production web deployment");
  }

  try {
    validateRequestDatabaseEndpoint({
      appEnvironment: "production",
      provider,
      connectionString,
    });
  } catch (error) {
    if (error instanceof RequestDatabaseEndpointError) {
      return failed(error.diagnostic);
    }
    return failed("Unable to validate the production web database endpoint");
  }

  let wranglerSource: string;
  try {
    wranglerSource = readConfig();
  } catch {
    return failed(`${WRANGLER_CONFIG_PATH} could not be read`);
  }
  const problem = wranglerHyperdriveProblem(wranglerSource, provider);
  if (problem !== undefined) return failed(problem);

  return {
    ok: true,
    message: DATABASE_PROVIDER_PROFILES[provider].productionRequirement,
  };
};

export const runProductionWebDatabaseCheck = (
  source: DeploymentEnvironment,
  output: DeploymentCheckStream,
  errorOutput: DeploymentCheckStream
): number => {
  const report = checkProductionWebDatabaseEndpoint(source);
  const line = `deployment database check: ${report.message}\n`;
  if (report.ok) {
    output.write(line);
    return 0;
  }
  errorOutput.write(line);
  return 1;
};
