import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { createCivetResolve } from "./civet-loader-resolver.mjs";

type ResolveResult = Readonly<{
  format?: string;
  shortCircuit?: boolean;
  url: string;
}>;

type ResolveContext = Readonly<{ parentURL?: string }>;
type NextResolve = (
  specifier: string,
  context: ResolveContext
) => Promise<ResolveResult>;

type ResolveHook = (
  specifier: string,
  context: ResolveContext,
  nextResolve: NextResolve
) => Promise<ResolveResult>;

const temporaryRoots = new Set<string>();
const decodedControlCases = [
  ["%00", "\0"],
  ["%0A", "\n"],
  ["%0D", "\r"],
  ["%09", "\t"],
] as const;

const createTemporaryRoot = async (): Promise<string> => {
  const root = await mkdtemp(join(tmpdir(), "darkfactory-civet-loader-"));
  temporaryRoots.add(root);
  return root;
};

const moduleNotFound = (): NodeJS.ErrnoException => {
  const error = new Error("module missing") as NodeJS.ErrnoException;
  error.code = "ERR_MODULE_NOT_FOUND";
  return error;
};

const rejectingResolver =
  (error: NodeJS.ErrnoException): ResolveHook =>
  async () => {
    throw error;
  };

const createResolver = async (
  root: string,
  resolver: ResolveHook
): Promise<ResolveHook> =>
  createCivetResolve({
    allowedSourceRoots: [root],
    resolve: resolver,
  });

afterEach(async () => {
  await Promise.all(
    [...temporaryRoots].map(async (root) => {
      await rm(root, { force: true, recursive: true });
      temporaryRoots.delete(root);
    })
  );
});

describe("Civet loader TypeScript fallback", () => {
  it("preserves an existing JavaScript module resolution", async () => {
    const root = await createTemporaryRoot();
    const javascriptPath = join(root, "dependency.js");
    await writeFile(javascriptPath, "export const source = 'js';\n", "utf8");
    await writeFile(
      join(root, "dependency.ts"),
      "export const source = 'ts';\n",
      "utf8"
    );
    const expected = Object.freeze({ url: pathToFileURL(javascriptPath).href });
    const resolver = await createResolver(root, async () => expected);

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => expected
      )
    ).resolves.toBe(expected);
  });

  it("maps a missing local JavaScript import to its regular TypeScript source", async () => {
    const root = await createTemporaryRoot();
    const typescriptPath = join(root, "dependency.ts");
    await writeFile(typescriptPath, "export const value = 1;\n", "utf8");
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).resolves.toEqual({
      shortCircuit: true,
      url: pathToFileURL(await realpath(typescriptPath)).href,
    });
  });
  it("maps a contained local file URL to its TypeScript source", async () => {
    const root = await createTemporaryRoot();
    const typescriptPath = join(root, "dependency.ts");
    await writeFile(typescriptPath, "export const value = 1;\n", "utf8");
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        pathToFileURL(join(root, "dependency.js")).href,
        {},
        async () => {
          throw failure;
        }
      )
    ).resolves.toEqual({
      shortCircuit: true,
      url: pathToFileURL(await realpath(typescriptPath)).href,
    });
  });

  it("preserves resolver failures other than module-not-found", async () => {
    const root = await createTemporaryRoot();
    await writeFile(
      join(root, "dependency.ts"),
      "export const value = 1;\n",
      "utf8"
    );
    const failure = Object.assign(new Error("access denied"), {
      code: "EACCES",
    });
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });

  it("does not replace a present JavaScript filesystem entry", async () => {
    const root = await createTemporaryRoot();
    await symlink("missing-target.js", join(root, "dependency.js"));
    await writeFile(
      join(root, "dependency.ts"),
      "export const value = 1;\n",
      "utf8"
    );
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });

  it("rejects symlinked TypeScript candidates", async () => {
    const root = await createTemporaryRoot();
    const outsideRoot = await createTemporaryRoot();
    const outsidePath = join(outsideRoot, "outside.ts");
    await writeFile(outsidePath, "export const value = 1;\n", "utf8");
    await symlink(outsidePath, join(root, "dependency.ts"));
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });

  it("rejects traversal outside an allowed source root", async () => {
    const root = await createTemporaryRoot();
    const allowedRoot = join(root, "helpers");
    await mkdir(allowedRoot);
    await writeFile(
      join(root, "outside.ts"),
      "export const value = 1;\n",
      "utf8"
    );
    const failure = moduleNotFound();
    const resolver = await createResolver(
      allowedRoot,
      rejectingResolver(failure)
    );

    await expect(
      resolver(
        "../outside.js",
        { parentURL: pathToFileURL(join(allowedRoot, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });

  it.each([
    "dependency.js",
    "/dependency.js",
    "./dependency.js?raw",
    "./dependency.js#fragment",
    "./dependency.js%00",
    ...decodedControlCases.map(([encoded]) => `./dependency${encoded}.js`),
  ])("rejects unsafe or non-local specifier %s", async (specifier) => {
    const root = await createTemporaryRoot();
    await writeFile(
      join(root, "dependency.ts"),
      "export const value = 1;\n",
      "utf8"
    );
    await Promise.all(
      decodedControlCases
        .slice(1)
        .map(([, control]) =>
          writeFile(
            join(root, `dependency${control}.ts`),
            "export const value = 1;\n",
            "utf8"
          )
        )
    );
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        specifier,
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });
  it.each(
    decodedControlCases
  )("rejects a file URL whose decoded path contains control %s", async (encodedControl, decodedControl) => {
    const root = await createTemporaryRoot();
    if (decodedControl !== "\0") {
      await writeFile(
        join(root, `dependency${decodedControl}.ts`),
        "export const value = 1;\n",
        "utf8"
      );
    }
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));
    const javascriptUrl = pathToFileURL(join(root, "dependency.js")).href;

    await expect(
      resolver(
        javascriptUrl.replace(
          "dependency.js",
          `dependency${encodedControl}.js`
        ),
        {},
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });

  it("requires the fallback candidate to be a regular file", async () => {
    const root = await createTemporaryRoot();
    await mkdir(join(root, "dependency.ts"));
    const failure = moduleNotFound();
    const resolver = await createResolver(root, rejectingResolver(failure));

    await expect(
      resolver(
        "./dependency.js",
        { parentURL: pathToFileURL(join(root, "entry.civet")).href },
        async () => {
          throw failure;
        }
      )
    ).rejects.toBe(failure);
  });
});
