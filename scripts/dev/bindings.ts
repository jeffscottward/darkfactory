import { randomUUID } from "node:crypto";
import {
  type FileHandle,
  lstat,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseEnv } from "node:util";
import { parseServerEnv, serverEnvSchema } from "@darkfactory/config/server";

const MAX_BINDING_BYTES = 128 * 1024;
export type WorkerBindingsTarget = "web" | "operator";

export const workerBindingsTargetPath = (
  target: WorkerBindingsTarget
): string => {
  return target === "operator"
    ? "apps/operator/.dev.vars"
    : "apps/web/.dev.vars";
};

const resolveWorkerBindingsTarget = async (
  repositoryPath: string,
  target: WorkerBindingsTarget
): Promise<string> => {
  try {
    const repositoryRoot = await realpath(repositoryPath);
    const requestedTarget = join(
      repositoryPath,
      workerBindingsTargetPath(target)
    );
    const requestedParent = dirname(requestedTarget);
    const parentMetadata = await lstat(requestedParent);
    if (!parentMetadata.isDirectory() || parentMetadata.isSymbolicLink()) {
      throw new Error("unsafe parent");
    }
    const parent = await realpath(requestedParent);
    if (relative(repositoryRoot, parent) !== join("apps", target)) {
      throw new Error("escaped parent");
    }
    return join(parent, ".dev.vars");
  } catch {
    throw new Error("Worker bindings directory is unsafe");
  }
};
const REQUIRED_BINDINGS = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "CONTACT_THROTTLE_SECRET",
] as const;

const isFileSystemError = (error: unknown, code: string): boolean => {
  return error instanceof Error && "code" in error && error.code === code;
};

const validateBindingOutput = (content: string): void => {
  if (
    content.length === 0 ||
    Buffer.byteLength(content, "utf8") > MAX_BINDING_BYTES
  ) {
    throw new Error(
      "Resolved Worker bindings are empty or exceed the safe size limit"
    );
  }
  const assignments = content.split(/\r?\n/).filter((line) => line.length > 0);
  if (
    assignments.length === 0 ||
    assignments.some((line) => !/^[A-Z][A-Z0-9_]*=/.test(line)) ||
    REQUIRED_BINDINGS.some(
      (name) =>
        !assignments.some(
          (line) => line.startsWith(`${name}=`) && line.length > name.length + 1
        )
    )
  ) {
    throw new Error("Resolved Worker bindings are malformed or incomplete");
  }
};

export const writeWorkerBindings = async (
  targetPath: string,
  content: string
): Promise<void> => {
  validateBindingOutput(content);
  try {
    const existing = await lstat(targetPath);
    if (
      !existing.isFile() ||
      existing.isSymbolicLink() ||
      existing.nlink !== 1
    ) {
      throw new Error("Existing Worker bindings path is unsafe");
    }
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) throw error;
  }

  const temporaryPath = `${targetPath}.${randomUUID()}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await open(temporaryPath, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.chmod(0o600);
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(temporaryPath, targetPath);
  } catch {
    await handle?.close().catch(() => undefined);
    await rm(temporaryPath, { force: true }).catch(() => undefined);
    throw new Error("Unable to materialize Worker bindings safely");
  }
};

// Unquoted values stay byte-identical; anything else is single-quoted, which is
// literal in both wrangler's dotenv parser (apps/web) and Node's --env-file
// parser (apps/operator `dev`).
const UNQUOTED_VALUE = /^[\w.,:/@+=%-]*$/u;

const serializeBinding = (name: string, value: string): string => {
  if (UNQUOTED_VALUE.test(value)) return `${name}=${value}`;
  if (/['\r\n]/u.test(value)) {
    throw new Error(`${name} cannot be written to Worker bindings safely`);
  }
  return `${name}='${value}'`;
};

// Resolves the Worker bindings from `.env` plus the process environment
// (which wins, as it does for Bun's own .env loading) and validates them with
// the single env contract, packages/config/src/server.ts#parseServerEnv.
export const resolveWorkerBindings = (
  dotenvSource: string,
  environment: Readonly<Record<string, string | undefined>>
): string => {
  const fileValues = parseEnv(dotenvSource);
  const names = new Set([
    ...Object.keys(serverEnvSchema.shape),
    ...Object.keys(fileValues),
  ]);
  const values: Record<string, string> = {};
  for (const name of [...names].sort()) {
    const value = environment[name] ?? fileValues[name];
    if (value !== undefined && value !== "") values[name] = value;
  }
  parseServerEnv(values);
  return `${Object.entries(values)
    .map(([name, value]) => serializeBinding(name, value))
    .join("\n")}\n`;
};

export const materializeWorkerBindings = async (
  repositoryPath = process.cwd(),
  target: WorkerBindingsTarget = "web",
  environment: Readonly<Record<string, string | undefined>> = process.env
): Promise<void> => {
  const targetPath = await resolveWorkerBindingsTarget(repositoryPath, target);
  let dotenvSource = "";
  try {
    dotenvSource = await readFile(join(repositoryPath, ".env"), "utf8");
  } catch (error) {
    if (!isFileSystemError(error, "ENOENT")) {
      throw new Error("Unable to read .env");
    }
  }
  await writeWorkerBindings(
    targetPath,
    resolveWorkerBindings(dotenvSource, environment)
  );
};

export const listTemporaryBindingFiles = async (
  directory: string
): Promise<readonly string[]> =>
  (await readdir(directory)).filter(
    (name) => name.includes(".dev.vars.") && name.endsWith(".tmp")
  );
