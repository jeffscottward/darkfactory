import { copyFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Host variables the Vinext child needs to run; caller credentials are withheld. */
const INHERITED_KEYS = [
  "CI",
  "COLORTERM",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOGNAME",
  "NO_COLOR",
  "PATH",
  "SHELL",
  "TEMP",
  "TERM",
  "TMP",
  "TMPDIR",
  "USER",
] as const;

export const inheritedEnvironment = (
  source: Readonly<NodeJS.ProcessEnv>
): NodeJS.ProcessEnv => {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of INHERITED_KEYS) {
    const value = source[key];
    if (value !== undefined) environment[key] = value;
  }
  return environment;
};

export const redactValues = (
  value: string,
  sensitiveValues: readonly string[]
): string => {
  let redacted = value;
  for (const sensitiveValue of sensitiveValues) {
    if (sensitiveValue.length > 0) {
      redacted = redacted.replaceAll(sensitiveValue, "[REDACTED]");
    }
  }
  return redacted;
};

const DEV_VARS_VALUE = /^[^'\r\n]*$/u;

export type WorkerConfig = Readonly<{ configPath: string; directory: string }>;

/**
 * Copies the app's Wrangler config into a private temp directory beside a
 * `.dev.vars` holding exactly `bindings`. Wrangler reads `.dev.vars` next to
 * the config, so pointing CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH here keeps a
 * developer's own `apps/web/.dev.vars` unread and untouched.
 */
export const writeWorkerConfig = async (
  webDirectory: string,
  bindings: Readonly<Record<string, string>>
): Promise<WorkerConfig> => {
  const directory = await mkdtemp(join(tmpdir(), "darkfactory-worker-"));
  const configPath = join(directory, "wrangler.jsonc");
  await copyFile(join(webDirectory, "wrangler.jsonc"), configPath);
  const lines = Object.entries(bindings).map(([key, value]) => {
    if (!DEV_VARS_VALUE.test(value)) {
      throw new Error(`Binding ${key} cannot be written to .dev.vars`);
    }
    return `${key}='${value}'\n`;
  });
  await writeFile(join(directory, ".dev.vars"), lines.join(""), {
    mode: 0o600,
  });
  return { configPath, directory };
};
