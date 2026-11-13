import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  CLIENT_BUILD_MANIFEST_PATH,
  clientChunkPath,
  clientChunkPathFromManifest,
  escapeRegExp,
} from "./client-chunks.ts";

const manifest = {
  _shared: { file: "_next/static/chunks/0zTnLW7-.js", name: "portal-shell" },
  broken: null,
  "virtual:vinext-client-reference-module/92e396dd588d/recoverable-error-fixture":
    {
      file: "_next/static/chunks/B2xaQLwJ.js",
      isDynamicEntry: true,
      name: "recoverable-error-fixture",
    },
  "virtual:vinext-client-reference-module/c978f93aa3f9/portal-shell": {
    file: "_next/static/chunks/xhkCXCEO.js",
    isDynamicEntry: true,
    name: "portal-shell",
  },
};

describe("client chunk lookup", () => {
  it("finds the one dynamic-entry chunk for a client module", () => {
    expect(clientChunkPathFromManifest(manifest, "portal-shell")).toBe(
      "/_next/static/chunks/xhkCXCEO.js"
    );
    expect(
      clientChunkPathFromManifest(manifest, "recoverable-error-fixture")
    ).toBe("/_next/static/chunks/B2xaQLwJ.js");
  });

  it("rejects a manifest that is not an object, or zero or several chunks", () => {
    expect(() => clientChunkPathFromManifest(null, "portal-shell")).toThrow(
      "The client build manifest is not an object."
    );
    expect(() => clientChunkPathFromManifest(manifest, "missing")).toThrow(
      "Expected one client chunk for missing; found 0."
    );
    const duplicated = {
      ...manifest,
      other: {
        file: "_next/static/chunks/other.js",
        isDynamicEntry: true,
        name: "portal-shell",
      },
    };
    expect(() =>
      clientChunkPathFromManifest(duplicated, "portal-shell")
    ).toThrow("Expected one client chunk for portal-shell; found 2.");
  });

  it("reads the manifest file, by default from the web client build", () => {
    expect(CLIENT_BUILD_MANIFEST_PATH).toBe(
      fileURLToPath(
        new URL(
          "../../../apps/web/dist/client/.vite/manifest.json",
          import.meta.url
        )
      )
    );
    const directory = mkdtempSync(join(tmpdir(), "client-chunks-"));
    try {
      const path = join(directory, "manifest.json");
      writeFileSync(path, JSON.stringify(manifest));
      expect(clientChunkPath("portal-shell", path)).toBe(
        "/_next/static/chunks/xhkCXCEO.js"
      );
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  it("escapes a chunk path for use in a regular expression", () => {
    const pattern = new RegExp(
      `${escapeRegExp("/_next/static/chunks/a.b-c.js")}$`,
      "u"
    );
    expect(pattern.test("https://x/_next/static/chunks/a.b-c.js")).toBe(true);
    expect(pattern.test("https://x/_next/static/chunks/aXb-c.js")).toBe(false);
  });
});
