import civetVitePlugin from "@danielx/civet/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import vinext from "vinext";

// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
const rawPort = process.env["PORT"];
const parsedPort = rawPort === undefined ? undefined : Number(rawPort);

if (
  parsedPort !== undefined &&
  (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535)
) {
  throw new TypeError("PORT must be an integer between 1 and 65535");
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
    host: "127.0.0.1",
    ...(parsedPort === undefined ? {} : { port: parsedPort }),
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    ...(parsedPort === undefined ? {} : { port: parsedPort }),
    strictPort: true,
  },
  plugins: [
    civetVitePlugin({
      ts: "esbuild",
      typecheck: false,
    }),
    tailwindcss(),
    vinext({
      nextConfig: {
        pageExtensions: ["civet", "tsx", "ts", "jsx", "js"],
      },
    }),
  ],
});
