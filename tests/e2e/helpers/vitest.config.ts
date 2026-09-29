import civet from "@danielx/civet/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [civet({ ts: "esbuild" })],
  test: {
    environment: "node",
    include: ["tests/e2e/helpers/*.test.ts", "tests/e2e/helpers/*.test.ts"],
  },
});
