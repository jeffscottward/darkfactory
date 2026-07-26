# DarkFactory Architecture

DarkFactory is a reusable, domain-neutral foundation for public web experiences and authenticated applications. Its architecture favors explicit contracts, small composable units, PostgreSQL-backed durability, replaceable provider adapters, and deterministic workflows that humans and AI agents can understand.

## Decision taxonomy

Every design statement belongs to exactly one class:

| Class | Meaning | Change rule | Examples |
| --- | --- | --- | --- |
| **Core** | Required in every DarkFactory project | Change through an explicit architecture decision | Bun script runtime, pnpm/Turborepo workspace, Civet-first source, Vite/vinext, PostgreSQL/Drizzle, Better Auth, oRPC, Tailwind/shadcn, evlog/OpenTelemetry/PostHog adapter, Graphify, lifecycle gates |
| **Capability** | Optional, enabled intentionally, removable without rewriting the domain | Declare a manifest, port, adapter, config, install/remove path, verification, and docs | storage, AI provider, email delivery, jobs, error tracking, memory graph, database extensions |
| **Convention** | Rule every contributor and agent follows | Update `AGENTS.md` and `CONVENTIONS.md` with the reason | contract-first work, feature-vertical ownership, test-first behavior changes, provider isolation |
| **Implementation** | Current replaceable realization | May change while its contract remains stable | Cloudflare Workers, PostHog adapter, Groq adapter, Resend adapter, preview email adapter |

This distinction prevents a vendor, optional service, or current file layout from becoming accidental architecture.

## Core topology

```text
Bun scripts + pnpm workspace + Turborepo task graph
│
├── apps/web
│   ├── src/app                    public, auth, portal, account, admin, and API routes
│   ├── src/features               generated feature navigation registry
│   └── Vite/vinext/Cloudflare     framework and deployment boundaries
│
├── packages
│   ├── api                        oRPC contracts, schemas, handlers, clients, OpenAPI
│   ├── auth                       Better Auth server/client, auth policy, DB sign-out
│   ├── db                         Drizzle schema, repositories, migrations, seeds
│   ├── config                     environment parsing and capability/database profiles
│   ├── ui                         shadcn primitives, tokens, themes, compositions
│   ├── state                      shared XState flows and client state boundaries
│   ├── shared                     deliberately small cross-package utilities
│   ├── analytics                  analytics port and PostHog adapter
│   ├── observability              evlog, redaction, fanout, OpenTelemetry
│   ├── email / ai                 provider-neutral ports and selected adapters
│   ├── jobs / storage             optional capability ports and local/test adapters
│   └── testkit                    cross-package PostgreSQL and test infrastructure
│
├── scripts                        lifecycle, doctor, graph, docs, database, and E2E tools
├── tests                          contract, integration, and browser lifecycle coverage
├── docs / design-system           architecture, decisions, evidence, and UI policy
└── infra                          local PostgreSQL container infrastructure
```

This is the implemented repository topology, not a package wish list. Current page UI and orchestration live under `apps/web/src/app`, `apps/web/src/components`, and `apps/web/src/lib`; `apps/web/src/features` is presently a generated navigation registry rather than the home of feature implementations. `pnpm-workspace.yaml` includes only `apps/*` and `packages/*`; the root coordinates them without publishing an application API. Create another package only when it has a real contract and owner. Empty future-capability packages and speculative infrastructure are prohibited.

## Dependency direction and feature boundaries

```text
framework / routes / UI
           │
           ▼
application commands, queries, workflows
           │
           ▼
       domain rules
           │
           ▼
    application ports ◄──── infrastructure adapters
```

Dependencies point inward. Domain code knows no framework, ORM, transport, deployment platform, or provider. Application code coordinates domain behavior through small ports. Infrastructure adapters know Drizzle and external SDKs. Routes translate transport concerns and remain thin.

A feature vertical owns its feature-specific UI, client state, contract client usage, application orchestration, local server code, events, and tests. Shared packages own cross-feature protocols and infrastructure, not miscellaneous convenience code. Features communicate through public contracts/events rather than internal deep imports.

## Request and data flow

```text
browser or external client
  → Vite/vinext route
  → oRPC contract validation and authentication context
  → application command/query
  → domain rule
  → application port
  → Drizzle store/adapter
  → PostgreSQL
  → domain/application event
  → evlog structured event
      ├→ analytics port → PostHog adapter
      └→ OpenTelemetry → configured telemetry backend
  → typed oRPC result/error
```

The contract is the API source of truth. OpenAPI, clients, and internal API documentation derive from it. Direct feature-to-database, feature-to-provider, and parallel ad hoc API paths are architectural violations.

## Current runtime assembly

`apps/web` is the composition root. The Better Auth catch-all route builds a request-scoped database connection, selects the configured email transport, creates the Better Auth instance, delegates to the hardened auth handler, and closes the connection. The strict sign-out endpoint revokes the current database session before expiring the cookie. Portal, account, and administration routes consume authenticated server state rather than reaching into the auth adapter directly.

The oRPC catch-all route parses the validated server environment, rejects unsafe cross-origin mutations, opens a request-scoped Drizzle connection, creates repositories and authorization guards, selects email and analytics adapters from capability truth, and passes that context to the oRPC handler. Contact submission adds bounded payload and PostgreSQL-backed throttle checks at this boundary. Every request closes its database connection in `finally`; background delivery work is scheduled through the Cloudflare `waitUntil` boundary.

The public API shape is owned by `packages/api`; `apps/web` owns transport composition only. `packages/auth` owns Better Auth policy and session behavior, `packages/db` owns schema/repositories/migrations, and `packages/config` owns environment and capability interpretation. OpenAPI is generated from the same oRPC contracts. This separation is the implemented route → contract → service → repository → schema/adapter path.

Authentication and application data share portable PostgreSQL durability but retain separate ownership. Better Auth owns its user, account, session, and verification records. DarkFactory repositories own profile, address, preferences, feature, contact, and administration data. Role and status checks are enforced at the auth/oRPC boundary and again where application policy requires them; browser-visible state is never accepted as authorization proof.

## Generic feature stub

`feature-stub` is a removable, generator-ready example of one complete vertical slice; it must not imply a business domain. A neutral `FeatureItem` may contain `id`, `name`, `description`, `status`, `metadata`, `ownerId`, and timestamps.

```text
feature UI
  → query cache or appropriate local state
  → oRPC feature contract
  → feature service
  → feature repository port
  → Drizzle adapter
  → PostgreSQL
  → feature event
  → analytics + structured log + trace
```

The stub demonstrates validation, authentication/authorization, create/read/update behavior, typed errors, persistence, events, observability, and unit/integration/e2e coverage. A feature generator clones and renames the slice, route registration, database objects, tests, exports, and graph entries. It must not leave `FeatureItem` or `feature-stub` residue in the generated feature.

## PostgreSQL-first architecture

PostgreSQL is the default home for durable and data-related behavior: relational data, JSONB, full-text/fuzzy search, vectors, geospatial data, time series, queues, locks, scheduling, realtime notifications, outbox events, and analytics when a core feature or proven extension meets the requirement.

Use this decision record for every data capability:

1. Can PostgreSQL core satisfy the measured requirement?
2. Can a mature PostgreSQL extension or established pattern satisfy it without unacceptable operational risk?
3. If not, document the gap, load/latency/reliability requirement, ownership cost, migration and failure behavior, then introduce an external service behind a port.

PostgreSQL is provider-neutral. A standard `DATABASE_URL` and Drizzle boundary must remain portable across managed or self-hosted PostgreSQL. Cloudflare Hyperdrive may supply connection pooling/caching without becoming a domain dependency. Redis and RabbitMQ are neither defaults nor predefined fallbacks.

## Ports and adapters

Create ports only at real external boundaries; do not build a universal abstraction framework.

| Boundary | Port responsibility | Current or likely adapter |
| --- | --- | --- |
| Persistence | feature repositories and transactions | Drizzle + PostgreSQL |
| Authentication | sessions and identity operations | Better Auth |
| Analytics | typed product events | PostHog adapter |
| Telemetry | traces, metrics, technical logs | OpenTelemetry |
| Application events | semantic structured event emission | evlog |
| AI inference | model-neutral request/result contract | Groq adapter when configured |
| Email | render/send contract | React Email + Resend; safe local preview without credentials |
| Storage | object operations | R2/S3-compatible adapter when enabled |
| Jobs | enqueue/status/cancel contract | PostgreSQL-first implementation; Celery/Flower only as an enabled capability |
| Memory/context | provenance-aware context graph | PostgreSQL-backed Memori capability when enabled |

Provider configuration belongs in infrastructure. Missing optional credentials must disable the capability or select an explicit safe local adapter, never trigger a fake production fallback.

## State ownership

- PostgreSQL owns durable state, preferences, lifecycle history, and transitions.
- The URL owns navigable/filter state.
- Query caching owns server data on the client.
- XState models explicit processes; PostgreSQL remains their durable record.
- Zustand coordinates ephemeral local UI state only.
- Effect is reserved for failure/resource-heavy infrastructure workflows, not ordinary pure functions.
- Cookies may mirror authenticated theme preference for first render; PostgreSQL remains authoritative. Anonymous theme preference may be local.

## Repository lifecycle

The root scripts are the supported operator surface:

- `bun run dev` runs the plain application development task. `bun run dev:https` idempotently inspects PM2 and Portless before starting `portless darkfactory bun run dev` as the stable `darkfactory-web-dev` process; status, logs, stop, and trust commands address the same identity and canonical `https://darkfactory.localhost` URL.
- `bun run doctor` independently probes installed Bun 1.3.14 and Node >=22.13 plus the required workstation/runtime prerequisites without printing environment values or starting infrastructure.
- `bun run typecheck`, `bun run build`, focused tests, lint, formatting, generated-schema checks, docs checks, measured coverage, and Graphify checks compose the lifecycle. `bun run verify` remains complete; the coverage script is the explicit Node exception because Bun lacks the `node:inspector` APIs used by Vitest V8 coverage.
- Database scripts own schema generation, migration, seed/reset, and isolated test-PostgreSQL lifecycle. Deploy scripts own only the official vinext/Cloudflare path.

Graphify output is generated context rather than an authored runtime dependency. Repository Graphify commands must use the tracked secure wrapper, and graph evidence is valid only after the current source tree passes build/check/verify.

## Deployment target

The authored web application is Civet compiled through Vite/vinext and deployed to Cloudflare Workers. The web deployment uses the official `@vinext/cloudflare` adapter exclusively.

Alchemy 0.93.12 is only a source-reviewed compatibility baseline for explicitly enabled, supported ancillary Cloudflare resources. No ancillary resource is currently enabled, so DarkFactory has no Alchemy dependency, `alchemy.run.ts`, or Alchemy deployment step. Do not put the vinext web application in Alchemy or add an empty program: in the reviewed baseline, `finalize()` can reconcile and delete resources persisted in a reused stage when they are absent from the current program. Re-review the then-current release before enabling a real ancillary resource. Alchemy here is infrastructure tooling, not a blockchain API dependency. pnpm owns dependency installation and the lockfile; Turborepo owns the repository task graph.

Canonical local development uses `https://darkfactory.localhost` through portless, with PM2 owning the stable `darkfactory-web-dev` process. Portless trust is primary for secure cookies, authentication callbacks, secure-context APIs, and production-like assumptions. mkcert installation and certificate generation are fallback-only; private keys remain local and ignored.

GitHub Actions runs the same five verification lanes composed by `bun run ci`, but executes them concurrently with `fail-fast: false` so one environment-heavy lane cannot hide another lane's result. pnpm remains the package/workspace/lockfile owner; CI retains Node, Corepack, and the frozen pnpm install before using Bun-backed scripts. Current CI verifies builds, tests, contracts, coverage non-regression, Graphify freshness, browser journeys, and accessibility; it performs neither a deployment dry run nor a deployment.

## Baseline observability

The application emits semantic events once:

```text
evlog event
  ├→ analytics port → PostHog
  ├→ structured application logging
  └→ OpenTelemetry context/traces/metrics/logs → configured backend
```

Analytics answers product-usage questions; telemetry explains technical behavior. Error-tracking backends are optional consumers/adapters, not imports scattered through application code.

## Superseded decisions

The following earlier options are not the DarkFactory baseline:

- Traditional Next.js/OpenNext scaffolding and TanStack Start/Convex were superseded by **Vite/vinext on Cloudflare**.
- Better-T-Stack may inform scaffolding, but DarkFactory is not coupled to it and vinext is not treated as a Better-T-Stack option.
- Bun 1.3.14 is the **primary script and TypeScript runtime**; pnpm 11.16.0 remains the **only package manager, workspace resolver, and lockfile owner**, while Node >=22.13 remains a measured compatibility runtime and Cloudflare Workers remains production.
- A flat single-app layout was superseded by **pnpm workspaces with Turborepo at the root**, allowing additional apps without forcing them initially.
- tRPC was superseded by **contract-first oRPC** for typed errors, OpenAPI, and non-TypeScript consumers.
- Redis and RabbitMQ defaults, including speculative fallback language, were superseded by the **PostgreSQL-first decision order**.
- SST was explicitly removed. Official `@vinext/cloudflare` owns web deployment. Per [ADR 0001](docs/adr/0001-vinext-alchemy-boundary.md), Alchemy 0.93.12 is only a compatibility baseline for supported ancillary Cloudflare resources; none is enabled, so no Alchemy dependency, program, or configuration is present.
- Celery, Flower, Mintlify, Uptime Kuma, GlitchTip, Memori, storage, and specialized PostgreSQL extensions remain opt-in capabilities, not preinstalled infrastructure.
- Dark-only styling, serif typography, and purple/cyan glow-heavy “AI” styling are rejected. Public and portal references inspire patterns but do not define a domain or authorize copying.
