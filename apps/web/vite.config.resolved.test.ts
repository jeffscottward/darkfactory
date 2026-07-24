import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveConfig } from "vite";
import viteConfig from "./vite.config";

const SERVER_OPTIMIZE_DEPS_INCLUDE = [
  "@darkfactory/auth > @better-auth/drizzle-adapter",
  "@darkfactory/auth > better-auth",
  "@darkfactory/auth > better-auth/cookies",
  "@darkfactory/auth > better-auth/api",
  "@darkfactory/auth > better-auth/crypto",
  "@darkfactory/auth > drizzle-orm",
  "@darkfactory/db > drizzle-orm",
  "@darkfactory/db > drizzle-orm/pg-core",
  "@darkfactory/db > drizzle-orm/node-postgres",
  "@darkfactory/db > pg",
  "@darkfactory/api > zod",
] as const;

describe("resolved Vite environment optimizer contract", () => {
  it("applies explicit RSC, SSR, and client policy after every plugin hook", async () => {
    const resolved = await resolveConfig(
      {
        ...viteConfig,
        root: fileURLToPath(new URL(".", import.meta.url)),
        configFile: false,
      },
      "serve",
      "test"
    );
    // biome-ignore lint/complexity/useLiteralKeys: Vite environment names are index-signature keys.
    const rsc = resolved.environments["rsc"]?.optimizeDeps;
    // biome-ignore lint/complexity/useLiteralKeys: Vite environment names are index-signature keys.
    const client = resolved.environments["client"]?.optimizeDeps;
    // biome-ignore lint/complexity/useLiteralKeys: Vite environment names are index-signature keys.
    const ssr = resolved.environments["ssr"]?.optimizeDeps;

    for (const server of [rsc, ssr]) {
      const requiredServerEntries =
        server?.include?.filter((entry) =>
          SERVER_OPTIMIZE_DEPS_INCLUDE.includes(
            entry as (typeof SERVER_OPTIMIZE_DEPS_INCLUDE)[number]
          )
        ) ?? [];
      expect(requiredServerEntries).toHaveLength(
        SERVER_OPTIMIZE_DEPS_INCLUDE.length
      );
      expect(new Set(requiredServerEntries)).toEqual(
        new Set(SERVER_OPTIMIZE_DEPS_INCLUDE)
      );
      expect(server?.exclude).toEqual(expect.arrayContaining(["vinext"]));
      expect(server?.noDiscovery).toBe(true);
      expect(server?.include).toContain("@darkfactory/api > zod");
      expect(new Set(server?.include).size).toBe(server?.include?.length);
    }

    expect(client?.include).toEqual(
      expect.arrayContaining([
        "react",
        "react-dom",
        "react/jsx-runtime",
        "react/jsx-dev-runtime",
        "@tanstack/react-form",
        "@darkfactory/state > zustand/vanilla",
        "@darkfactory/ui > radix-ui",
        "@darkfactory/ui > sonner",
        "next/router",
      ])
    );
    expect(client?.exclude).toEqual(
      expect.arrayContaining(["vinext", "lucide-react", "next/link"])
    );
    expect(new Set(client?.include).size).toBe(client?.include?.length);
    expect(new Set(client?.exclude).size).toBe(client?.exclude?.length);
  });
});
