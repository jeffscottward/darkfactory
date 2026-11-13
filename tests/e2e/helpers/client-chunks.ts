import { readFileSync } from "node:fs";

// vinext 1.3 and later emit hash-only client chunk names, so the E2E suites
// find a client module's chunk through the client build manifest.
export const CLIENT_BUILD_MANIFEST_PATH =
  "apps/web/dist/client/.vite/manifest.json";

export const clientChunkPathFromManifest = (
  manifest: unknown,
  moduleName: string
): string => {
  if (typeof manifest !== "object" || manifest === null) {
    throw new Error("The client build manifest is not an object.");
  }
  const files = new Set<string>();
  for (const entry of Object.values(manifest)) {
    if (
      typeof entry === "object" &&
      entry !== null &&
      "name" in entry &&
      entry.name === moduleName &&
      "isDynamicEntry" in entry &&
      entry.isDynamicEntry === true &&
      "file" in entry &&
      typeof entry.file === "string"
    ) {
      files.add(`/${entry.file}`);
    }
  }
  const [file, ...others] = files;
  if (file === undefined || others.length > 0) {
    throw new Error(
      `Expected one client chunk for ${moduleName}; found ${files.size}.`
    );
  }
  return file;
};

export const clientChunkPath = (
  moduleName: string,
  manifestPath: string = CLIENT_BUILD_MANIFEST_PATH
): string =>
  clientChunkPathFromManifest(
    JSON.parse(readFileSync(manifestPath, "utf8")),
    moduleName
  );

export const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&");
