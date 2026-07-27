import { isIP } from "node:net";
import { cloudflare } from "@cloudflare/vite-plugin";
import civetVitePlugin from "@danielx/civet/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import vinext from "vinext";

// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
const rawPort = process.env["PORT"];
const isE2EBrowserChild =
  process.env.NODE_ENV === "development" &&
  // biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
  process.env["APP_ENV"] === "test";
let port: number | undefined;

if (rawPort !== undefined) {
  const parsedPort = Number(rawPort);
  if (!/^\d+$/u.test(rawPort) || parsedPort < 1 || parsedPort > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535.");
  }
  port = parsedPort;
}

// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
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

const CLIENT_OPTIMIZE_DEPS_INCLUDE = [
  "@tanstack/react-form",
  "@darkfactory/auth > better-auth/client",
  "@darkfactory/auth > better-auth/client/plugins",
  "@darkfactory/state > zustand/vanilla",
  "@darkfactory/state > xstate",
  "@darkfactory/ui > radix-ui",
  "@darkfactory/ui > sonner",
  "next/router",
] as const;
const CLIENT_OPTIMIZE_DEPS_EXCLUDE = ["lucide-react", "next/link"] as const;
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
    },
  },
});

export default defineConfig({
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
      clientFiles: ["./src/components/portal-shell.civet"],
    },
  },
  preview: {
    host,
    ...(port === undefined ? {} : { port }),
    strictPort: true,
  },
  plugins: [
    civetVitePlugin({
      ts: "esbuild",
      // Vite transforms (development and production) only: Civet's TS service
      // misreports /Users vs /users as TS1149. The package script remains strict.
      typecheck: false,
    }),
    tailwindcss(),
    vinext({
      nextConfig: {
        pageExtensions: ["civet", "tsx", "ts", "jsx", "js"],
      },
    }),
    cloudflare({
      // Automated browser lanes do not expose a Worker debugger. Do not make
      // Miniflare readiness depend on an unused inspector control socket.
      ...(isE2EBrowserChild ? { inspectorPort: false } : {}),
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
    environmentOptimizerPolicy(),
  ],
});
