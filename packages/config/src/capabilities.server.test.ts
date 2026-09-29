import { readFile } from "node:fs/promises";
import { AI_ADAPTERS, type AiAdapterId } from "@darkfactory/ai/adapters";
import {
  ANALYTICS_ADAPTERS,
  type AnalyticsAdapterId,
} from "@darkfactory/analytics/adapters";
import {
  EMAIL_ADAPTERS,
  type EmailAdapterId,
} from "@darkfactory/email/adapters";
import { describe, expect, it } from "vitest";
import type { CapabilityManifest } from "./capabilities.ts";
import { DATABASE_PROVIDERS, type DatabaseProvider } from "./database.ts";
import { loadCapabilityManifest } from "./server/capabilities-loader.ts";

const readManifest = async (): Promise<CapabilityManifest> => {
  return loadCapabilityManifest(
    await readFile(
      new URL("../../../capabilities.yaml", import.meta.url),
      "utf8"
    )
  );
};

type AdapterLoader = () => Promise<unknown>;

// Every registry id must name a loadable adapter factory. The Record types
// turn a registry entry without an adapter module into a typecheck error.
const ADAPTER_MODULES: Readonly<{
  ai: Record<AiAdapterId, AdapterLoader>;
  analytics: Record<AnalyticsAdapterId, AdapterLoader>;
  email: Record<EmailAdapterId, AdapterLoader>;
  database: Record<DatabaseProvider, AdapterLoader>;
}> = {
  ai: {
    groq: async () =>
      (await import("@darkfactory/ai/server/groq")).createGroqAiPort,
  },
  analytics: {
    posthog: async () =>
      (await import("@darkfactory/analytics/server/posthog"))
        .createPostHogAnalyticsPort,
  },
  email: {
    resend: async () =>
      (await import("@darkfactory/email/server")).createResendEmailPort,
  },
  // Database providers share the pg driver; provider rules live in the
  // connection profile (see packages/config/src/database.ts).
  database: {
    postgres: async () =>
      (await import("./database.ts")).composeDatabaseProfile,
    planetscale: async () =>
      (await import("./database.ts")).composeDatabaseProfile,
    hyperdrive: async () =>
      (await import("./database.ts")).composeDatabaseProfile,
  },
};

describe("capability adapters", () => {
  it("maps every registry id to exactly one adapter module", () => {
    expect(Object.keys(ADAPTER_MODULES.ai)).toEqual([...AI_ADAPTERS]);
    expect(Object.keys(ADAPTER_MODULES.analytics)).toEqual([
      ...ANALYTICS_ADAPTERS,
    ]);
    expect(Object.keys(ADAPTER_MODULES.email)).toEqual([...EMAIL_ADAPTERS]);
    return expect(Object.keys(ADAPTER_MODULES.database).sort()).toEqual(
      [...DATABASE_PROVIDERS].sort()
    );
  });

  return it("loads an adapter factory for every provider the manifest declares", async () => {
    const manifest = await readManifest();
    const declared = [
      ADAPTER_MODULES.ai[manifest.ai.provider],
      ADAPTER_MODULES.analytics[manifest.analytics.provider],
      ADAPTER_MODULES.email[manifest.email.provider],
      ADAPTER_MODULES.database[manifest.database.provider],
    ];

    for (const load of declared) {
      expect(await load()).toBeTypeOf("function");
    }
    // Load the undeclared registry entries too so none can rot unnoticed.
    const all = Object.values(ADAPTER_MODULES).flatMap((adapters) =>
      Object.values(adapters)
    );
    return expect(
      await Promise.all(all.map(async (load) => typeof (await load())))
    ).toEqual(all.map(() => "function"));
  });
});
