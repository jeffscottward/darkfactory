import civet from "@danielx/civet/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [civet({ ts: "esbuild" })],
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: [
            "**/*.test.civet",
            "**/*.spec.civet",
            "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
          ],
          exclude: [
            "**/node_modules/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/tests/e2e/**",
            "**/tests/integration/**",
            "**/*contract.test.civet",
            "**/scripts/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["**/*contract.test.civet"],
          exclude: [
            "**/node_modules/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/tests/e2e/**",
            "**/tests/integration/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "operations",
          include: ["scripts/**/*.test.civet"],
          exclude: ["**/node_modules/**", "**/.turbo/**", "**/dist/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e-helpers",
          include: [
            "playwright.config.test.ts",
            "tests/e2e/helpers/*.test.civet",
            "tests/e2e/helpers/*.test.ts",
          ],
          exclude: ["**/node_modules/**", "**/.turbo/**", "**/dist/**"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.civet"],
          exclude: [
            "**/node_modules/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/tests/e2e/**",
          ],
        },
      },
    ],
  },
});
