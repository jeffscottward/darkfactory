# DarkFactory v0.1 — One-Shot Build and Verification Prompt

Copy everything below this sentence into an AI coding harness at the root of the `darkfactory` repository.

---

## Mission

You are the lead architect and implementation harness for **DarkFactory v0.1**.

Treat this prompt as the authoritative architectural decision record (ADR) for DarkFactory. It is complete and self-contained; do not search for or require the conversation that produced it. Before writing implementation code, extract every explicit decision, implicit convention, philosophy, constraint, tradeoff, and architectural rule below into an internally consistent `docs/specs/DARKFACTORY_SPEC.md`. Resolve contradictions using the precedence rules and superseded-decisions table, self-review the specification for completeness, then build and verify the repository end to end without pausing for redundant approval. If repository files already exist, inspect and adapt them rather than blindly replacing user work.

Do not optimize for shipping quickly. Optimize for creating the foundation that hundreds of future repositories can inherit. DarkFactory is opinionated about developer experience and intentionally unopinionated about business domains.

Use later decisions in this document over earlier-looking examples. If an implementation detail conflicts with an invariant, the invariant wins. If a tool's current API differs from an example, verify its installed or official current API, preserve the intended boundary and behavior, and record the exact adjustment in the implementation evidence.

Do not stop at scaffolding. Continue until the working application, database, authentication, generic vertical slice, public site, authenticated portal, local HTTPS, scripts, hooks, CI, documentation, generated contracts, and verification evidence satisfy the definition of done.

## Required operating behavior

1. Inspect the repository and all applicable instruction files before editing.
2. Preserve unexpected existing work; never erase it merely to make scaffolding easier.
3. Use the repository's package manager and scripts, never ad hoc alternatives.
4. Use TDD for observable contracts: establish the failing behavior first, implement, and prove it passes.
5. Delegate independent phases to focused agents when the harness supports it. Give each agent exclusive file ownership and explicit dependencies.
6. Keep commits small, focused, and reviewable.
7. **Commit and push continuously, but only after the affected phase's green gate passes. Never push a known-red commit.**
8. After every push, inspect GitHub Actions. Diagnose and repair repository-owned failures, push the focused fix only after its local gate is green, and repeat until CI is green.
9. Never add a new service, datastore, provider SDK, abstraction, dependency, or optional capability merely because it is familiar.
10. Do not leave stubs, no-ops, fake success paths, `TODO: implement`, disabled tests, or placeholder APIs in any v0.1 core behavior.
11. Placeholder prose and imagery are allowed only for generic public-page content. Use `https://placehold.co/` for generic imagery and fake avatars/favicons where an original asset is unnecessary.
12. Record commands, results, URLs, screenshots, migrations, generated artifacts, and CI links as evidence. Do not claim a gate was green unless it was observed.

## 1. Meta-objective and product identity

**Name:** DarkFactory  
**Repository slug:** `darkfactory`  
**Release target:** `v0.1`  
**Description:** A modular, Postgres-first, AI-native application foundation built with Civet, Vite, vinext, Turborepo, oRPC, Drizzle, Better Auth, Cloudflare, and pluggable capabilities.

DarkFactory is not Glen Ross, a trading system, a CRM, a SaaS billing product, or any other vertical application. It is a domain-neutral boilerplate and AI-native architecture from which unrelated applications can be generated predictably with low agent-context cost.

Optimize for:

```text
stable core
+
replaceable adapters
+
optional capabilities
+
explicit conventions
+
intentional infrastructure minimalism
```

The governing data rule is:

> Whenever there is a choice between introducing another piece of infrastructure and extending PostgreSQL, prefer PostgreSQL unless a compelling measured technical requirement proves otherwise. Every additional infrastructure component must justify its capability, failure modes, credentials, deployment, monitoring surface, and agent-context cost.

The governing composition rule is:

> Start modular at the function and component level. Split files when the boundary becomes meaningful, not merely to produce small files.

The governing portability rule is:

> Write a portable Next.js-compatible application that runs through vinext; do not write an application coupled to obscure vinext-only behavior.

## 2. Requirement classification

Apply these labels in code review, architecture docs, manifests, and decisions:

| Class | Definition | DarkFactory v0.1 examples |
| --- | --- | --- |
| **Core** | Present and working in every DarkFactory repository. | pnpm/Turborepo shell, Vite/vinext web app, Civet-authored app code, Postgres/Drizzle, Better Auth, contract-first oRPC/OpenAPI, Tailwind/shadcn, provider ports, OTel, evlog, PostHog adapter, Graphify workflow, HTTPS setup, seeded development identities, feature stub, CI and verification scripts. |
| **Capability** | Optional functionality represented by a manifest, port, documentation, and enablement path; not necessarily installed. | Celery/Flower, Mintlify, Uptime Kuma, GlitchTip, R2, Memori, pgvector, PostGIS, TimescaleDB, pg_cron, Postgres queue/search/realtime profiles. |
| **Convention** | A rule every human and AI contributor follows regardless of current provider. | Contracts before implementations, Postgres/extensions first, no direct ORM bypass, Graphify before broad exploration, meaningful file boundaries, focused green commits, CI follow-through, sans-serif typography. |
| **Implementation** | The replaceable current technical choice that satisfies a core or capability boundary. | PlanetScale Postgres as the default managed profile, Groq, Resend, PostHog, Cloudflare Workers, `@vinext/cloudflare` for the web deploy, Alchemy for ancillary Cloudflare resources, portless + PM2 for long-lived local services, mkcert only as a certificate fallback, XState, Zustand, Effect, TanStack Devtools. |

Do not describe a provider implementation as an immutable domain rule. Do not describe a disabled optional capability as installed.

## 3. Superseded decisions — do not silently retain these

Later decisions are authoritative. Use this table in review and reject regressions.

| Superseded or rejected choice | Final decision |
| --- | --- |
| npm, Yarn, or Bun as dependency manager; dual lockfiles | **Bun 1.3.14** runs scripts and TypeScript; **pnpm 11.16.0** owns dependencies, workspaces, and the sole lockfile; Node >=22.13 remains compatibility. |
| A single-app repository with no workspace shell | **Turborepo + pnpm workspaces** at the root so sibling apps/services can be added without restructuring. Only `apps/web` is active in v0.1. |
| Standard Next build as the only runtime, OpenNext, TanStack Start, or a vinext-later placeholder | **Vite + vinext now**, exposing Next.js-compatible App Router conventions and retaining portability to standard Next tooling. |
| TypeScript/TSX as the normal authored app language; Civet used selectively | **Civet for authored application code**. TypeScript remains required where tooling requires exact `.ts`/`.tsx`, including configuration, generated code, third-party entrypoints, Cloudflare bindings, and Playwright test/harness/config files, or where external publication compatibility demands it. |
| tRPC | **Contract-first oRPC**, Zod validation, typed client/server integration, and generated OpenAPI. |
| MySQL, Convex, multiple default datastores, or backend-as-a-service coupling | **PostgreSQL first**, accessed through Drizzle; PlanetScale Postgres is the default managed provider profile, not a domain dependency. |
| Redis as a default cache/queue/pub-sub profile or a documented baseline fallback | **No Redis default and no predefined Redis fallback path.** Start with Postgres core/features/extensions and let measured project requirements guide later infrastructure. |
| RabbitMQ as the expected Celery broker | **No RabbitMQ baseline or expected capability.** Celery and Flower are disabled optional capability descriptors; queue transport remains an internal future decision with Postgres-first evaluation. |
| SST as infrastructure orchestrator, or an invented Alchemy adapter for vinext | **No SST and no fictional Alchemy web adapter.** With vinext `1.0.0-beta.3`, the v0.1 green-path web deploy uses the official `@vinext/cloudflare` deployer. Alchemy `0.93.12` remains for ancillary Cloudflare resources it actually supports. Optional self-hosted services may later define their own deployment path. |
| A domain-specific `leads` feature | **Generic removable `feature-stub`** built around `FeatureItem`; it demonstrates architecture without implying a business. |
| Payments capability | **No payments in v0.1 or the baseline manifest.** Add only if a future project asks for it. |
| Object blobs stored in Postgres | Object metadata and relationships belong in Postgres; large binaries belong in an optional R2/S3-compatible adapter. R2 is disabled in v0.1. |
| Sentry or GlitchTip as core | OTel is core instrumentation. Dedicated error tracking is disabled; the optional Postgres-centered profile is GlitchTip, while a future project may choose hosted Sentry for deeper product capability. |
| Celery, Flower, Mintlify, Uptime Kuma, GlitchTip, TimescaleDB, pgvector, PostGIS, R2, or Memori installed by default | Build their manifest descriptors, directories where specified, ports/configuration, enablement scripts, and docs only. **Do not install or run them in v0.1.** |
| Dark-only UI | Support `light`, `dark`, and `system`, with `system` default. |
| Serif display type or mixed serif/sans identity | **All typography is sans serif**, including marketing display headings, portal text, diagrams, controls, and generated examples. |
| Privacy-level sample identities and `reduced_motion` preference | Remove both. Keep nullable `date_of_birth`. Keep concrete consent/notification preferences only when they demonstrate real persistence. |
| Public site tied to a vertical product | Use domain-neutral public copy and reusable page archetypes inspired by `https://www.squarespace.com/`. |
| A custom dashboard aesthetic invented from scratch | Build practical authenticated portal composition from `https://ui.shadcn.com/blocks`; keep that URL as a continual `AGENTS.md` reference. |

## 4. Scope and non-goals

### v0.1 must deliver

- One active `apps/web` application.
- A polished multi-page public marketing surface.
- A practical authenticated portal with role-aware navigation.
- Working Better Auth email/password sign-up, sign-in, sign-out, session restoration, protected routes, password reset request/preview flow, and admin authorization.
- Development-only seed identities with complete profiles, addresses, avatars, preferences, and deterministic credentials.
- Postgres schema, Drizzle migrations, seed/reset workflows, and repositories.
- A complete generic `FeatureItem` vertical slice from UI to database, analytics, structured logging, and tests.
- Contract-first oRPC, typed client, OpenAPI generation, validation, and error mapping.
- Provider ports and working default adapters for core providers.
- Light/dark/system modes and ten independent color schemes with durable persistence.
- Local trusted HTTPS through a portless-managed named URL and PM2-managed long-lived process; mkcert remains a fallback when portless trust is insufficient.
- Graphify configuration, scripts, constitution rules, and CI freshness verification.
- Root scripts, Turborepo tasks, Husky hooks, GitHub Actions, test fixtures, docs, and observable evidence.
- Capability manifest and an idempotent capability/feature generator path.

### v0.1 non-goals

- No business-domain feature, business workflow, trading logic, property logic, CRM leads, commerce, subscription, or payment flow.
- No second active app, admin app, docs app, marketing app, or worker app. Public and portal routes live in `apps/web`.
- No Redis, RabbitMQ, Kafka, Elasticsearch, MongoDB, Convex, or separate default cache/queue/search database.
- No SST.
- No running Celery, Flower, Mintlify, Uptime Kuma, GlitchTip, Memori, R2, TimescaleDB, pgvector, PostGIS, or other optional service.
- No speculative giant abstraction framework. Ports exist only at real external boundaries.
- No micro-file explosion. Small related units may share an `index.civet` until reuse, independent testing, a domain boundary, or file growth makes separation meaningful.
- No reliance on production credentials for local verification. Core paths must have safe local transports/adapters.
- No fake production fallback. A disabled external provider must be explicit, and local behavior must be a real deterministic implementation such as preview email or console/OTLP test export.

## 5. Architecture invariants

1. Dependency direction is `framework → application → domain`; infrastructure adapters implement application ports. Domain code never imports a provider SDK, framework, Drizzle, Cloudflare, PostHog, Groq, Resend, R2, PlanetScale, or Better Auth.
2. Define small ports only for external effects: database/repositories, clock/IDs where determinism matters, analytics, telemetry/logging, email, AI, storage, jobs, and feature flags/config as actually needed.
3. Contracts precede procedures and client use. Public API handlers never bypass oRPC.
4. Persistent relational access never bypasses Drizzle repositories/stores. Raw SQL is allowed only inside `packages/db` for a documented Postgres capability Drizzle cannot express, with tests.
5. PostgreSQL is authoritative for durable structured state, metadata, relationships, audit history, workflow state, user preferences, and outbox events.
6. XState defines explicit processes; durable transitions are recorded in Postgres. XState is not the sole durable record.
7. Zustand owns lightweight ephemeral client state only. Server data, URL state, and durable preferences do not move into Zustand.
8. Effect is boundary-driven for typed failures, dependencies, resources, retries, timeouts, cancellation, concurrency, configuration, and observability. Plain pure Civet functions remain plain.
9. TanStack Devtools is development-only.
10. OpenTelemetry is the vendor-neutral telemetry contract; evlog emits structured events/logs; PostHog sits behind an analytics port. Business/domain code does not import PostHog.
11. The v0.1 web deployment boundary is explicit: the official `@vinext/cloudflare` deployer publishes the vinext app to Cloudflare Workers. Alchemy manages ancillary supported Cloudflare resources only. Neither is a domain concept, and no undocumented Alchemy vinext resource may be invented.
12. Every optional capability is disabled by default and must be truthfully represented. A directory or manifest entry must not imply a working installed service.
13. All user-visible typography is sans serif.
14. Public marketing and authenticated portal share tokens and primitives but use purpose-appropriate composition.
15. Authentication, authorization, CSRF/cookie behavior, secure headers, tenant/user scoping, input validation, and error sanitization are tested at boundaries.
16. Generated API and Graphify artifacts must be reproducible and checked for staleness.
17. The repository must be understandable by an agent from `AGENTS.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, `capabilities.yaml`, package manifests, contracts, and Graphify without reconstructing architecture from scratch.

## 6. Canonical technology baseline

```text
Foundation
├── Node >=22.13
├── pnpm 11 workspaces
├── Git
├── Turborepo
├── Vite
├── vinext 1.0.0-beta.3
└── Civet authored application code

Frontend
├── Next.js-compatible App Router through vinext
├── React
├── Tailwind CSS
├── shadcn/ui
├── XState for explicit processes
├── Zustand for ephemeral client state
└── TanStack Devtools in development only

Backend and contracts
├── Cloudflare Workers runtime
├── contract-first oRPC
├── OpenAPI generation
├── Zod validation
├── Better Auth
└── Effect at complex infrastructure boundaries

Data
├── PostgreSQL
├── PlanetScale Postgres default managed profile
├── Drizzle ORM
└── Postgres extensions/features before new infrastructure

Infrastructure and deployment
├── Cloudflare Workers
├── @vinext/cloudflare for the v0.1 web deploy
├── Alchemy 0.93.12 for ancillary supported Cloudflare resources only
└── GitHub Actions

Providers
├── Groq for AI
├── React Email + Resend for email
├── PostHog adapter for product analytics
├── OpenTelemetry for telemetry
└── evlog for structured logging/events

Quality, local runtime, and context
├── Ultracite
├── Husky
├── Vitest
├── Playwright
├── Graphify
├── portless
├── PM2
└── mkcert only as the certificate fallback
```

Pin versions through the pnpm workspace catalog or a single root policy. Confirm version compatibility before installation. Do not create both Biome and ESLint/Prettier pipelines if Ultracite's current supported pipeline already owns linting/formatting; expose one authoritative lint/format path.

### Toolchain compatibility contract

- Require Bun `1.3.14`, Node `>=22.13`, and pnpm `11.16.0`; declare them in root metadata and verify Bun and Node independently in `bun run doctor` and CI.
- Pin the reviewed green-path compatibility baseline: vinext `1.0.0-beta.3` and Alchemy `0.93.12`, unless a later verified version is adopted with recorded compatibility evidence.
- Configure Next-compatible routing so `pageExtensions` explicitly includes `civet` alongside any required JavaScript/TypeScript extensions. Prove `.civet` layouts, pages, loading/error boundaries, and route-adjacent authored modules are discovered.
- In Vite's plugin array, run the Civet Vite plugin **before** the vinext plugin so Civet transforms are available to vinext. Add a build/runtime test that fails if the order regresses.
- Keep TypeScript for configuration, generated artifacts, Cloudflare/tool entrypoints, and Playwright harness/spec/config files. Do not force those tooling boundaries into Civet.
- Use the official `@vinext/cloudflare` package for the web deploy. Alchemy `0.93.12` has no documented first-class vinext resource; do not invent or locally wrap one and call it official.
- Root lifecycle scripts MUST use `bun run`; Civet entrypoints use the Bun Civet preload and compatible local CLIs use `bunx --bun --no-install`. pnpm remains the sole package and lockfile owner. Every Vitest invocation is an explicit package-local Node exception through `corepack pnpm exec`, measured for Bun 1.3.14's misloading of Vitest's Vite `zod` dependency and missing V8 `node:inspector` coverage APIs.

## 7. Exact target repository tree

Create the smallest complete tree below. A trailing comment marks a disabled capability descriptor, not an installed service. Tool-required `.ts`, `.tsx`, `.mjs`, `.json`, YAML, CSS, generated OpenAPI, and migration files are permitted; authored app/domain/application code should be `.civet` wherever the toolchain supports it.

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml
├── .husky/
│   ├── pre-commit
│   └── pre-push
├── .graphify/                     # generated location or committed config + metadata policy
├── apps/
│   └── web/
│       ├── app/
│       │   ├── (marketing)/
│       │   │   ├── page.civet
│       │   │   ├── features/page.civet
│       │   │   ├── solutions/page.civet
│       │   │   ├── resources/page.civet
│       │   │   ├── about/page.civet
│       │   │   ├── contact/page.civet
│       │   │   └── legal/
│       │   │       ├── privacy/page.civet
│       │   │       └── terms/page.civet
│       │   ├── (auth)/
│       │   │   ├── sign-in/page.civet
│       │   │   ├── sign-up/page.civet
│       │   │   └── forgot-password/page.civet
│       │   ├── (portal)/
│       │   │   ├── layout.civet
│       │   │   ├── dashboard/page.civet
│       │   │   ├── feature-items/
│       │   │   │   ├── page.civet
│       │   │   │   ├── new/page.civet
│       │   │   │   └── [id]/page.civet
│       │   │   ├── account/
│       │   │   │   ├── page.civet
│       │   │   │   ├── profile/page.civet
│       │   │   │   ├── address/page.civet
│       │   │   │   ├── preferences/page.civet
│       │   │   │   └── security/page.civet
│       │   │   └── admin/
│       │   │       └── users/page.civet
│       │   ├── api/
│       │   │   ├── auth/[...all]/route.ts
│       │   │   ├── orpc/[...rest]/route.ts
│       │   │   └── openapi/route.ts
│       │   ├── layout.civet
│       │   ├── error.civet
│       │   └── not-found.civet
│       ├── src/
│       │   ├── components/
│       │   │   ├── index.civet
│       │   │   ├── marketing/
│       │   │   ├── portal-shell/
│       │   │   ├── theme-picker/
│       │   │   └── account-menu/
│       │   ├── features/
│       │   │   ├── feature-stub/
│       │   │   │   ├── index.civet
│       │   │   │   ├── feature.contract.civet
│       │   │   │   ├── feature.schema.civet
│       │   │   │   ├── feature.service.civet
│       │   │   │   ├── feature.store.civet
│       │   │   │   ├── feature.events.civet
│       │   │   │   ├── feature.machine.civet
│       │   │   │   ├── feature.state.civet
│       │   │   │   ├── components/
│       │   │   │   │   ├── index.civet
│       │   │   │   │   ├── feature-card.civet
│       │   │   │   │   ├── feature-form.civet
│       │   │   │   │   └── feature-status.civet
│       │   │   │   ├── server/index.civet
│       │   │   │   ├── client/index.civet
│       │   │   │   └── tests/
│       │   │   │       ├── feature.service.test.civet
│       │   │   │       └── feature.machine.test.civet
│       │   │   ├── authentication/
│       │   │   ├── account/
│       │   │   └── administration/
│       │   ├── framework/
│       │   ├── state/
│       │   └── lib/
│       ├── public/
│       │   ├── favicon.svg
│       │   └── placeholders/
│       ├── styles/
│       │   ├── globals.css
│       │   └── themes.css
│       ├── tests/
│       │   ├── integration/
│       │   └── e2e/
│       ├── package.json
│       ├── components.json
│       ├── next.config.ts         # pageExtensions includes civet
│       ├── playwright.config.ts   # tooling boundary remains TypeScript
│       └── vite.config.ts         # Civet plugin precedes vinext
├── packages/
│   ├── api/
│   │   ├── src/
│   │   │   ├── contracts/
│   │   │   ├── procedures/
│   │   │   ├── client/
│   │   │   ├── server/
│   │   │   └── openapi/
│   │   └── package.json
│   ├── auth/
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── client/
│   │   │   └── server/
│   │   └── package.json
│   ├── db/
│   │   ├── src/
│   │   │   ├── client/
│   │   │   ├── schema/
│   │   │   │   ├── auth/
│   │   │   │   ├── profiles/
│   │   │   │   ├── preferences/
│   │   │   │   ├── feature-stub/
│   │   │   │   └── memory/
│   │   │   ├── extensions/
│   │   │   ├── stores/
│   │   │   └── seeds/
│   │   │       ├── index.civet
│   │   │       ├── users.civet
│   │   │       ├── profiles.civet
│   │   │       └── preferences.civet
│   │   ├── migrations/
│   │   ├── drizzle.config.ts
│   │   └── package.json
│   ├── ui/
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── primitives/
│   │   │   ├── styles/
│   │   │   ├── themes/
│   │   │   └── providers/
│   │   └── package.json
│   ├── state/
│   │   ├── src/
│   │   │   ├── xstate/
│   │   │   └── zustand/
│   │   └── package.json
│   ├── effects/
│   ├── analytics/
│   │   └── src/
│   │       ├── interface/
│   │       └── posthog/
│   ├── observability/
│   │   └── src/
│   │       ├── otel/
│   │       ├── evlog/
│   │       └── health/
│   ├── email/
│   │   └── src/
│   │       ├── components/
│   │       ├── templates/
│   │       ├── renderer/
│   │       ├── resend/
│   │       └── preview/
│   ├── ai/
│   │   └── src/
│   │       ├── interface/
│   │       ├── groq/
│   │       ├── prompts/
│   │       └── tools/
│   ├── jobs/
│   │   └── src/
│   │       ├── contracts/
│   │       ├── client/
│   │       └── inline/
│   ├── storage/
│   │   └── src/
│   │       ├── interface/
│   │       ├── metadata/
│   │       └── r2/
│   ├── memory/                    # Memori descriptor/port only; disabled
│   │   └── src/memori/
│   ├── config/
│   ├── shared/
│   └── testkit/
├── services/
│   ├── jobs/                     # disabled descriptors/readmes only
│   │   ├── celery/
│   │   └── flower/
│   ├── uptime-kuma/               # disabled descriptor only
│   └── glitchtip/                 # disabled descriptor only
├── scripts/
│   ├── index.civet
│   ├── feature/index.civet
│   ├── database/index.civet
│   ├── certificates/index.civet
│   ├── capabilities/index.civet
│   ├── graph/index.civet
│   └── verify/index.civet
├── certs/
│   └── README.md                  # keys ignored; no key committed
├── docs/
│   ├── architecture/
│   ├── decisions/
│   │   ├── 001-postgres-default.md
│   │   ├── 002-orpc-contract-first.md
│   │   ├── 003-otel-vendor-neutral.md
│   │   ├── 004-provider-adapters.md
│   │   └── 005-civet-boundaries.md
│   ├── conventions/
│   ├── capabilities/
│   ├── ai/
│   └── specs/
│       └── DARKFACTORY_SPEC.md
├── infra/
│   ├── alchemy/
│   ├── cloudflare/
│   └── docker/                    # local Postgres only unless explicitly enabled
├── AGENTS.md
├── ARCHITECTURE.md
├── CONVENTIONS.md
├── README.md
├── capabilities.yaml
├── alchemy.run.ts
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .env.schema
├── .env.example
├── .gitignore
└── pnpm-lock.yaml
```

Do not create empty decorative packages. Every core package must expose an actual API and have a consumer. Disabled capability folders may contain only a truthful manifest/readme/port placeholder needed by the capability system.

## 8. Package boundaries and public APIs

Each workspace package must use explicit exports. No app reaches into another package's private path.

| Package | Owns | Required public API |
| --- | --- | --- |
| `@darkfactory/api` | oRPC contracts, procedure composition, context, error mapping, OpenAPI generation, typed client | `appContract`, `appRouter`, `createApiContext`, `createApiClient`, OpenAPI document builder; auth/feature namespaces. |
| `@darkfactory/auth` | Better Auth configuration and client/server helpers | `auth`, `authClient`, `requireSession`, `requireRole`, auth route handler bridge, safe session/user types. |
| `@darkfactory/db` | Drizzle client, schema, migrations, transaction boundary, repositories, seeds | `db`, schema exports, `withTransaction`, repository constructors, `seedDevelopment`, `resetDevelopment`; no provider-specific types leak upward. |
| `@darkfactory/ui` | shadcn-derived primitives, shared tokens/themes/providers | Stable component exports, `ThemeProvider`, `ThemePicker`, token types. Keep generated shadcn code distinguishable from authored composition. |
| `@darkfactory/state` | Shared XState/Zustand integration conventions | Machine actors/helpers and store utilities only when reused by more than one feature. Feature-local state stays local. |
| `@darkfactory/effects` | Boundary composition helpers | Typed service/config/resource layers used by infrastructure; no requirement that domain helpers return Effect. |
| `@darkfactory/analytics` | Analytics port and PostHog adapter | `AnalyticsPort` with `capture`, `identify`, `reset`, `group` as actually used; no-op is allowed only as an explicit local/test adapter that records events for assertions. |
| `@darkfactory/observability` | OTel initialization, trace context, evlog event/log helpers, health | `initializeTelemetry`, `withSpan`, structured logger/event factory, redaction policy, health contributors. |
| `@darkfactory/email` | React Email templates, rendering, Resend and preview transports | `EmailPort`, password reset template, `sendEmail`; local preview writes inspectable output without pretending delivery. |
| `@darkfactory/ai` | AI port, Groq adapter, prompts/tools | `AiPort` with the minimal v0.1 demonstration operation; deterministic fake adapter for tests only; no AI business feature. |
| `@darkfactory/jobs` | Job contract and inline Postgres-friendly core path | `JobPort`, typed job envelope, inline/test adapter. Celery/Flower are capability descriptors only. |
| `@darkfactory/storage` | Object-storage port and Postgres metadata contract | Interfaces and disabled R2 adapter boundary; do not install/initialize R2 unless enabled. |
| `@darkfactory/config` | Typed environment and capability parsing | Validated server/client config, manifest reader, provider selection; secrets never reach the client bundle. |
| `@darkfactory/shared` | Truly cross-cutting provider-free primitives | IDs, result/error primitives, dates only if reused; no dumping ground. |
| `@darkfactory/testkit` | Deterministic builders/fixtures | Database lifecycle, auth fixtures, ports/fakes, browser seed helpers. Test code must not leak into production bundles. |

### Port rules

- Ports are named for capabilities, never vendors: `AnalyticsPort`, not `PostHogService`; `AiPort`, not `GroqClient`.
- Adapters are named for vendors and live under infrastructure/package adapter folders.
- Accept dependencies through constructors/layers/context; do not import mutable singletons into domain services.
- Keep port methods at actual use-case granularity. Do not mirror entire vendor SDKs.
- Every adapter has a contract test shared with its deterministic local/test adapter when practical.
- Server-only packages must be protected from client imports.

## 9. Data model and persistence

Use Postgres naming consistently and generate real Drizzle migrations. Better Auth may require exact current table/column names; preserve its supported schema and map domain/profile tables around it.

### Authentication-owned tables

At minimum, implement the Better Auth version's required equivalents of:

```text
user
session
account
verification
```

Include role/status fields through the supported extension strategy without forking Better Auth internals unnecessarily. Use secure password hashing supplied by Better Auth. Do not store plaintext passwords.

### DarkFactory-owned tables

```text
profiles
├── user_id                 PK/FK -> auth user, cascade deliberately
├── first_name
├── last_name
├── display_name
├── avatar_url
├── phone
├── business_name
├── job_title
├── biography
├── timezone
├── locale
├── date_of_birth           nullable; retained by final decision
├── created_at
└── updated_at

addresses
├── id
├── user_id                 indexed FK
├── type                    enum/check: home | work | other
├── line_1
├── line_2                  nullable
├── city
├── region
├── postal_code
├── country
├── is_primary
├── created_at
└── updated_at

user_preferences
├── user_id                 PK/FK
├── mode                    light | dark | system
├── color_scheme            one of ten schemes
├── email_notifications
├── product_updates
├── analytics_consent
├── personalization_consent
├── profile_visibility      use a concrete app preference, not a seeded "privacy level"
├── created_at
└── updated_at

feature_items
├── id
├── name
├── description
├── status                  draft | active | archived
├── metadata                jsonb with bounded validated shape
├── owner_id                indexed FK -> user
├── created_at
└── updated_at

outbox_events
├── id
├── event_type
├── aggregate_type
├── aggregate_id
├── payload                 jsonb
├── occurred_at
├── published_at            nullable
└── attempt_count

audit_records
├── id
├── actor_user_id           nullable for system actions
├── action
├── entity_type
├── entity_id
├── metadata                redacted jsonb
├── request_id
└── created_at
```

Do not create the disabled Memori tables in the core migration. Document its future `memory.*` schema and provenance fields (`source_type`, `source_id`, `source_timestamp`, `confidence`, `created_by`, `supersedes_id`, `access_scope`, `retention_policy`) in the capability descriptor. Memori may derive context but may never become an alternate source of truth.

### Persistence requirements

- Use UUIDs or another sortable stable ID strategy consistently; test collision/error mapping behavior.
- Use UTC timestamps in storage and user timezone only for presentation.
- Add foreign keys, uniqueness, checks, indexes, and cascade behavior deliberately.
- Scope feature-item reads/writes by authenticated owner unless an admin procedure explicitly permits broader access.
- Mutating a feature item writes its durable state and outbox/audit event transactionally.
- Use Postgres full-text/JSON/index features only when the vertical slice actually needs them; do not enable extensions decoratively.
- Migration generation and application must be reproducible on an empty local Postgres database.
- Seed is idempotent and environment guarded. Production mode must reject development default credentials.

## 10. Authentication, authorization, and seeded identities

### Required auth behavior

- Email/password sign-up with normalized unique email.
- Sign-in, sign-out, session restoration, secure session cookie, protected portal routes, and redirect-back behavior.
- Forgot-password request renders a real React Email template and uses Resend only when configured; otherwise use an inspectable local preview transport.
- Password reset tokens are one-time/expiring according to Better Auth's supported flow.
- `/admin/users` is server-authorized for `admin`; hiding navigation alone is insufficient.
- Auth API errors are sanitized for clients and do not leak account existence or secrets beyond the chosen safe policy.
- Local HTTPS uses secure cookies and production-like settings. Tests cover cookie/session behavior over HTTPS.

### Deterministic development credentials

All three use the development-only password:

```text
Development123!
```

All seed emails use the reserved `.test` TLD:

```text
admin@domain.test
alice@domain.test
bob@domain.test
```

Production seeding must fail closed when default credentials are requested.

### Seeded profiles

Use complete realistic fake data, not vertical-domain data:

| Identity | Role | Name | Business | Theme | Other required data |
| --- | --- | --- | --- | --- | --- |
| Admin | `admin` | Admin User | Example Operations | neutral/system | Verified email, phone, job title, biography, timezone, locale, nullable or fake date of birth, primary work address, fake avatar. |
| Alice | `member` | Alice Adams | Alice & Co. | violet/dark | Verified email, phone, job title, biography, timezone, locale, date of birth, primary address, fake avatar. |
| Bob | `member` | Bob Baker | Bob Industries | blue/light | Verified email, phone, job title, biography, timezone, locale, date of birth, primary address, fake avatar. |

Use `https://placehold.co/` or local generated fake-avatar assets. Do not seed abstract `restrictive`/`standard` privacy levels. Do not create a `reduced_motion` preference. Seed concrete notification/consent choices only when the UI edits and persists them.

## 11. Generic feature stub

The feature stub must be useful as a copy/rename source and removable without breaking unrelated core behavior.

### Entity and behavior

```text
FeatureItem
├── id
├── name
├── description
├── status
├── metadata
├── ownerId
├── createdAt
└── updatedAt
```

Deliver the complete path:

```text
UI
→ local process/view state where justified
→ typed oRPC client
→ Zod/oRPC contract
→ authorized procedure
→ application service
→ Drizzle repository/store
→ Postgres transaction
→ outbox/analytics event
→ evlog structured event + OTel span
```

Required operations: list current user's items, get one, create, update, change status, delete/archive according to the documented contract. Include optimistic/pending, empty, validation, unauthorized/not-found, server failure, and success UI states. Demonstrate XState only for a meaningful create/edit/status workflow; do not add it to trivial toggles. Use Zustand only for a genuinely ephemeral view preference such as filters or sidebar state.

### Generator

Implement:

```bash
bun run generate:feature inventory
bun run generate:feature strategy
bun run generate:feature property
```

The generator must be idempotent/fail safely, validate names, show a plan, and update directory names, symbols, contracts, route registration, table names/migration plan, tests, package exports, docs, and Graphify. It must not silently overwrite an existing feature. Its internal flow is:

```text
parse arguments
→ validate input
→ construct plan
→ apply changes
→ verify result
→ update graph/docs
→ report outcome
```

Business logic does not live in the CLI handler. Test generation in a temporary fixture workspace.

## 12. Route inventory

All routes are in `apps/web`. Use route groups without changing public URLs.

### Public and authentication routes

| Route | Purpose | Required observable behavior |
| --- | --- | --- |
| `/` | Refined DarkFactory landing page | Clear neutral value proposition, product preview, feature narrative, capability architecture, CTA to sign up and explore. |
| `/features` | Core architecture/features | Describe contracts, Postgres-first data, auth, observability, AI/provider boundaries, generators without vertical claims. |
| `/solutions` | Generic use-case archetypes | Present adaptable archetypes such as internal tool, customer portal, AI workflow, and data application; explicitly examples, not baked-in domains. |
| `/resources` | Documentation/resource index | Link architecture, conventions, API/OpenAPI, capability docs, GitHub/readme surfaces that exist. |
| `/about` | Philosophy | Explain intentional infrastructure minimalism, AI-native context, stable core/replaceable adapters. |
| `/contact` | Generic contact/demo form | Accessible validated placeholder form with explicit non-delivery/local behavior unless a configured email path handles it. Never fake submission success. |
| `/legal/privacy` | Placeholder privacy policy | Clearly marked generic boilerplate content requiring project review before production. |
| `/legal/terms` | Placeholder terms | Same limitation; no invented legal assurances. |
| `/sign-in` | Better Auth login | Works with seeded accounts and supports redirect-back. |
| `/sign-up` | Account creation | Creates a member plus default profile/preferences transactionally or through a reliable provisioning flow. |
| `/forgot-password` | Reset request | Renders/sends through configured transport without account enumeration. |

### Authenticated portal routes

| Route | Access | Purpose |
| --- | --- | --- |
| `/dashboard` | authenticated | Practical overview using neutral metrics, recent feature items, quick actions, and system/capability status from real or clearly labeled seed data. |
| `/feature-items` | authenticated | Search/filter/list the current user's `FeatureItem` records. |
| `/feature-items/new` | authenticated | Validated create workflow. |
| `/feature-items/[id]` | owner or admin | View/edit/status/archive with correct 403/404 policy. |
| `/account` | authenticated | Account summary and navigation. |
| `/account/profile` | authenticated | Edit profile data including name, phone, business, title, biography, timezone, locale, and date of birth. |
| `/account/address` | authenticated | Edit and select primary address. |
| `/account/preferences` | authenticated | Persist mode, color scheme, notification and consent preferences. |
| `/account/security` | authenticated | Session/password/security summary using supported Better Auth behavior. |
| `/admin/users` | admin only | Search/paginate users, view role/status/profile summary, and demonstrate server authorization. Avoid destructive admin features not required by v0.1. |

Also implement branded, accessible loading, empty, not-found, unauthorized/forbidden, and unexpected-error states.

## 13. Design direction

### References and interpretation

- Public marketing direction: `https://www.squarespace.com/`
- Authenticated portal composition reference: `https://ui.shadcn.com/blocks`
- Placeholder assets: `https://placehold.co/`

These are inspiration/reference sources, not licenses to copy proprietary text, images, layout, or trade dress. Study their information density, hierarchy, spacing, pacing, navigation, editorial framing, dashboard composition, forms, tables, sidebars, and responsive behavior. Produce an original DarkFactory design.

`AGENTS.md` must include a durable instruction to consult `https://ui.shadcn.com/blocks` whenever building or materially revising authenticated portal pages. This continual reference is mandatory; do not reduce it to a one-time implementation note.

### Visual system

- **Typography:** sans serif everywhere. Choose a high-quality sans variable font with a robust system fallback. No serif headings, logos, quotes, or decorative specimens.
- Public pages: refined, editorial, generous whitespace, strong typographic scale, deliberate image/content rhythm, restrained motion, high-quality responsive navigation, and confident but domain-neutral copy.
- Portal: practical shadcn-block-derived shell with responsive sidebar/header, breadcrumbs where useful, dense but readable forms/tables/cards, clear states, keyboard support, and touch targets.
- Avoid generic AI gradients, excessive glassmorphism, decorative pill overload, huge empty hero copy, fake charts without labels, and a dark-only cyber aesthetic.
- Use shared semantic tokens, not hard-coded provider colors throughout components.
- Include an original fake DarkFactory favicon/mark; fake avatars and generic multi-page imagery may come from `https://placehold.co/` with meaningful alt text or empty alt for decoration.
- Responsive verification must cover narrow mobile, tablet, desktop, and wide desktop. No horizontal overflow at supported widths.
- Meet WCAG 2.2 AA intent: semantic landmarks, labels, errors tied to fields, visible focus, keyboard navigation, contrast, reduced animation for OS preference even though there is no persisted `reduced_motion` account field, and accessible dialogs/menus/tables.

### Theme model

Two independent dimensions:

```yaml
ui:
  mode:
    default: system
    options: [light, dark, system]
  color_scheme:
    default: neutral
    options:
      - neutral
      - slate
      - blue
      - cyan
      - green
      - amber
      - orange
      - red
      - rose
      - violet
```

Implement through shadcn-aligned CSS variables:

```text
--background
--foreground
--primary
--primary-foreground
--secondary
--secondary-foreground
--muted
--muted-foreground
--accent
--accent-foreground
--destructive
--destructive-foreground
--border
--input
--ring
--chart-1 through --chart-5
```

Persistence precedence:

1. Authenticated preference in Postgres is durable authority.
2. Cookie mirrors it for immediate server rendering and prevents theme flash.
3. Local storage is temporary for anonymous visitors.
4. System media preference resolves only when mode is `system`.

Test all ten color schemes in both light and dark rendering, the system resolver, reload persistence, login reconciliation, SSR hydration, and no-flash behavior.

## 14. Provider and capability architecture

### Core provider configuration

```yaml
project:
  name: DarkFactory
  slug: darkfactory
  version: 0.1.0
  framework_api: next-app-router
  framework_implementation: vinext
  build_tool: vite
  language: civet
  runtime: cloudflare-workers

workspace:
  package_manager: pnpm
  orchestration: turborepo

deployment:
  web:
    provider: cloudflare
    deployer: "@vinext/cloudflare"
  ancillary_resources:
    provider: cloudflare
    infrastructure: alchemy

database:
  engine: postgres
  orm: drizzle
  provider: planetscale
  extensions_first: true

api:
  provider: orpc
  style: contract-first
  openapi: true

auth:
  provider: better-auth

ui:
  styling: tailwind
  components: shadcn
  typography: sans-serif
  public_reference: https://www.squarespace.com/
  portal_reference: https://ui.shadcn.com/blocks

ai:
  provider: groq

email:
  renderer: react-email
  provider: resend
  local_transport: preview

analytics:
  provider: posthog
  adapter_required: true

telemetry:
  provider: opentelemetry

logging:
  provider: evlog

quality:
  formatter_linter: ultracite
  git_hooks: husky
  unit_tests: vitest
  browser_tests: playwright

developer_context:
  code_graph:
    provider: graphify
    enabled: true
```

### v0.1 capability manifest

```yaml
examples:
  feature_stub:
    enabled: true
    removable: true
    generator_source: true

development:
  https:
    enabled: true
    provider: portless
    service_name: darkfactory
    canonical_url: https://darkfactory.localhost
    process_manager: pm2
    certificate_fallback: mkcert
    fallback_hostnames: [localhost, "*.localhost", 127.0.0.1, "::1"]
  seeded_accounts:
    enabled: true
    production_allowed: false
    users: [admin, alice, bob]

state:
  workflows: xstate
  client_local: zustand

effects:
  provider: effect
  adoption: boundary-driven

developer_tools:
  tanstack_devtools:
    enabled: development

capabilities:
  docs:
    provider: mintlify
    enabled: false
    public: false
  jobs:
    engine: celery
    dashboard: flower
    enabled: false
  uptime:
    provider: uptime-kuma
    enabled: false
  error_tracking:
    provider: glitchtip
    database: postgres
    enabled: false
  storage:
    provider: r2
    metadata: postgres
    enabled: false
  context_graphs:
    data:
      provider: memori
      database: postgres
      enabled: false
  postgres_extensions:
    pgvector: { enabled: false }
    postgis: { enabled: false }
    timescaledb: { enabled: false }
    pg_trgm: { enabled: false }
    pg_cron: { enabled: false }
```

Do not include Redis, RabbitMQ, SST, payments, or a leads capability. Do not install disabled capability dependencies. The capability loader must validate unknown keys, incompatible combinations, missing required environment, and the difference between enabled, configured, and available.

### Provider-specific rules

- **PlanetScale Postgres:** default managed profile only. Core local tests use ordinary Postgres. Check required feature support before enabling extensions; change provider rather than automatically adding a separate datastore.
- **Groq:** implement behind `AiPort`. Missing production key produces a clear disabled/unconfigured state, not a fake AI response. Core app must remain usable without invoking AI.
- **Resend:** implement behind `EmailPort`. Local preview transport renders real React Email output. No raw secret logging.
- **PostHog:** implement behind `AnalyticsPort`, honor consent, avoid PII payloads, and use deterministic capture adapter in tests.
- **OTel + evlog:** correlate request ID, trace/span ID, actor ID when safe, route/procedure, duration, outcome, and structured error category. Redact secrets, tokens, password/reset contents, email bodies, and sensitive profile data.
- **R2:** port/metadata boundary and docs only in v0.1. Object metadata remains in Postgres when later enabled.
- **Jobs:** core may expose inline/outbox-friendly typed jobs. Celery/Flower descriptors remain disabled and broker choice is not preordained.

## 15. Configuration and environment

Use `.env.schema` as the public contract and `.env.example` with safe empty/example values. Validate environment at startup by runtime boundary. Never commit `.env`, secrets, generated certificates, production credentials, or provider tokens.

Required contract, adjusted to installed provider SDK names while preserving semantics:

```dotenv
# Application
APP_ENV=development
APP_URL=https://darkfactory.localhost
APP_NAME=DarkFactory

# Database
DATABASE_PROVIDER=planetscale
DATABASE_URL=

# Authentication
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=https://darkfactory.localhost

# AI
AI_PROVIDER=groq
GROQ_API_KEY=
GROQ_MODEL=

# Email
EMAIL_PROVIDER=resend
EMAIL_TRANSPORT=preview
RESEND_API_KEY=
EMAIL_FROM=DarkFactory <noreply@domain.test>

# Analytics
ANALYTICS_PROVIDER=posthog
POSTHOG_KEY=
POSTHOG_HOST=

# Telemetry
OTEL_ENABLED=true
OTEL_SERVICE_NAME=darkfactory-web
OTEL_EXPORTER_OTLP_ENDPOINT=

# Disabled capabilities
STORAGE_ENABLED=false
STORAGE_PROVIDER=r2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
DOCS_ENABLED=false
DOCS_PUBLIC=false
JOBS_ENABLED=false
JOBS_ENGINE=celery
FLOWER_ENABLED=false
UPTIME_KUMA_ENABLED=false
ERROR_TRACKING_ENABLED=false
ERROR_TRACKING_PROVIDER=glitchtip
ERROR_TRACKING_DSN=
MEMORI_ENABLED=false
```

Rules:

- Client-safe environment values are explicitly allowlisted; never spread server env into client code.
- `APP_ENV=production` forbids default seed password, preview-only assumptions, weak auth secrets, and development seed execution.
- `bun run doctor` reports present/missing/disabled without printing secret values.
- Capability enablement validates required environment before changing code/config.
- Provider selection occurs in a composition root, not scattered conditionals.

## 16. Local development and trusted HTTPS

The canonical, user-facing local application URL is:

```text
https://darkfactory.localhost
```

Use **portless** to own the stable named `.localhost` URL and route it to an automatically assigned implementation port. Raw ports must never appear in user-facing URLs, auth origins/callbacks, documentation, browser tests, or agent instructions.

Long-lived development services must run under **PM2** through portless. Provide scripts equivalent in behavior to:

```bash
portless trust
pm2 start "portless darkfactory bun run dev" --name "darkfactory-web-dev"
pm2 save
```

The repository scripts must hide process-manager details behind clear commands such as:

```bash
bun run dev:https
bun run dev:status
bun run dev:logs
bun run dev:stop
```

`bun run dev:https` must be idempotent: detect an existing healthy, current-version `darkfactory-web-dev` PM2 process instead of launching duplicates. Status/log/stop must address that exact stable identity.

Keep **mkcert** only as the custom/local certificate fallback when `portless trust` is unavailable or insufficient for the environment. Implement:

```bash
bun run certs:install
bun run certs:generate
```

Fallback generation is equivalent to:

```bash
mkcert -install
mkcert \
  -cert-file certs/localhost.pem \
  -key-file certs/localhost-key.pem \
  localhost \
  \"*.localhost\" \
  127.0.0.1 \
  ::1
```

Requirements:

- Configure `APP_URL` and `BETTER_AUTH_URL` as `https://darkfactory.localhost`.
- Start every long-lived local web service through PM2 + portless; do not use a fixed common-port allocation scheme.
- Use separate stable portless service names for any future optional app rather than reserving numbered ports.
- Treat `portless trust` as the primary local trust path. Wire mkcert-generated cert/key into Vite/vinext only on the documented fallback path.
- Ignore `certs/*.pem`, `certs/*.key`, the local CA, and all private material. Commit `certs/README.md` and scripts, not generated keys.
- `bun run doctor` independently verifies Bun 1.3.14 and Node >=22.13, plus pnpm 11.16.0, Portless, PM2, the named route, process health, HTTPS trust, and auth-origin consistency.
- Verify secure cookies, browser secure context, auth redirects, no certificate warning, and no user-facing raw-port URL.
- Provide local Postgres through the repository's minimal supported approach, with health check and isolated test database. Do not add unrelated service containers.

## 17. Root scripts, Turborepo, hooks, and CI

Expose these root commands. Each must do real work or clearly report that a disabled optional capability is not applicable; no success-only placeholders.

```text
bun run dev
bun run dev:https
bun run typecheck
bun run build
bun run lint
bun run format
bun run format:check
bun run test
bun run test:unit
bun run test:integration
bun run test:contract
bun run test:e2e
bun run test:a11y
bun run graph:build
bun run graph:update
bun run graph:check
bun run graph:verify
bun run docs:generate
bun run docs:check
bun run openapi:generate
bun run openapi:check
bun run db:generate
bun run db:migrate
bun run db:seed
bun run db:reset
bun run certs:install
bun run certs:generate
bun run capability:add
bun run generate:feature <name>
bun run doctor
bun run verify
bun run ci
```

`bun run verify` is the complete local lifecycle and `bun run ci` invokes the same composition. GitHub Actions installs the frozen pnpm workspace, then executes Bun/Turbo-orchestrated lanes concurrently. Vitest alone runs through the package-local `corepack pnpm exec` path under Node because Bun 1.3.14 misloads Vitest's Vite `zod` dependency and lacks the V8 `node:inspector` coverage APIs.

Keep `turbo.json` simple:

- `dev`: persistent, uncached.
- `build`: depends on upstream builds; cache actual vinext/Vite outputs.
- `typecheck`: depends on upstream typechecks where applicable.
- `lint` and `format:check`: deterministic.
- `test:unit`/`test:contract`: depend only on needed builds.
- integration/e2e own explicit database/app service lifecycles rather than hidden Turbo side effects.
- graph/docs/OpenAPI staleness checks run after generation inputs are stable.

### Husky

- `pre-commit`: operate on the focused staged scope; run the authoritative staged formatting/lint path plus the smallest relevant type/unit checks. It may modify staged files only through an explicit, documented flow.
- `pre-push`: run the broad deterministic core lane. Integration, Graphify, and browser/a11y remain mandatory isolated CI lanes rather than local push blockers. Do not bypass either the local hook or any CI lane for normal work.
- Hooks call package scripts; they do not duplicate command logic.
- CI remains authoritative and reruns clean-room checks.

### GitHub Actions

Use least-privilege permissions and pinned major actions. CI must:

1. Check out code.
2. Install the declared Node/pnpm versions and use the sole pnpm lockfile with frozen install.
3. Restore safe pnpm/Turbo caches.
4. Start isolated Postgres.
5. Validate environment using CI-safe values.
6. Apply migrations and seed only the isolated test environment.
7. Run format check, lint, typecheck, build, unit, contract, deterministic coverage generation/byte-staleness, integration, OpenAPI staleness, Graphify staleness/policy, docs checks, and Playwright e2e/a11y in deterministic lane-local order, with the five lanes executing concurrently.
8. Preserve Playwright traces/screenshots/videos only after the repository scanner completes successfully; never upload unverified, contaminated, or indeterminate failure material.
9. Never print secrets.
10. Make deployment a separately protected job dependent on all green verification; do not deploy from untrusted pull-request secrets.

## 18. Deterministic SDLC loop

Every change naturally flows through:

```text
develop
↓
typecheck
↓
compile/build
↓
unit tests
↓
contract tests
↓
integration tests
↓
e2e + accessibility/browser verification
↓
lint
↓
format check
↓
OpenAPI generation/check
↓
Graphify update/check
↓
documentation update/check
↓
focused commit
↓
pre-push validation
↓
push
↓
GitHub CI follow-through
↓
deployment only after green
```

The order may be optimized for fast failure locally, but no gate is omitted from the full `verify`/`ci` contract. Run focused gates during development and the full affected-phase gate before committing. **Never accumulate the whole build into one unreviewable final commit. Never push red work just to let CI diagnose it.**

After a push:

```text
inspect checks
→ wait for terminal state
→ classify every failure
→ reproduce repository-owned failures locally
→ fix the root cause
→ rerun the smallest failing gate
→ rerun the phase/full gate
→ commit the focused fix
→ push
→ repeat until green
```

If a failure is external/flaky/infrastructure-owned, capture the check URL, logs, rerun evidence, owner, and stop condition. Do not label it green.

## 19. Graphify and agent constitution

Graphify is a core developer-context capability. Commit its configuration and generation/check scripts. Commit generated graph artifacts only if their size/stability policy is documented and CI can prove freshness; otherwise generate them locally/CI and commit reproducible metadata.

Required commands:

```bash
bun run graph:build
bun run graph:update
bun run graph:check
bun run graph:verify
```

`AGENTS.md` is the repository constitution and must instruct agents to:

- Query Graphify before broad repository exploration.
- Generate a missing graph rather than exploring blindly.
- Update Graphify after adding a feature, moving public symbols, changing contracts, changing database relationships, or materially changing architecture.
- Never duplicate code; locate and reuse existing patterns.
- Use feature/capability generators rather than hand-creating a competing convention.
- Prefer Postgres core/extensions and never introduce infrastructure casually.
- Keep functions/components composable and split files only at meaningful boundaries.
- Define contracts before implementations.
- Never bypass oRPC for application APIs.
- Never bypass Drizzle for persistent relational access except documented/tested Postgres-specific SQL inside `packages/db`.
- Use Effect, XState, and Zustand only in their intended roles.
- Update documentation and ADRs after architecture changes.
- Generate/check OpenAPI and docs when their sources change.
- Investigate failing CI before asking the user to diagnose it.
- Keep commits focused and push only after green gates.
- Continually consult `https://ui.shadcn.com/blocks` when implementing or materially revising authenticated portal pages.
- Keep public design direction informed by `https://www.squarespace.com/` while producing original domain-neutral DarkFactory work.
- Use sans-serif typography everywhere.

Graphify and Memori are different: Graphify maps repository code/docs and is enabled; Memori is a disabled future Postgres-backed data-context capability. Do not install Memori in v0.1.

## 20. TDD and test matrix

Tests defend observable contracts and plausible failure modes, not source text or implementation trivia. Use deterministic clocks/IDs/adapters where needed. No live production provider calls in the default suite.

| Layer | Required coverage |
| --- | --- |
| Unit | Pure validators, theme resolution, config/manifest parsing, feature service policies, authorization predicates, generator planning/naming, error mapping, redaction, state-machine transitions. |
| Contract | oRPC input/output/error shapes, auth context/role requirements, OpenAPI generation, adapter conformance, client/server inference, backward-incompatible snapshot review. |
| Database integration | Empty migration, constraints/indexes/FKs, repositories, transaction rollback, owner scoping, audit/outbox atomicity, idempotent seeds, production seed rejection, reset isolation. |
| Auth integration | Sign-up provisioning, login/logout/session, protected routes, admin rejection/acceptance, reset preview/token policy, secure cookies, account-enumeration policy. |
| Feature integration | CRUD/status lifecycle, validation, unauthorized access, 404 policy, analytics/log event recording without PII, pagination/filtering. |
| Provider integration | PostHog adapter mapping with mocked transport, OTel spans, evlog correlation/redaction, React Email rendering, preview transport, Groq adapter error/timeout mapping without a live key. |
| Component | Forms, field errors, pending/success/failure, theme picker, navigation, data tables/cards, empty/error states, keyboard behavior. |
| E2E | Public navigation, sign-up, all three seeded logins, logout, route protection, member feature flow, profile/address/preferences persistence, theme persistence/no flash, admin users authorization, password reset preview, mobile portal navigation. |
| Accessibility | Automated axe-style checks plus keyboard/focus/label/dialog/menu/manual spot checks on representative public, auth, dashboard, form, table, and error pages. |
| Visual/responsive | Screenshots at mobile/tablet/desktop/wide desktop in light and dark; sample all ten schemes without overflow/contrast regressions. |
| Security smoke | CSRF/origin/cookie behavior, injection-safe query paths, XSS-safe user content, authorization at server procedures, headers, secret/PII redaction, production seed guard. |
| Build/runtime | Civet compilation with the Civet Vite plugin before vinext, Next `pageExtensions` discovery of `civet`, Vite/vinext build, official `@vinext/cloudflare` deployer output, no server-only modules in client, route smoke at `https://darkfactory.localhost`; Playwright harness/config/spec files remain TypeScript. |
| Generator | New feature generated in fixture, compiles/tests, updates graph/contracts/docs, duplicate name fails without partial writes, rollback/plan behavior. |

Coverage percentage alone is not the goal. Every core boundary, invariant, state transition, precedence rule, and real error path needs a test. Quarantine nothing silently.

## 21. Phased multi-agent execution plan

If the harness supports agents/worktrees, use this dependency graph and file ownership. Agents must not edit outside their assigned areas without coordinating ownership. Integrate in dependency order and resolve conflicts at the source, not by dropping changes.

### Phase 0 — Reconnaissance and executable specification

**Owner:** lead architect only  
**Files:** `docs/specs/DARKFACTORY_SPEC.md` and plan/checkpoint artifacts only; no broad implementation  
**Depends on:** none

Actions:

1. Inspect repo state, instruction files, package manifests, branch, CI, and existing work.
2. Extract every decision, convention, philosophy, constraint, tradeoff, architecture rule, classified requirement, superseded choice, and acceptance criterion into `docs/specs/DARKFACTORY_SPEC.md`.
3. Convert the specification into a requirement checklist keyed `DF-001...` with Core/Capability/Convention/Implementation labels.
4. Self-review the specification against this prompt; resolve contradictions conservatively by chronology and the superseded table. Do not pause for redundant approval in this one-shot run.
5. Record unresolved tool-version compatibility decisions using current installed/official docs; do not reopen settled architecture.
6. Establish exclusive ownership for later agents.

Commands/observations:

```bash
# Use repository/harness-native status and inspection tools.
pnpm --version
node --version
```

Acceptance:

- Every section here maps to an implementation phase and verification item.
- `docs/specs/DARKFACTORY_SPEC.md` is complete, internally consistent, and usable without this execution prompt.
- Superseded choices are explicitly excluded.
- No implementation file was destroyed or silently overwritten.

### Phase 1 — Workspace, toolchain, configuration, and CI skeleton

**Owner A:** root workspace/tooling  
**Files:** root manifests/config, `scripts/` foundations, `.husky/`, `.github/workflows/ci.yml`, config package  
**Depends on:** Phase 0

Deliver pnpm/Turbo, Civet build integration, Vite/vinext app shell, shared version policy, environment/capability validation, scripts, hooks, and CI skeleton. Do not implement providers or UI here.

Green gate:

```bash
pnpm install --frozen-lockfile
bun run typecheck
bun run build
bun run lint
bun run format:check
bun run doctor
```

Acceptance:

- Only pnpm lockfile exists.
- A minimal app compiles through Civet → Vite/vinext.
- Bun 1.3.14, Node >=22.13, and pnpm 11.16.0 are enforced; Next `pageExtensions` includes `civet`; the Civet Vite plugin runs before vinext.
- The web deploy path resolves through official `@vinext/cloudflare`; Alchemy owns only ancillary supported resources.
- Root commands dispatch correctly through Turbo.
- CI invokes the same scripts as local `bun run ci`.
- Disabled capabilities are truthful and dependencies are absent.

Commit/push only after this gate is green; follow CI to green.

### Phase 2 — Database, contracts, auth, and core ports

Run parallel only where file ownership is disjoint, then integrate in this order.

**Owner B — database:** `packages/db`, local Postgres infra, database scripts/tests.  
**Owner C — contracts/auth:** `packages/api`, `packages/auth`, auth route handlers/tests. Depends on B's exported schema/repository contract.  
**Owner D — observability/providers:** `packages/analytics`, `packages/observability`, `packages/email`, `packages/ai`, ports/adapters/tests. Independent of C after shared config types stabilize.

Green gates:

```bash
bun run db:reset
bun run db:migrate
bun run db:seed
bun run test:unit
bun run test:contract
bun run test:integration
bun run openapi:generate
bun run openapi:check
bun run typecheck
bun run build
```

Acceptance:

- Empty database migrates.
- Seeds are idempotent and production guarded.
- All three identities can authenticate through integration tests.
- Member/admin authorization is server enforced.
- oRPC contract and OpenAPI are generated and consumable.
- Analytics/OTel/evlog/email/AI adapters obey ports, redact data, and have deterministic tests.

Make focused commits per integrated owner after its dependent green gate; push and follow CI each time.

### Phase 3 — Shared UI, themes, public site, and portal shell

**Owner E — design system/themes:** `packages/ui`, app global styles/theme provider/picker.  
**Owner F — marketing:** `apps/web/app/(marketing)`, marketing components/assets. Depends on E tokens.  
**Owner G — portal/auth UI:** auth pages, portal layout/dashboard/account shell. Depends on E and Phase 2 auth APIs.

Before implementation, inspect the references:

```text
https://www.squarespace.com/
https://ui.shadcn.com/blocks
```

Build original UI; do not copy. Use only sans-serif typography.

Green gates:

```bash
bun run typecheck
bun run build
bun run test:unit
bun run test:e2e -- --grep "public|auth|portal|theme"
bun run test:a11y
```

Browser acceptance:

- Capture public and portal screenshots at mobile, tablet, desktop, wide desktop.
- Verify public route inventory, nav, focus, no overflow, original content, and placeholder asset semantics.
- Verify portal sidebar/header, sign-in/out, role-aware navigation, forms, empty/error/loading states.
- Verify light/dark/system and ten schemes persist with no hydration flash.

Commit by coherent surface only after green; push and follow CI.

### Phase 4 — Feature stub and generators

**Owner H:** `apps/web/src/features/feature-stub`, feature routes, feature contracts/procedures/repository additions, feature generator and tests  
**Depends on:** Phases 2 and 3

Use contract-first TDD. Implement the full vertical slice and safe generator.

Green gate:

```bash
bun run test:unit -- --runInBand
bun run test:contract
bun run test:integration
bun run test:e2e -- --grep "feature item"
bun run generate:feature verification-fixture
bun run graph:update
bun run graph:check
bun run typecheck
bun run build
```

Run generator verification in a disposable fixture, not by leaving `verification-fixture` in the product tree.

Acceptance:

- Owner scoping and admin policy are proven.
- Mutation + audit/outbox are atomic.
- UI exposes real pending/empty/error/success states.
- Analytics/logging/OTel evidence is observable and redacted.
- Generator plans, generates, verifies, updates graph/contracts/docs, and refuses overwrite without partial damage.
- Feature stub is domain-neutral and removable by documented steps.

Commit/push only after green; follow CI.

### Phase 5 — Local HTTPS, Graphify, capability workflow, docs

**Owner I — HTTPS/dev:** `certs/README.md`, certificate scripts, Vite HTTPS config, doctor checks.  
**Owner J — Graphify/docs/capabilities:** Graphify config/scripts, capability descriptors/generator, `AGENTS.md`, architecture/conventions/ADRs/capability docs. Must not install disabled services.  
**Depends on:** stable architecture from Phases 1–4

Green gates:

```bash
bun run certs:generate
bun run doctor
bun run graph:build
bun run graph:check
bun run docs:generate
bun run docs:check
bun run openapi:check
bun run capability:add --help
bun run dev:https
```

Browser/smoke acceptance:

- Open canonical HTTPS URL without a certificate warning.
- Sign in through HTTPS and observe secure session behavior.
- Verify Graphify can answer paths between a route, oRPC procedure, service, repository, schema, and adapter.
- Verify manifest/docs say optional services are disabled and not installed.
- Verify `AGENTS.md` continually references `https://ui.shadcn.com/blocks` and includes the complete constitution.

Commit/push only after green; follow CI.

### Phase 6 — Full-system hardening and release evidence

**Owner:** lead integrator; focused reviewer agents may inspect security, architecture, UI, and tests but do not compete for files  
**Depends on:** all prior phases

Commands:

```bash
bun run db:reset
bun run db:migrate
bun run db:seed
bun run verify
bun run ci
```

Then exercise the built app through portless-managed `https://darkfactory.localhost` in a real browser, including all routes and seeded roles. Validate the official `@vinext/cloudflare` build/deploy preview path and the separate Alchemy ancillary-resource plan without leaking or requiring production secrets; do not invent an Alchemy vinext adapter.

Acceptance:

- Full matrix is green.
- No console errors, failed network requests, certificate warnings, hydration errors, or accessibility blockers in exercised paths.
- All generated files are current.
- `bun run ci` matches GitHub Actions.
- Latest pushed commit has green CI.
- Evidence bundle and definition-of-done checklist are complete.

Only then create/tag the v0.1 release candidate according to repository policy. Do not deploy to production or make a public release without the required repository/user authorization.

## 22. Verification evidence

Produce an inspectable implementation report containing:

- Final commit SHA and branch.
- Requirement checklist with Core/Capability/Convention/Implementation classification and file/test evidence.
- Installed dependency summary proving disabled capability SDKs/services are absent.
- Final repository tree and package dependency graph.
- Migration list and successful empty-database migration/seed output.
- Seeded account verification with secrets redacted; the documented development password may appear only in development docs.
- OpenAPI artifact path and staleness check result.
- Graphify artifact/config path, graph freshness result, and example queries.
- Exact commands and terminal results for every gate.
- Playwright report plus failure artifacts if any were fixed.
- Screenshots of representative public and portal routes across responsive widths, light/dark, and representative schemes; record the complete ten-scheme automated matrix.
- HTTPS URL, SAN/trust verification, and secure-cookie observation without private key output.
- Example correlated OTel/evlog/analytics events with identifiers/PII redacted.
- CI run URL and terminal green conclusion.
- Any unverified external deployment prerequisite explicitly marked; never turn it into a fabricated success claim.

## 23. Definition of done

DarkFactory v0.1 is done only when all statements are true:

### Architecture

- [ ] DarkFactory is named consistently and remains domain-neutral.
- [ ] Every requirement is classified.
- [ ] Superseded SST, Redis-default, RabbitMQ, leads, serif, dark-only, and payments choices are absent.
- [ ] Core/package dependency direction and provider ports are enforced.
- [ ] Civet is the authored app language except documented tooling/generated boundaries.
- [ ] Postgres/Drizzle and contract-first oRPC/OpenAPI are the only core persistence/API path.

### Behavior

- [ ] Public and portal route inventories work end to end.
- [ ] Better Auth flows work over local HTTPS.
- [ ] Admin, Alice, and Bob seeds work and contain profiles, addresses, avatars, preferences, and roles without reduced-motion/privacy-level samples.
- [ ] FeatureItem vertical slice works with authorization, persistence, events, telemetry, analytics, and error states.
- [ ] Theme mode and all ten color schemes persist correctly without flash.
- [ ] All typography is sans serif.

### Developer experience

- [ ] Node >=22.13, pnpm 11, Turborepo, Vite, vinext, and Civet clean install/build are reproducible; `pageExtensions` includes `civet`, Civet's Vite plugin precedes vinext, and TypeScript remains at config/generated/Playwright boundaries.
- [ ] The green-path web deploy uses official `@vinext/cloudflare`; Alchemy is limited to ancillary supported Cloudflare resources.
- [ ] Root scripts, doctor, hooks, CI, migrations, generators, Graphify, OpenAPI, and docs checks are real and documented.
- [ ] Portless exposes `https://darkfactory.localhost`; PM2 owns long-lived dev services through portless; no fixed raw-port URL is user-facing; mkcert fallback keys are ignored.
- [ ] AGENTS constitution includes the continual `https://ui.shadcn.com/blocks` reference.
- [ ] Capability manifest is accurate; optional services are not installed.

### Quality and delivery

- [ ] Unit, contract, integration, e2e, accessibility, security smoke, build/runtime, and generator tests are green.
- [ ] Browser verification found no unresolved console/network/hydration/certificate/accessibility blocker.
- [ ] No secrets, private keys, generated alternate lockfiles, debug artifacts, placeholders in core behavior, or fake fallbacks are committed.
- [ ] Changes were committed in focused increments only after green gates.
- [ ] Every pushed increment's repository-owned CI failures were followed through; final CI is green.
- [ ] Evidence is inspectable and claims match observations.

## 24. Post-build Shannon and continuing SDLC TODOs

Do **not** interrupt the core build to install unrelated security automation. After the complete v0.1 system is green and smoke-tested, add durable, owned, reviewable TODO entries for the following post-build work. These are follow-up gates, not permission to call v0.1 complete with core work unfinished.

### Shannon security exercise TODO

Official reference: `https://github.com/KeygraphHQ/shannon`

Create a post-build TODO with:

- Objective: run **Shannon** as an authorized autonomous white-box, source-guided penetration test with live exploitation against an isolated DarkFactory staging/local-HTTPS target. Give it the DarkFactory source it needs to trace reachable vulnerabilities; do not misclassify it as a black-box scanner.
- Prerequisite: read `https://github.com/KeygraphHQ/shannon` and confirm the current official installation, run instructions, supported environment, source-access expectations, and safety controls before adding anything to the repository; do not invent a command or pin from memory.
- Scope: only the DarkFactory-owned source repository and isolated test target with seeded test accounts; never production data, production infrastructure, or third-party systems.
- Inputs: repository/source access, target URL, allowed routes, seeded admin/member credentials supplied securely, explicit authorization/scope, rate/concurrency limits, exploitation boundaries, and stop conditions.
- Safety: isolated database, disposable seed data, no real Resend/Groq/PostHog production credentials, no destructive external integrations, and preserved logs/artifacts.
- Evidence: tool version/commit, configuration, start/end time, findings, reproduction steps, severity, false-positive disposition, and report location.
- Remediation loop: fix P0/P1 and exploitable auth/authorization/secret/injection findings before release; add regression tests; rerun focused and full security checks; push only after normal green gates; follow CI to green; rerun Shannon to prove closure where safe.
- Ownership and stop condition: named owner; complete only when findings are triaged, accepted risk is explicitly documented, fixes have regression coverage, and the authorized rerun is recorded.

Do not mark Shannon complete merely because it launched. Do not weaken controls to make the scanner pass.

### Continuing SDLC-loop TODOs

Use `https://www.youtube.com/watch?v=VQy50fuxI34` as the explicit source for the continuing agentic SDLC/software-factory TODO. Extract its actionable loop into repository-specific automation and agent instructions; do not merely link the video or copy claims without validating them against DarkFactory's tools and invariants.

Create durable TODOs with owner, trigger, command, evidence, and stop condition for:

1. A continuing agentic software-factory loop derived from `https://www.youtube.com/watch?v=VQy50fuxI34`, translated into concrete DarkFactory triggers, agent ownership, executable scripts, evidence, escalation rules, and stop conditions.
2. Repeat the standard loop for every change: focused TDD → affected gates → Graphify/OpenAPI/docs freshness → focused commit → pre-push → push → CI follow-through.
3. Periodic dependency/provider compatibility review, especially vinext/Vite/Cloudflare/Alchemy/Civet, without automatic architecture churn.
4. Periodic database extension/provider capability review before enabling any Postgres extension.
5. Authorized security review and Shannon rerun after material auth/API/storage/admin/deployment changes.
6. Accessibility and responsive browser regression after material UI changes.
7. Seed and production-guard verification before releases.
8. Optional capability activation only through a decision record, manifest change, environment validation, working adapter, tests, docs, and measurable justification.
9. Graphify refresh after features, symbols, contracts, relationships, or architecture change.
10. CI/deployment watcher with an explicit green/no-checks/blocker stop condition after each push to an open PR.

A TODO is not evidence. Include it only after v0.1 is demonstrably working, and never use it to defer a requirement in the definition of done.

## Final execution instruction

Begin with reconnaissance and the classified checklist. Then implement in dependency order, using parallel agents only with exclusive ownership. At each phase, run the observable acceptance commands and browser scenarios, commit a focused green increment, push it, and follow GitHub CI until green. Continue through the full-system gate, evidence report, definition-of-done audit, and post-build TODO creation. Stop only when DarkFactory v0.1 is complete end to end or when a genuinely external prerequisite is proven unreachable; if blocked, finish every independent requirement and report the exact missing prerequisite, attempted evidence, and safe next action.
