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
├── apps
│   ├── web
│   │   ├── src/app                    product public, auth, portal, account, admin, and API routes
│   │   ├── src/features               generated product feature navigation registry
│   │   └── Vite/vinext/Cloudflare     product framework and deployment boundary
│   └── operator
│       ├── src/app                    local sign-in, operator UI, auth, and operator API routes
│       └── Vite/vinext/Portless       local-only development boundary
│
├── packages
│   ├── api                        product oRPC contracts, schemas, handlers, clients, OpenAPI
│   ├── operator                   operator contracts, clients, services, workflow ports
│   ├── auth                       Better Auth server/client, auth policy, DB sign-out
│   ├── db                         Drizzle schema, repositories, migrations, seeds
│   ├── config                     environment parsing and capability/database profiles
│   ├── ui                         shadcn primitives, tokens, themes, compositions
│   ├── state                      shared XState flows and client state boundaries
│   ├── shared                     deliberately small cross-package utilities
│   ├── analytics                  analytics port and PostHog adapter
│   ├── observability              evlog, redaction, fanout, OpenTelemetry
│   ├── email / ai                 provider-neutral ports and selected adapters
│   ├── jobs                       queued workflow execution, worker runtime, and local OMP/Wayfinder adapters
│   ├── storage                    optional capability ports and local/test adapters
│   └── testkit                    cross-package PostgreSQL and test infrastructure
│
├── scripts                        lifecycle, doctor, graph, docs, database, and E2E tools
├── tests                          contract, integration, and browser lifecycle coverage
├── docs / design-system           architecture, decisions, evidence, and UI policy
└── infra                          local PostgreSQL container infrastructure
```

This is the implemented repository topology, not a package wish list. `apps/web` is the deployable end-user product. Its page UI and orchestration live under `apps/web/src/app`, `apps/web/src/components`, and `apps/web/src/lib`; `apps/web/src/features` is presently a generated navigation registry rather than the home of feature implementations. `apps/operator` is a separate, authenticated, local-only development meta-layer. It is not a deployable business capability and it does not add operator routes or runtime to the product application. `pnpm-workspace.yaml` includes `apps/*` and `packages/*`; the root coordinates them without publishing an application API.

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

The product path is `apps/web` → `packages/api`; `packages/api` contains product contracts and services only. The local operator path is `apps/operator` → `packages/operator`, with server composition depending on authentication, database workflow repositories, jobs, and state. `packages/jobs` owns queued execution, the workflow worker, and the local-only OMP and Wayfinder adapters. Neither the operator server surface nor the local execution adapters may enter a browser bundle, a Worker bundle, or `apps/web`.

A feature vertical owns its feature-specific UI, client state, contract client usage, application orchestration, local server code, events, and tests. Shared packages own cross-feature protocols and infrastructure, not miscellaneous convenience code. Features communicate through public contracts/events rather than internal deep imports.

## Request and data flow

The deployable product request path is:

```text
browser or external client
  → apps/web Vite/vinext route
  → packages/api contract validation and authentication context
  → application command/query
  → domain rule
  → application port
  → Drizzle store/adapter
  → PostgreSQL
  → domain/application event
  → evlog structured event
      ├→ analytics port → PostHog adapter
      └→ OpenTelemetry → configured telemetry backend
  → typed product result/error
```

The local operator request and execution path is separate:

```text
authenticated browser
  → apps/operator route
  → packages/operator contract/service
  → authorized workflow repository operation
  → PostgreSQL journal/outbox
  → durable queued Wayfinder plan effect
  → separately started `worker:pilot` claim
  → packages/jobs local Wayfinder adapter
  → scoped OMP adapter
```

The HTTP Wayfinder start operation ends after durable enqueue and returns `queued`; it never runs OMP inside the request. The separately started pilot worker claims the plan effect before dispatch. It creates one scoped OMP adapter, wraps it with the local Wayfinder execution adapter, and injects both into the workflow runtime. The product and operator contracts are their respective API sources of truth. Direct feature-to-database, feature-to-provider, and parallel ad hoc API paths are architectural violations.

## Current runtime assembly

The repository has separate composition roots. `apps/web` composes the deployable product. Its Better Auth catch-all route builds a request-scoped database connection, selects the configured email transport, creates the Better Auth instance, delegates to the hardened auth handler, and closes the connection. Its oRPC catch-all route parses the validated server environment, rejects unsafe cross-origin mutations, opens request-scoped repositories and authorization guards, selects product adapters from capability truth, and closes the database connection in `finally`.

`apps/operator` composes the authenticated local operator plane at <https://operator.darkfactory.localhost>. It supplies local auth and operator oRPC routes, builds the operator context, connects the database workflow repository to `packages/operator` services, and connects those services to `packages/jobs`. `packages/operator` owns operator contracts, bounded projections, typed safe errors, authorization and repository scope, workflow actions, and Wayfinder status/start services. `packages/api` remains product-only and does not own operator contracts or runtime.

Wayfinder status checks the bounded local manifest at `~/.agents/skills/wayfinder/SKILL.md` and reports only `installed` or `unavailable` with the `local-markdown` tracker. Wayfinder start validates the owner, repository, scope paths, and request, verifies authorization and availability, creates a durable run, and returns its `queued` status. Only the separately started `worker:pilot` processes queued effects: it claims the plan effect, then dispatches the local Wayfinder adapter through the scoped OMP adapter. Leases, grants, redaction, timeouts, aborts, cleanup, journal, outbox, and evidence remain worker concerns. This model does not claim that any particular Wayfinder run or its evidence has completed.

Authentication and application data share portable PostgreSQL durability but retain separate ownership. Better Auth owns its user, account, session, and verification records. DarkFactory repositories own profile, address, preferences, feature, contact, administration, and workflow data. Role and status checks are enforced at the relevant auth/API boundary and again where application policy requires them; browser-visible state is never accepted as authorization proof.

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
| Jobs | durable enqueue, claim, status, and execution | PostgreSQL workflow runtime; separately started pilot worker with scoped local OMP and Wayfinder adapters |
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

The root scripts provide separate product and operator lifecycles:

- `bun run dev` runs only `@darkfactory/web`. `bun run dev:https` manages the stable `darkfactory-web-dev` PM2 process and the canonical <https://darkfactory.localhost> route. The matching product commands are `dev:bindings`, `dev:status`, `dev:logs`, `dev:stop`, and `dev:trust`.
- `bun run operator:dev` first runs `operator:bindings`, then manages the stable `darkfactory-operator-dev` PM2 process and the <https://operator.darkfactory.localhost> route. The matching commands are `operator:status`, `operator:logs`, `operator:stop`, and `operator:bindings`.
- `operator:bindings` validates the Varlock environment and atomically writes only the ignored `apps/operator/.dev.vars` file with mode `0600`. `WORKFLOW_REPOSITORIES_ROOT` remains optional for product-only use, but it must be set to an absolute directory before operator repository operations. The operator API fails closed before opening a database when it is missing or invalid.
- `bun run doctor` independently probes installed Bun 1.3.14 and Node >=22.13 plus the required workstation/runtime prerequisites without printing environment values or starting infrastructure.
- Database scripts own schema generation, migration, seed/reset, and isolated test-PostgreSQL lifecycle. Build, test, generated-contract, docs, and Graphify checks remain explicit repository gates. Deploy scripts own only the official `apps/web` vinext/Cloudflare path.

Graphify output is generated context rather than an authored runtime dependency. Repository Graphify commands must use the tracked secure wrapper, and graph evidence is valid only after the current source tree passes build/check/verify.

## Deployment target

`apps/web` is the only deployable application. It is authored in Civet, compiled through Vite/vinext, and deployed to Cloudflare Workers with the official `@vinext/cloudflare` adapter. `apps/operator`, `packages/operator`, and the OMP/Wayfinder execution adapters in `packages/jobs` are development-only local tooling. They are not included in `deploy:web`, have no operator deployment command, and must not become production business capabilities.

Alchemy 0.93.12 is only a source-reviewed compatibility baseline for explicitly enabled, supported ancillary Cloudflare resources. No ancillary resource is currently enabled, so DarkFactory has no Alchemy dependency, `alchemy.run.ts`, or Alchemy deployment step. Do not put the vinext web application in Alchemy or add an empty program: in the reviewed baseline, `finalize()` can reconcile and delete resources persisted in a reused stage when they are absent from the current program. Re-review the then-current release before enabling a real ancillary resource. Alchemy here is infrastructure tooling, not a blockchain API dependency. pnpm owns dependency installation and the lockfile; Turborepo owns the repository task graph.

Canonical local development uses <https://darkfactory.localhost> for the product and <https://operator.darkfactory.localhost> for the operator meta-layer. Portless owns both trusted routes. PM2 owns the separate `darkfactory-web-dev` and `darkfactory-operator-dev` processes. mkcert installation and certificate generation are fallback-only; private keys remain local and ignored.

GitHub Actions runs the repository verification lanes but does not deploy or run the local operator worker from a browser. Current documentation makes no claim of a production operator deployment, remote CI operator execution, or completed Wayfinder evidence.

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
