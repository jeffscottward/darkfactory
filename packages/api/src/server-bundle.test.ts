import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { describe, expect, it } from "vitest";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

describe("API server browser bundle", () => {
  it("preserves browser poison for a side-effect-only server import", async () => {
    const tempDir = await mkdtemp(join(packageRoot, ".server-browser-bundle-"));
    const entry = join(tempDir, "entry.mjs");

    try {
      await writeFile(entry, 'import "@darkfactory/api/server"\n');
      const buildResult = await build({
        configFile: false,
        logLevel: "silent",
        resolve: {
          conditions: ["browser"],
        },
        ssr: {
          noExternal: true,
          resolve: {
            conditions: ["browser"],
          },
        },
        build: {
          outDir: join(tempDir, "dist"),
          ssr: true,
          target: "esnext",
          write: false,
          rollupOptions: {
            input: entry,
          },
        },
      });
      const builds = Array.isArray(buildResult) ? buildResult : [buildResult];
      const bundle = builds
        .flatMap((result) => {
          if (!("output" in result))
            throw new Error("Vite build did not finish");
          return result.output;
        })
        .filter((output) => output.type === "chunk")
        .map((chunk) => chunk.code)
        .join("\n");
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(bundle).toString("base64")}`;

      return await expect(import(moduleUrl)).rejects.toThrow(
        "@darkfactory/api/server is unavailable in browser bundles"
      );
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  return it("throws when the browser-only server poison module is evaluated directly", async () =>
    await expect(import("./server/unsupported.ts")).rejects.toThrow(
      "@darkfactory/api/server is unavailable in browser bundles"
    ));
});
