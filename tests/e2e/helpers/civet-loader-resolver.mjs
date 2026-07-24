import { lstat, realpath } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const JAVASCRIPT_EXTENSION = ".js";
const TYPESCRIPT_EXTENSION = ".ts";
const RELATIVE_SPECIFIER_PATTERN = /^\.\.?\//u;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;

const isErrnoCode = (error, code) =>
  error instanceof Error && "code" in error && error.code === code;

const isContainedBy = (root, candidate) => {
  const pathFromRoot = relative(root, candidate);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(
        `..${process.platform === "win32" ? "\\" : "/"}`
      ))
  );
};

const isAllowedSpecifier = (specifier) => {
  if (
    CONTROL_CHARACTER_PATTERN.test(specifier) ||
    !specifier.endsWith(JAVASCRIPT_EXTENSION)
  ) {
    return false;
  }
  if (RELATIVE_SPECIFIER_PATTERN.test(specifier)) {
    return !(specifier.includes("?") || specifier.includes("#"));
  }
  if (!specifier.startsWith("file:")) {
    return false;
  }
  try {
    const url = new URL(specifier);
    return (
      url.protocol === "file:" &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
};

const isMissingPath = async (path) => {
  try {
    await lstat(path);
    return false;
  } catch (error) {
    return isErrnoCode(error, "ENOENT");
  }
};

const resolveTypeScriptFallback = async ({
  allowedSourceRoots,
  context,
  specifier,
}) => {
  if (!isAllowedSpecifier(specifier)) {
    return undefined;
  }
  if (
    !specifier.startsWith("file:") &&
    (context.parentURL === undefined || !context.parentURL.startsWith("file:"))
  ) {
    return undefined;
  }

  let javascriptUrl;
  let javascriptPath;
  try {
    javascriptUrl = specifier.startsWith("file:")
      ? new URL(specifier)
      : new URL(specifier, context.parentURL);
    if (
      javascriptUrl.protocol !== "file:" ||
      javascriptUrl.search !== "" ||
      javascriptUrl.hash !== ""
    ) {
      return undefined;
    }
    javascriptPath = fileURLToPath(javascriptUrl);
    if (CONTROL_CHARACTER_PATTERN.test(javascriptPath)) {
      return undefined;
    }
  } catch {
    return undefined;
  }

  if (!(await isMissingPath(javascriptPath))) {
    return undefined;
  }

  const typescriptPath = `${javascriptPath.slice(
    0,
    -JAVASCRIPT_EXTENSION.length
  )}${TYPESCRIPT_EXTENSION}`;
  if (CONTROL_CHARACTER_PATTERN.test(typescriptPath)) {
    return undefined;
  }
  let typescriptStat;
  let canonicalTypescriptPath;
  try {
    typescriptStat = await lstat(typescriptPath);
    if (!typescriptStat.isFile() || typescriptStat.isSymbolicLink()) {
      return undefined;
    }
    canonicalTypescriptPath = await realpath(typescriptPath);
  } catch {
    return undefined;
  }

  if (
    !allowedSourceRoots.some((root) =>
      isContainedBy(root, canonicalTypescriptPath)
    )
  ) {
    return undefined;
  }

  return Object.freeze({
    shortCircuit: true,
    url: pathToFileURL(canonicalTypescriptPath).href,
  });
};

export const createCivetResolve = async ({ allowedSourceRoots, resolve }) => {
  const canonicalSourceRoots = Object.freeze(
    await Promise.all(allowedSourceRoots.map((root) => realpath(root)))
  );

  return async (specifier, context, nextResolve) => {
    try {
      return await resolve(specifier, context, nextResolve);
    } catch (error) {
      if (!isErrnoCode(error, "ERR_MODULE_NOT_FOUND")) {
        throw error;
      }
      const fallback = await resolveTypeScriptFallback({
        allowedSourceRoots: canonicalSourceRoots,
        context,
        specifier,
      });
      if (fallback === undefined) {
        throw error;
      }
      return fallback;
    }
  };
};
