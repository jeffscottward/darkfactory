import { isIP } from "node:net";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import vinext from "vinext";
import { defineConfig, type Plugin } from "vite";

const rawPort = process.env["PORT"];
let port: number | undefined;

if (rawPort !== undefined) {
  const parsedPort = Number(rawPort);
  if (!/^\d+$/u.test(rawPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  port = parsedPort;
}

const host = process.env["HOST"]?.trim() || "127.0.0.1";
const isDottedNumericAddress = /^[\d.]+$/u.test(host) && host.includes(".");
const isHostname =
  !isDottedNumericAddress &&
  /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/iu.test(
    host
  );

if (isIP(host) === 0 && !isHostname) {
  throw new Error(
    "HOST must be a valid hostname or IP address without a scheme, path, or port."
  );
}

// Pre-bundle lucide-react. When it is excluded, its barrel export makes the
// dev browser fetch about 1,900 icon modules (12 MB) on each cold page load.
const CLIENT_OPTIMIZE_DEPS_INCLUDE = [
  "@tanstack/react-form",
  "@darkfactory/auth > better-auth/client",
  "@darkfactory/auth > better-auth/client/plugins",
  "@darkfactory/state > zustand/vanilla",
  "@darkfactory/state > xstate",
  "@darkfactory/ui > radix-ui",
  "@darkfactory/ui > sonner",
  "lucide-react",
  "next/router",
] as const;
const CLIENT_OPTIMIZE_DEPS_EXCLUDE = ["next/link"] as const;
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

const mergeOptimizerEntries = (
  existing: readonly string[] | undefined,
  required: readonly string[]
): string[] => [...new Set([...(existing ?? []), ...required])];

const FONT_FILE_PATTERN = /\.(?:woff2?|ttf|otf|eot)$/iu;

// Never inline font files as base64. An inlined subset is downloaded with
// every stylesheet, even when its unicode-range never matches the page text.
export const keepFontFilesExternal = (filePath: string): false | undefined =>
  FONT_FILE_PATTERN.test(filePath) ? false : undefined;

const environmentOptimizerPolicy = (): Plugin => ({
  name: "darkfactory:environment-optimizer-policy",
  enforce: "post",
  configEnvironment: {
    order: "post",
    handler(name, environment) {
      if (name === "client") {
        environment.optimizeDeps = {
          ...environment.optimizeDeps,
          exclude: mergeOptimizerEntries(
            environment.optimizeDeps?.exclude,
            CLIENT_OPTIMIZE_DEPS_EXCLUDE
          ),
          include: mergeOptimizerEntries(
            environment.optimizeDeps?.include,
            CLIENT_OPTIMIZE_DEPS_INCLUDE
          ),
        };
        // Client assets are publicly served, so never emit maps for them.
        environment.build = { ...environment.build, sourcemap: false };
        return;
      }
      if (name !== "rsc" && name !== "ssr") {
        return;
      }
      environment.optimizeDeps = {
        ...environment.optimizeDeps,
        include: mergeOptimizerEntries(
          environment.optimizeDeps?.include,
          SERVER_OPTIMIZE_DEPS_INCLUDE
        ),
        noDiscovery: true,
      };
      // Worker (rsc/ssr) maps are uploaded privately via wrangler.jsonc
      // `upload_source_maps`, so production stack traces stay readable.
      environment.build = { ...environment.build, sourcemap: true };
    },
  },
});

export default defineConfig({
  build: {
    assetsInlineLimit: keepFontFilesExternal,
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
    ],
  },
  server: {
    host,
    ...(port === undefined ? {} : { port }),
    strictPort: true,
    // Reduces dev transform latency; the native popover remains the SSR fallback.
    warmup: {
      clientFiles: [
        "./src/components/portal-shell.tsx",
        "./src/components/public-shell.tsx",
      ],
    },
  },
  preview: {
    host,
    ...(port === undefined ? {} : { port }),
    strictPort: true,
  },
  plugins: [
    tailwindcss(),
    vinext({
      nextConfig: {
        pageExtensions: ["tsx", "ts", "jsx", "js"],
      },
    }),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
    environmentOptimizerPolicy(),
  ],
});
