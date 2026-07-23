import { isIP } from "node:net";
import { cloudflare } from "@cloudflare/vite-plugin";
import civetVitePlugin from "@danielx/civet/vite";
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
  server: {
    host,
    ...(port === undefined ? {} : { port }),
    strictPort: true,
  },
  plugins: [
    civetVitePlugin({
      ts: "esbuild",
      typecheck: true,
    }),
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
