import { isIP } from "node:net";
import { cloudflare } from "@cloudflare/vite-plugin";
import civetVitePlugin from "@danielx/civet/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
const rawPort = process.env["PORT"];
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
  },
  environments: {
    client: {
      optimizeDeps: {
        exclude: ["next/link"],
        include: [
          "@darkfactory/state > zustand/vanilla",
          "@darkfactory/ui > radix-ui",
          "@darkfactory/ui > sonner",
          "lucide-react",
          "next/router",
        ],
      },
    },
    rsc: {
      optimizeDeps: {
        include: ["@darkfactory/db > pg"],
      },
    },
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
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
