import { defineConfig } from "drizzle-kit";

// biome-ignore lint/complexity/useLiteralKeys: TypeScript requires bracket access for ProcessEnv index-signature keys.
const databaseUrl = process.env["DATABASE_URL"];

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Drizzle commands");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./.drizzle/src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: databaseUrl,
  },
  strict: true,
  verbose: true,
});
