import { register } from "node:module";
import { fileURLToPath } from "node:url";

const packageLoaderSource = (
  civetLoaderUrl,
  resolverUrl,
  typescriptUrl,
  allowedSourceRoot
) => `
import { load as civetLoad, resolve as civetResolve } from ${JSON.stringify(civetLoaderUrl)};
import { createCivetResolve } from ${JSON.stringify(resolverUrl)};
import ts from ${JSON.stringify(typescriptUrl)};
const resolveWithTypeScriptFallback = await createCivetResolve({
  allowedSourceRoots: [${JSON.stringify(allowedSourceRoot)}],
  resolve: civetResolve,
});
export const resolve = async (specifier, context, nextResolve) => {
  const resolved = await resolveWithTypeScriptFallback(
    specifier,
    context,
    nextResolve
  );
  return /\\.civet(?:$|[?#])/.test(resolved.url)
    ? { ...resolved, format: "civet" }
    : resolved;
};
export const load = async (url, context, nextLoad) => {
  const loaded = await civetLoad(url, context, nextLoad);
  if (context.format !== "civet") return loaded;
  return {
    ...loaded,
    source: ts.transpileModule(String(loaded.source), {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2023,
      },
    }).outputText,
  };
};
`;

register(
  `data:text/javascript,${encodeURIComponent(
    packageLoaderSource(
      import.meta.resolve("@danielx/civet/esm"),
      import.meta.resolve("./civet-loader-resolver.mjs"),
      import.meta.resolve("typescript"),
      fileURLToPath(new URL("./", import.meta.url))
    )
  )}`,
  import.meta.url
);
