# DarkFactory Architecture

DarkFactory is a reusable, domain-neutral foundation for public web experiences and authenticated applications. Its architecture favors explicit contracts, small composable units, PostgreSQL-backed durability, replaceable provider adapters, and deterministic workflows that humans and AI agents can understand.

## Decision taxonomy

Every design statement belongs to exactly one class:

| Class | Meaning | Change rule | Examples |
| --- | --- | --- | --- |
| **Core** | Required in every DarkFactory project | Change through an explicit architecture decision | pnpm/Turborepo, Civet-first source, Vite/vinext, PostgreSQL/Drizzle, Better Auth, oRPC, Tailwind/shadcn, evlog/OpenTelemetry/PostHog adapter, Graphify, lifecycle gates |
| **Capability** | Optional, enabled intentionally, removable without rewriting the domain | Declare a manifest, port, adapter, config, install/remove path, verification, and docs | storage, AI provider, email delivery, jobs, error tracking, memory graph, database extensions |
| **Convention** | Rule every contributor and agent follows | Update `AGENTS.md` and `CONVENTIONS.md` with the reason | contract-first work, feature-vertical ownership, test-first behavior changes, provider isolation |
| **Implementation** | Current replaceable realization | May change while its contract remains stable | Cloudflare Workers, Alchemy deployment, PostHog adapter, Groq adapter, Resend adapter, R2 adapter |

This distinction prevents a vendor, optional service, or current file layout from becoming accidental architecture.

## Core topology

```text
pnpm workspace + Turborepo task graph
│
├── apps/web
│   ├── public routes              refined, domain-neutral marketing surface
│   ├── authenticated routes       practical account/portal surface
│   ├── features/*                 vertical application slices
│   └── framework glue             Vite/vinext and Cloudflare boundaries
│
├── packages
│   ├── api                        oRPC contracts, schemas, typed errors, OpenAPI generation
│   ├── auth                       Better Auth configuration and auth-facing services
│   ├── db                         Drizzle client, schema, migrations, stores, seeds, extensions
│   ├── ui                         shadcn primitives, tokens, themes, shared compositions
│   ├── analytics                  analytics port and PostHog adapter
│   ├── observability              evlog and OpenTelemetry wiring
│   ├── state                      shared XState/Zustand integration only when truly shared
│   ├── effects                    Effect-based infrastructure utilities
│   ├── email / ai                 provider ports and configured adapters
│   ├── jobs / storage / memory    capability ports and adapters
│   ├── config                     validated shared configuration
│   └── testkit                    cross-package test infrastructure
│
├── scripts                        small composed lifecycle, graph, database, cert, and capability tools
├── infra                          Cloudflare/Alchemy and PostgreSQL deployment definitions
└── docs                           architecture, guides, generated API docs, and decisions
```

The topology is a target boundary map, not permission to create empty packages. Create a package when it has a real contract and owner; otherwise keep the unit inside its feature.

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

## Deployment target

The authored web application is Civet compiled through Vite/vinext and deployed to Cloudflare Workers. The web deployment uses vinext's supported Cloudflare adapter (`@vinext/cloudflare`) unless a vinext-specific Alchemy adapter has been verified in the pinned toolchain.

Alchemy remains the deployment/infrastructure-as-code layer for ancillary Cloudflare resources. Do not assume its generic Vite resource can deploy vinext, and do not invent an unverified integration. Alchemy here is infrastructure tooling, not a blockchain API dependency. pnpm owns dependency installation and the lockfile; Turborepo owns the repository task graph.

Local development uses trusted HTTPS generated by mkcert for secure cookies, authentication callbacks, secure-context APIs, and production-like assumptions. Private keys remain local and ignored.

The deployed application connects to portable PostgreSQL through the database adapter, optionally using Hyperdrive. External capabilities connect only through their provider adapters. GitHub Actions runs the same canonical lifecycle exposed by `pnpm run ci`; bare `pnpm ci` is pnpm's clean-install command, not the lifecycle gate. Deployment follows successful CI.

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
- Bun was superseded by **pnpm as the only package manager and lockfile owner**; Bun is merely an optional compatible script runtime.
- A flat single-app layout was superseded by **pnpm workspaces with Turborepo at the root**, allowing additional apps without forcing them initially.
- tRPC was superseded by **contract-first oRPC** for typed errors, OpenAPI, and non-TypeScript consumers.
- Redis and RabbitMQ defaults, including speculative fallback language, were superseded by the **PostgreSQL-first decision order**.
- SST was explicitly removed. **Cloudflare + Alchemy** is the deployment target.
- Celery, Flower, Mintlify, Uptime Kuma, GlitchTip, Memori, storage, and specialized PostgreSQL extensions remain opt-in capabilities, not preinstalled infrastructure.
- Dark-only styling, serif typography, and purple/cyan glow-heavy “AI” styling are rejected. Public and portal references inspire patterns but do not define a domain or authorize copying.
