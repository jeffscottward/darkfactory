import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "next/link": fileURLToPath(
        new URL("./apps/web/src/test/next-link.tsx", import.meta.url)
      ),
    },
  },
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      reporter: ["text", "json-summary"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
      include: [
        "apps/*/src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "packages/*/src/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "scripts/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
      ],
      exclude: [
        "**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}",
        "**/*.d.ts",
        "**/generated/**",
        "apps/web/src/features/generated-navigation.ts",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["**/*.{test,spec}.{js,jsx,ts,tsx,mjs,cjs,mts,cts}"],
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/tests/e2e/**",
            "**/tests/integration/**",
            "**/*contract.test.ts",
            "**/scripts/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "contract",
          include: ["**/*contract.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
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
          include: ["scripts/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/.turbo/**",
            "**/dist/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "e2e-helpers",
          include: ["tests/e2e/helpers/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/.turbo/**",
            "**/dist/**",
          ],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          exclude: [
            "**/node_modules/**",
            "**/.git/**",
            "**/.turbo/**",
            "**/dist/**",
            "**/tests/e2e/**",
          ],
        },
      },
    ],
  },
});
