import { AI_ADAPTERS } from "@darkfactory/ai/adapters";
import { ANALYTICS_ADAPTERS } from "@darkfactory/analytics/adapters";
import { EMAIL_ADAPTERS } from "@darkfactory/email/adapters";
import { z } from "zod";
import { DATABASE_PROVIDERS } from "./database.ts";

// Identity is free-form so a renamed project parses; providers come from the
// adapter registries exported next to each adapter; fixed architecture choices
// stay single-value enums so an unsupported swap fails validation.
const SLUG_PATTERN = /^[a-z][a-z0-9-]*$/;
const SEMVER_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const HTTPS_PROTOCOL = /^https$/;

const httpsUrl = z.url({ protocol: HTTPS_PROTOCOL });
const nonEmpty = z.string().min(1);
const strict = <Shape extends z.ZodRawShape>(shape: Shape) =>
  z.object(shape).strict();

export const capabilityManifestSchema = strict({
  project: strict({
    name: nonEmpty,
    slug: z.string().regex(SLUG_PATTERN),
    version: z.string().regex(SEMVER_PATTERN),
    framework_api: z.enum(["next-app-router"]),
    framework_implementation: z.enum(["vinext"]),
    build_tool: z.enum(["vite"]),
    language: z.enum(["typescript"]),
    runtime: z.enum(["cloudflare-workers"]),
  }),
  workspace: strict({
    package_manager: z.enum(["pnpm"]),
    script_runtime: z.enum(["bun"]),
    orchestration: z.enum(["turborepo"]),
  }),
  deployment: strict({
    web: strict({
      provider: z.enum(["cloudflare"]),
      deployer: z.enum(["@vinext/cloudflare"]),
    }),
    // Reserved, not installed: see docs/adr/0001-vinext-alchemy-boundary.md.
    ancillary_resources: strict({
      provider: z.enum(["cloudflare"]),
      infrastructure: z.enum(["alchemy"]),
      enabled: z.boolean(),
    }),
  }),
  database: strict({
    engine: z.enum(["postgres"]),
    orm: z.enum(["drizzle"]),
    provider: z.enum(DATABASE_PROVIDERS),
    extensions_first: z.boolean(),
  }),
  api: strict({
    provider: z.enum(["orpc"]),
    style: z.enum(["contract-first"]),
    openapi: z.boolean(),
  }),
  auth: strict({ provider: z.enum(["better-auth"]) }),
  ui: strict({
    styling: z.enum(["tailwind"]),
    components: z.enum(["shadcn"]),
    typography: nonEmpty,
    public_reference: httpsUrl,
    portal_reference: httpsUrl,
  }),
  ai: strict({ provider: z.enum(AI_ADAPTERS) }),
  email: strict({
    provider: z.enum(EMAIL_ADAPTERS),
    local_transport: z.enum(["preview"]),
  }),
  analytics: strict({
    provider: z.enum(ANALYTICS_ADAPTERS),
    adapter_required: z.boolean(),
  }),
  telemetry: strict({ provider: z.enum(["opentelemetry"]) }),
  logging: strict({ provider: z.enum(["evlog"]) }),
  quality: strict({
    formatter_linter: z.enum(["ultracite"]),
    git_hooks: z.enum(["husky"]),
    unit_tests: z.enum(["vitest"]),
    browser_tests: z.enum(["playwright"]),
  }),
  developer_context: strict({
    code_graph: strict({
      provider: z.enum(["graphify"]),
      enabled: z.boolean(),
    }),
  }),
  examples: strict({
    feature_stub: strict({
      enabled: z.boolean(),
      removable: z.boolean(),
      generator_source: z.boolean(),
    }),
  }),
  development: strict({
    https: strict({
      enabled: z.boolean(),
      provider: z.enum(["portless"]),
      service_name: z.string().regex(SLUG_PATTERN),
      canonical_url: httpsUrl,
      certificate_fallback: z.enum(["mkcert"]),
      fallback_hostnames: z.array(nonEmpty).min(1),
    }),
    seeded_accounts: strict({
      enabled: z.boolean(),
      // Seeded credentials are never allowed in production.
      production_allowed: z.literal(false),
      users: z.array(z.string().regex(SLUG_PATTERN)).min(1),
    }),
  }),
  state: strict({
    workflows: z.enum(["xstate"]),
    client_local: z.enum(["zustand"]),
  }),
});

export type CapabilityManifest = z.infer<typeof capabilityManifestSchema>;
