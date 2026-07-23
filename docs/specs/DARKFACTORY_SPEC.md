# DarkFactory v0.1 Implementation Specification

**Status:** Authoritative implementation source of truth  
**Release:** `v0.1`  
**Repository slug:** `darkfactory`  
**Normative language:** MUST, MUST NOT, SHOULD, SHOULD NOT, MAY  
**Derived from:** `docs/specs/DARKFACTORY_ONE_SHOT_PROMPT.md`, `ARCHITECTURE.md`, `CONVENTIONS.md`, and `AGENTS.md`

## 1. Authority and precedence

This specification is the executable Phase 0 output for DarkFactory v0.1. Implementers MUST be able to build and verify DarkFactory without reopening the design conversation or inferring a business domain.

Precedence is:

1. This specification's explicit later corrections and superseded-decision registry.
2. `DARKFACTORY_ONE_SHOT_PROMPT.md` as the complete ADR/execution contract.
3. `AGENTS.md` for contributor execution policy.
4. `ARCHITECTURE.md` for stable boundaries and rationale.
5. `CONVENTIONS.md` for naming, composition, testing, and UI rules.
6. Current provider/tool documentation for version-specific APIs, provided it does not silently reopen a settled architecture choice.

When a lower-precedence document still says mkcert is the primary local HTTPS path, describes Alchemy as the vinext web deployer, or omits the pinned toolchain boundary, this specification wins: portless + PM2 is the canonical local path; mkcert is fallback-only; `@vinext/cloudflare` is the official v0.1 web deployer; Alchemy owns only supported ancillary Cloudflare resources.

## 2. Objective, scope, and taxonomy

DarkFactory is a domain-neutral, Postgres-first, AI-native application foundation. It contains a refined public site, a practical authenticated portal, complete development auth identities, one generic removable vertical slice, deterministic lifecycle automation, and explicit provider/capability boundaries. It is not a CRM, trading system, property system, billing product, or any other vertical application.

Every requirement has exactly one primary class:

- **Core:** present and working in every DarkFactory repository.
- **Capability:** optional, explicitly enabled, removable, and represented truthfully when disabled.
- **Convention:** mandatory contributor/agent rule.
- **Implementation:** current replaceable mechanism satisfying a Core or Capability boundary.

The architecture optimizes for:

```text
stable core + replaceable adapters + optional capabilities
+ explicit conventions + intentional infrastructure minimalism
```

PostgreSQL is the default home for durable/data-related behavior. Add external data infrastructure only after PostgreSQL core and suitable extensions/patterns fail a measured requirement. Every additional service must justify its source of truth, failure mode, credentials, deployment, monitoring, migration, and agent-context cost.

## 3. Settled stack and compatibility boundary

```text
Workspace/runtime       Node >=22.13; pnpm 11; Turborepo; one pnpm lockfile
Authored app language   Civet
Tool boundaries         TypeScript for config/generated/Cloudflare/Playwright/tool-required files
Framework API           Next.js-compatible App Router
Framework runtime       Vite + vinext 1.0.0-beta.3
Web deployment          official @vinext/cloudflare deployer
Ancillary Cloudflare    Alchemy 0.93.12, supported resources only
Hosting/runtime         Cloudflare Workers
Database                PostgreSQL; PlanetScale Postgres default managed profile
ORM                     Drizzle
API                     contract-first oRPC + Zod + generated OpenAPI
Authentication          Better Auth, email/password
UI                      React + Tailwind + shadcn/ui
State                    XState processes; Zustand ephemeral UI; URL/query cache own their state
Effects                  Effect only at failure/resource-heavy infrastructure boundaries
AI                       Groq adapter behind AiPort
Email                    React Email + Resend; real local preview transport
Analytics                PostHog adapter behind AnalyticsPort
Telemetry/logging        OpenTelemetry + evlog
Local HTTPS              portless named URL + PM2; mkcert fallback only
Developer context        Graphify enabled; Memori disabled capability
Quality                  Ultracite, Husky, Vitest, Playwright, GitHub Actions
```

Toolchain requirements:

- Next-compatible `pageExtensions` MUST include `civet` with required JS/TS extensions.
- `@danielx/civet/vite` MUST appear before vinext in the Vite plugin array.
- `.civet` pages, layouts, loading/error boundaries, components, contracts, services, scripts, and ordinary tests MUST compile and be discovered.
- TypeScript remains at exact tooling boundaries: `vite.config.ts`, `next.config.ts`, `playwright.config.ts`, Playwright specs/harness files, `drizzle.config.ts`, `alchemy.run.ts`, generated OpenAPI clients, generated Cloudflare bindings, environment declarations, and migration artifacts.
- No undocumented Alchemy vinext resource or locally invented adapter may be represented as official.
- pnpm 11.16 reserves bare `pnpm ci` for its built-in clean-install command. The repository lifecycle script remains named `ci` but MUST be invoked as `pnpm run ci` everywhere to avoid dispatching the built-in command.

## 4. Superseded-decision registry

Checklist items cite these IDs.

| Ref | Superseded decision | Authoritative decision |
| --- | --- | --- |
| **S01** | npm, Yarn, Bun package management, or dual lockfiles | pnpm 11 owns packages/workspaces and the sole lockfile; Bun is optional script runtime only. |
| **S02** | Flat/single-app repository with no workspace shell | pnpm workspaces + Turborepo root; only `apps/web` is active in v0.1. |
| **S03** | Standard Next-only build, OpenNext, TanStack Start, Convex, or vinext-later placeholder | Vite + vinext now, retaining portable Next-compatible conventions. |
| **S04** | TypeScript/TSX as normal authored application language | Civet for authored app code; TypeScript only at named tooling/generated boundaries. |
| **S05** | tRPC or parallel handwritten REST/API definitions | contract-first oRPC; OpenAPI/clients derive from the same contracts. |
| **S06** | MySQL, Convex, multiple default stores, backend-as-a-service coupling | PostgreSQL + Drizzle, provider-neutral; PlanetScale is a profile, not domain architecture. |
| **S07** | Redis default/fallback and RabbitMQ expected broker | Neither is baseline nor predefined fallback; PostgreSQL-first decision order. |
| **S08** | SST, or Alchemy treated as a first-class vinext web resource | no SST; official `@vinext/cloudflare` deploys web; Alchemy handles ancillary supported Cloudflare resources. |
| **S09** | Domain-specific `leads` example | removable generator-ready `feature-stub` using neutral `FeatureItem`. |
| **S10** | Payments or all optional services installed in v0.1 | no payments; disabled capabilities are descriptors/ports/docs only and their dependencies are absent. |
| **S11** | Dark-only, serif, Inter/Roboto/Arial/Open Sans, purple/cyan glow-heavy AI styling | light/dark/system; ten palettes; Manrope display + Public Sans body/UI; all sans serif. |
| **S12** | Fixed common numbered localhost URLs, reserved port ranges, or mkcert as primary | `https://darkfactory.localhost` via portless; PM2 owns long-lived services; raw ports hidden; mkcert fallback-only. |
| **S13** | Shannon described as black-box scanning | authorized autonomous white-box, source-guided pentesting with live exploitation. |
| **S14** | Public/portal information architecture tied to a vertical product | original domain-neutral surfaces inspired by Squarespace and shadcn blocks. |
| **S15** | Privacy-level sample identities and persisted `reduced_motion` preference | remove both; retain nullable `date_of_birth`; honor CSS `prefers-reduced-motion`. |
| **S16** | Sentry or GlitchTip as core | OTel core; error tracking disabled; GlitchTip is the optional Postgres-centered profile. |

## 5. Architecture invariants

1. Dependencies point `framework/routes/UI → application → domain`; infrastructure adapters implement application ports.
2. Domain code imports no framework, ORM, provider SDK, deployment platform, or global mutable infrastructure singleton.
3. oRPC contracts, validated schemas, typed success/failure, and authorization expectations precede implementation.
4. All application API access crosses oRPC. OpenAPI and clients are generated from it.
5. Persistent relational access crosses Drizzle stores/repositories. Documented Postgres-specific raw SQL may exist only inside `packages/db` with tests.
6. PostgreSQL owns durable state, preferences, transition history, metadata, relationships, outbox events, and audit records.
7. URL owns shareable navigation/filter state; query caching owns server data on the client; Zustand owns ephemeral UI only.
8. XState models real processes; PostgreSQL remains the durable record.
9. Effect is boundary-driven, not required for pure domain helpers or ordinary components.
10. evlog emits semantic structured events, PostHog receives typed product analytics through a port, and OTel owns vendor-neutral technical telemetry.
11. Ports are capability-named and use-case sized; vendor names remain in adapters/composition roots.
12. Optional capabilities are disabled truthfully; directories/manifests MUST NOT imply installed/running services.
13. All user-visible typography is sans serif.
14. Generated OpenAPI, Graphify, docs, and migrations are reproducible and stale-checkable.
15. Every pushed commit follows a focused green gate and GitHub CI follow-through.

## 6. Target repository surface

The target is a minimal complete monorepo, not permission to create empty decorative packages.

```text
.
├── apps/web/
│   ├── app/
│   │   ├── (marketing)/{features,solutions,resources,about,contact,legal}/
│   │   ├── (auth)/{sign-in,sign-up,forgot-password}/
│   │   ├── (portal)/{dashboard,feature-items,account,admin}/
│   │   ├── api/{auth,orpc,openapi}/
│   │   ├── layout.civet
│   │   ├── error.civet
│   │   └── not-found.civet
│   ├── src/
│   │   ├── components/{marketing,portal-shell,theme-picker,account-menu}/
│   │   ├── features/{feature-stub,authentication,account,administration}/
│   │   ├── framework/
│   │   ├── state/
│   │   └── lib/
│   ├── public/{favicon.svg,placeholders}/
│   ├── styles/{globals.css,themes.css}/
│   ├── tests/{integration,e2e}/
│   ├── components.json
│   ├── next.config.ts
│   ├── playwright.config.ts
│   ├── vite.config.ts
│   └── package.json
├── packages/
│   ├── api/src/{contracts,procedures,client,server,openapi}/
│   ├── auth/src/{config,client,server}/
│   ├── db/{src/{client,schema,extensions,stores,seeds},migrations}/
│   ├── ui/src/{components,primitives,styles,themes,providers}/
│   ├── state/src/{xstate,zustand}/
│   ├── effects/
│   ├── analytics/src/{interface,posthog}/
│   ├── observability/src/{otel,evlog,health}/
│   ├── email/src/{components,templates,renderer,resend,preview}/
│   ├── ai/src/{interface,groq,prompts,tools}/
│   ├── jobs/src/{contracts,client,inline}/
│   ├── storage/src/{interface,metadata,r2}/
│   ├── memory/src/memori/
│   ├── config/
│   ├── shared/
│   └── testkit/
├── services/{jobs/{celery,flower},uptime-kuma,glitchtip}/
├── scripts/{feature,database,certificates,capabilities,graph,verify}/
├── certs/README.md
├── docs/{architecture,decisions,conventions,capabilities,ai,specs}/
├── infra/{alchemy,cloudflare,docker}/
├── .github/workflows/ci.yml
├── .husky/{pre-commit,pre-push}
├── .graphify/
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

Disabled capability folders contain only truthful descriptors/readmes/ports needed by the capability system. Every core package exposes a real API and has a consumer.

## 7. Required data, auth, route, and UI contracts

### Data

Better Auth owns its current required equivalents of `user`, `session`, `account`, and `verification`. DarkFactory owns:

- `profiles`: user FK, first/last/display names, avatar URL, phone, business name, job title, biography, timezone, locale, nullable date of birth, timestamps.
- `addresses`: user FK, type, address lines, city, region, postal code, country, primary flag, timestamps.
- `user_preferences`: user FK, mode, color scheme, email/product notifications, analytics/personalization consent, concrete profile visibility, timestamps; no reduced-motion field and no abstract seeded privacy level.
- `feature_items`: id, name, description, status, JSONB metadata, indexed owner FK, timestamps.
- `outbox_events`: typed aggregate/event payload and publication/attempt state.
- `audit_records`: actor, action/entity, redacted metadata, request ID, timestamp.

Use stable IDs, UTC storage, deliberate FKs/checks/uniqueness/indexes/cascades, explicit transactions, owner scoping, atomic mutation + outbox/audit, reproducible migrations, isolated reset, idempotent development seed, and production seed rejection.

### Development identities

All use development-only password `Development123!` and reserved `.test` email:

- Admin User — `admin@domain.test`, `admin`, Example Operations, neutral/system.
- Alice Adams — `alice@domain.test`, `member`, Alice & Co., violet/dark.
- Bob Baker — `bob@domain.test`, `member`, Bob Industries, blue/light.

Each has verified email, fake/non-routable phone and address, business/title/biography/timezone/locale/date-of-birth data, concrete editable preferences, and a fake/placehold.co avatar. Production MUST reject default credentials.

### Public routes

- `/`: original DarkFactory landing page.
- `/features`: architecture/features.
- `/solutions`: generic internal-tool/customer-portal/AI-workflow/data-app archetypes.
- `/resources`: links to real architecture, API, capability, and repository resources.
- `/about`: philosophy and infrastructure minimalism.
- `/contact`: validated form; explicit local/non-delivery state unless real configured email handles it.
- `/legal/privacy` and `/legal/terms`: clearly marked boilerplate requiring project legal review.
- `/sign-in`, `/sign-up`, `/forgot-password`: complete Better Auth flows.

### Portal routes

- `/dashboard`: real or clearly labeled seed overview, recent feature items, actions, capability status.
- `/feature-items`, `/feature-items/new`, `/feature-items/[id]`: owner-scoped list/create/view/edit/status/archive.
- `/account`, `/account/profile`, `/account/address`, `/account/preferences`, `/account/security`.
- `/admin/users`: admin-only server authorization, search/pagination/profile summary.

All surfaces need loading, pending, empty, validation, success, unauthorized/forbidden, not-found, and unexpected-error states.

### Design

- Public reference: `https://www.squarespace.com/`.
- Portal reference: `https://ui.shadcn.com/blocks`; `AGENTS.md` keeps it as a continual reference.
- Placeholder assets: `https://placehold.co/`; fake avatars/favicon are acceptable.
- References inspire hierarchy/composition only; never copy layout, copy, assets, branding, or trade dress.
- Typography: Manrope for display/headings and Public Sans for body/UI. No serif, Inter, Roboto, Arial, or Open Sans.
- Modes: light, dark, system (default system).
- Palettes: neutral, slate, blue, cyan, green, amber, orange, red, rose, violet.
- Authenticated preference in Postgres is authoritative; cookie mirrors for SSR/no-flash; local storage is anonymous-only; system media resolves system mode.
- Use shadcn semantic CSS variables including background/foreground/primary/secondary/muted/accent/destructive/border/input/ring/chart tokens.
- Meet WCAG 2.2 AA intent, visible focus, semantic labels/errors, keyboard access, 44×44 targets, stable layout, OS reduced-motion, and responsive checks at 375/768/1024/1440.

## 8. Provider, environment, local development, and capability contracts

Core provider ports: persistence/repositories, auth, analytics, telemetry/logging, AI, email, jobs, storage, configuration/feature capabilities, clock/IDs only where determinism requires them. Adapters MUST have deterministic tests and MUST NOT mirror entire vendor SDKs.

`capabilities.yaml` declares core stack plus disabled Mintlify, Celery/Flower, Uptime Kuma, GlitchTip, R2, Memori, pgvector, PostGIS, TimescaleDB, pg_trgm, and pg_cron. Disabled capability dependencies are absent. No Redis, RabbitMQ, SST, payments, or leads entry.

`.env.schema` and `.env.example` define safe public contracts for application URL, database, Better Auth, Groq, Resend/preview email, PostHog, OTel, and disabled capabilities. Client env is allowlisted. No secrets, private cert keys, production credentials, or raw env dumps enter Git/logs/client bundles.

Canonical local URL is `https://darkfactory.localhost`. Portless owns the named route and hidden assigned port. PM2 owns the long-lived `darkfactory-web-dev` process through `portless darkfactory pnpm dev`. `pnpm dev:https` is idempotent; `dev:status`, `dev:logs`, and `dev:stop` address the stable PM2 name. `portless trust` is primary. mkcert certificate install/generation remains only the fallback when portless trust is insufficient; generated keys are ignored.

Web deployment uses official `@vinext/cloudflare`. Alchemy 0.93.12 defines ancillary supported Cloudflare resources only. A deployment preview/build MUST prove this boundary without production secrets.

## 9. Lifecycle, scripts, tests, and evidence

Required root scripts:

```text
pnpm dev                 pnpm dev:https          pnpm dev:status
pnpm dev:logs            pnpm dev:stop           pnpm doctor
pnpm typecheck           pnpm build              pnpm lint
pnpm format              pnpm format:check       pnpm test
pnpm test:unit           pnpm test:contract      pnpm test:integration
pnpm test:e2e            pnpm test:a11y          pnpm graph:build
pnpm graph:update        pnpm graph:check        pnpm graph:verify
pnpm docs:generate       pnpm docs:check         pnpm openapi:generate
pnpm openapi:check       pnpm db:generate        pnpm db:migrate
pnpm db:seed             pnpm db:reset           pnpm certs:install
pnpm certs:generate      pnpm capability:add     pnpm generate:feature <name>
pnpm verify              pnpm run ci
```

`pnpm verify` is the full pre-push gate. `pnpm run ci` invokes the repository `ci` script and GitHub Actions executes the same clean sequence. Husky pre-commit stays staged/focused; pre-push executes the wider deterministic gate. Commit/push only focused green increments; after every push follow CI to terminal green or document an exact external blocker.

Tests cover unit, contract, database/auth/feature/provider integration, component behavior, E2E public/auth/portal/admin/feature journeys, accessibility, visual/responsive themes, security smoke, build/runtime, and generator behavior. No live production providers in default tests.

Evidence includes commit/branch, classified checklist, dependency inventory, final tree/graph, migrations/seeds, seeded login proof, OpenAPI/Graphify freshness, exact command results, Playwright report/screenshots, HTTPS/trust/session proof, redacted correlated events, official deployment boundary proof, and final CI URL/state.

## 10. Phase and owner map

| Phase | Owner code | Exclusive surface | Dependency |
| --- | --- | --- | --- |
| **P0** | **L** lead architect | specification, requirement trace, integration sequencing | none |
| **P1** | **W** workspace/tooling | root manifests, config package, Turbo, Vite/vinext/Civet, hooks, CI skeleton | P0 |
| **P2a** | **D** database | `packages/db`, local/test Postgres, migrations, seeds | P1 |
| **P2b** | **A** API/auth | `packages/api`, `packages/auth`, route bridges | P1 + D schema/export contract |
| **P2c** | **O** providers/observability | analytics, observability, email, AI, jobs/storage ports | P1 config contract |
| **P3a** | **U** UI/themes | `packages/ui`, tokens, themes, providers | P1 |
| **P3b** | **M** marketing | public routes/components/assets | U |
| **P3c** | **R** portal/auth UI | auth/portal/account/admin routes/shell | U + A |
| **P4** | **F** feature/generator | feature stub, contracts/procedures/repository additions, feature generator | D + A + O + U + R |
| **P5a** | **X** local DX | portless/PM2/mkcert fallback, doctor, HTTPS scripts | W + working app |
| **P5b** | **G** graph/docs/capabilities | Graphify, capability workflow, docs/ADRs/constitution alignment | stable P1–P4 architecture |
| **P6** | **L** integrator/reviewers | full hardening, browser proof, CI/release evidence | all prior phases |
| **POST** | **S** security/SDLC owner | Shannon and continuing factory TODOs | complete green P6 |

## 11. Keyed implementation checklist

Every item is mandatory unless explicitly classified Capability and disabled. `Accept/evidence` is observable; prose-only claims do not close an item.

### Governance and product identity — DF-001 through DF-010

- [ ] **DF-001 · Core · P0/L · depends: none.** Name and slug are consistently DarkFactory/`darkfactory`; release target is v0.1. **Accept/evidence:** manifests, titles, package scopes, app metadata, docs, and CLI output agree. **Supersedes:** none.
- [ ] **DF-002 · Convention · P0/L · depends: DF-001.** Foundation remains domain-neutral and AI-native. **Accept/evidence:** repository search/review finds no leads, CRM, trading, property, billing, or invented domain navigation/entity. **Supersedes:** S09, S14.
- [ ] **DF-003 · Convention · P0/L · depends: none.** Every design requirement is classified Core, Capability, Convention, or Implementation. **Accept/evidence:** this trace and generated implementation evidence retain classifications. **Supersedes:** none.
- [ ] **DF-004 · Convention · P0/L · depends: DF-003.** Later decisions and superseded registry control contradiction resolution. **Accept/evidence:** implementation audit explicitly checks S01–S16 and records no silent retention. **Supersedes:** S01–S16.
- [ ] **DF-005 · Core · P0/L · depends: DF-001–DF-004.** `DARKFACTORY_SPEC.md` is standalone, internally consistent, and mapped to execution phases. **Accept/evidence:** self-review report includes ID uniqueness/coverage/precedence/verifiability counts. **Supersedes:** none.
- [ ] **DF-006 · Convention · P0/L · depends: DF-005.** Optimize for a reusable foundation, not fastest scaffold completion. **Accept/evidence:** no core stubs/no-ops/TODO implementations; phase evidence proves end-to-end paths. **Supersedes:** none.
- [ ] **DF-007 · Convention · P0/L · depends: DF-005.** Existing user work is inspected/preserved; agents use exclusive ownership. **Accept/evidence:** ownership map and integration notes show no dropped unrelated change. **Supersedes:** none.
- [ ] **DF-008 · Convention · P0/L · depends: DF-005.** Stable core + replaceable adapters + optional capabilities governs boundaries. **Accept/evidence:** package graph and port/adapter review. **Supersedes:** S10.
- [ ] **DF-009 · Convention · P0/L · depends: DF-005.** PostgreSQL core/extension/pattern precedes external data infrastructure. **Accept/evidence:** manifest/ADRs contain decision order; no Redis/RabbitMQ fallback. **Supersedes:** S06, S07.
- [ ] **DF-010 · Convention · P0/L · depends: DF-005.** Code starts composable and splits only on reuse/testing/boundary/growth. **Accept/evidence:** feature/script review shows neither monolith nor micro-file explosion. **Supersedes:** none.

### Workspace, language, and build — DF-011 through DF-020

- [ ] **DF-011 · Core · P1/W · depends: DF-005.** Root is pnpm 11 workspaces + Turborepo with sole `pnpm-lock.yaml`. **Accept/evidence:** frozen install, workspace graph, absence of npm/yarn/bun lockfiles. **Supersedes:** S01, S02.
- [ ] **DF-012 · Implementation · P1/W · depends: DF-011.** Enforce Node >=22.13 and pnpm 11 in metadata, doctor, CI. **Accept/evidence:** incompatible-version fixture fails clearly; supported environment passes. **Supersedes:** none.
- [ ] **DF-013 · Core · P1/W · depends: DF-011.** Only `apps/web` is active; monorepo can add sibling apps without restructuring. **Accept/evidence:** workspace/Turbo config and target tree. **Supersedes:** S02.
- [ ] **DF-014 · Core · P1/W · depends: DF-012.** App builds with Vite + vinext 1.0.0-beta.3 and portable Next-compatible App Router conventions. **Accept/evidence:** clean production build and route manifest. **Supersedes:** S03.
- [ ] **DF-015 · Core · P1/W · depends: DF-014.** Civet is authored application language. **Accept/evidence:** app/features/UI/services/scripts authored as `.civet`; no familiarity-driven TS duplicates. **Supersedes:** S04.
- [ ] **DF-016 · Implementation · P1/W · depends: DF-014, DF-015.** `pageExtensions` explicitly includes `civet`. **Accept/evidence:** build/runtime test discovers `.civet` page/layout/loading/error routes. **Supersedes:** S04.
- [ ] **DF-017 · Implementation · P1/W · depends: DF-014, DF-015.** Civet Vite plugin runs before vinext. **Accept/evidence:** config assertion plus clean build fails under reversed-order regression fixture/test. **Supersedes:** S04.
- [ ] **DF-018 · Convention · P1/W · depends: DF-015.** TypeScript remains for config/generated/Cloudflare/Playwright/tool-required files only. **Accept/evidence:** boundary inventory includes next/vite/playwright/drizzle/alchemy/generated files; no app logic in compatibility entrypoints. **Supersedes:** S04.
- [ ] **DF-019 · Core · P1/W · depends: DF-011.** Turbo coordinates dev/build/typecheck/lint/test with simple accurate dependencies/caches. **Accept/evidence:** Turbo graph and repeated build cache behavior; dev persistent/uncached. **Supersedes:** none.
- [ ] **DF-020 · Convention · P1/W · depends: DF-011–DF-019.** Version pins/catalog are centralized and compatibility deviations documented. **Accept/evidence:** one version policy; vinext/Alchemy baseline and any verified change recorded. **Supersedes:** none.

### Architecture and package APIs — DF-021 through DF-030

- [ ] **DF-021 · Core · P1/L · depends: DF-005.** Enforce inward dependency direction. **Accept/evidence:** package/import graph shows no domain→framework/ORM/provider edge. **Supersedes:** none.
- [ ] **DF-022 · Convention · P1/L · depends: DF-021.** Packages expose deliberate public exports; no cross-package deep imports or broad dumping-ground barrels. **Accept/evidence:** export/import audit. **Supersedes:** none.
- [ ] **DF-023 · Core · P2b/A · depends: DF-021.** `@darkfactory/api` exports contract/router/context/client/OpenAPI builder. **Accept/evidence:** consumer compile, contract tests, generated spec. **Supersedes:** S05.
- [ ] **DF-024 · Core · P2b/A · depends: DF-021.** `@darkfactory/auth` exports Better Auth client/server/session/role helpers and route bridge. **Accept/evidence:** auth integration and server-only boundary tests. **Supersedes:** none.
- [ ] **DF-025 · Core · P2a/D · depends: DF-021.** `@darkfactory/db` exports Drizzle client/schema/transaction/repositories/seeds/reset. **Accept/evidence:** package consumer integration; no provider types leak upward. **Supersedes:** S06.
- [ ] **DF-026 · Core · P3a/U · depends: DF-021.** `@darkfactory/ui` exports shadcn primitives, semantic tokens, ThemeProvider/Picker. **Accept/evidence:** public and portal consumers; accessibility/component tests. **Supersedes:** S11.
- [ ] **DF-027 · Core · P2c/O · depends: DF-021.** Analytics/observability/email/AI packages expose capability-named ports and vendor adapters. **Accept/evidence:** adapter conformance tests and composition root. **Supersedes:** none.
- [ ] **DF-028 · Core · P2c/O · depends: DF-021.** Jobs/storage expose typed ports and local/inline or disabled boundaries without enabling Celery/R2. **Accept/evidence:** manifests/dependency inventory/tests prove disabled state. **Supersedes:** S10.
- [ ] **DF-029 · Core · P1/W · depends: DF-021.** Config package validates server/client environment and capability manifest; secrets stay server-only. **Accept/evidence:** invalid/unknown/client-leak tests. **Supersedes:** none.
- [ ] **DF-030 · Convention · P1/L · depends: DF-022.** Shared/testkit/state/effects packages exist only with real cross-feature contracts and consumers. **Accept/evidence:** no empty decorative packages; dependency graph/review. **Supersedes:** none.

### Database and persistence — DF-031 through DF-040

- [ ] **DF-031 · Core · P2a/D · depends: DF-012, DF-025.** Ordinary PostgreSQL is authoritative and provider-portable through `DATABASE_URL`. **Accept/evidence:** local Postgres integration suite and provider-neutral schema. **Supersedes:** S06.
- [ ] **DF-032 · Implementation · P2a/D · depends: DF-031.** PlanetScale Postgres is default managed profile, not domain dependency. **Accept/evidence:** provider selected in config/composition; tests use ordinary Postgres. **Supersedes:** S06.
- [ ] **DF-033 · Core · P2a/D · depends: DF-031.** Better Auth required user/session/account/verification schema is generated for pinned version. **Accept/evidence:** empty migration + Better Auth integration. **Supersedes:** none.
- [ ] **DF-034 · Core · P2a/D · depends: DF-033.** Profiles table contains complete named fields including nullable sensitive date_of_birth. **Accept/evidence:** schema/migration/repository tests. **Supersedes:** S15.
- [ ] **DF-035 · Core · P2a/D · depends: DF-033.** Addresses table supports typed addresses and one deliberate primary-address policy. **Accept/evidence:** FK/check/unique/repository tests. **Supersedes:** none.
- [ ] **DF-036 · Core · P2a/D · depends: DF-033.** Preferences store mode, ten-scheme choice, notifications/consents/profile visibility; no reduced_motion/abstract privacy level. **Accept/evidence:** schema inspection and persistence tests. **Supersedes:** S15.
- [ ] **DF-037 · Core · P2a/D · depends: DF-033.** Feature items contain neutral fields/status/JSONB/owner/timestamps and owner index. **Accept/evidence:** migration/schema/repository tests. **Supersedes:** S09.
- [ ] **DF-038 · Core · P2a/D · depends: DF-031.** Outbox and audit records support transactional feature mutations and redacted context. **Accept/evidence:** commit/rollback/atomicity integration tests. **Supersedes:** none.
- [ ] **DF-039 · Convention · P2a/D · depends: DF-034–DF-038.** Stable IDs, UTC, FKs/checks/indexes/unique/cascades/nullability are deliberate. **Accept/evidence:** migration review plus boundary tests. **Supersedes:** none.
- [ ] **DF-040 · Core · P2a/D · depends: DF-033–DF-039.** Empty DB migration, idempotent dev seed, isolated reset, and production seed rejection work. **Accept/evidence:** clean DB command transcript and failing production-default test. **Supersedes:** none.

### Authentication and seeded users — DF-041 through DF-050

- [ ] **DF-041 · Core · P2b/A · depends: DF-033, DF-024.** Better Auth email/password sign-up provisions member/profile/default preferences reliably. **Accept/evidence:** integration/E2E sign-up. **Supersedes:** none.
- [ ] **DF-042 · Core · P2b/A · depends: DF-041.** Sign-in/sign-out/session restoration and redirect-back work over HTTPS. **Accept/evidence:** integration/E2E secure-cookie journey. **Supersedes:** none.
- [ ] **DF-043 · Core · P2b/A · depends: DF-041.** Forgot/reset flow uses expiring one-time token and safe account-enumeration policy. **Accept/evidence:** token/error integration tests and E2E preview journey. **Supersedes:** none.
- [ ] **DF-044 · Core · P2c/O · depends: DF-043.** React Email renders reset; Resend sends only when configured; local preview is real and inspectable. **Accept/evidence:** render snapshots/semantic assertions and preview artifact; no fake success. **Supersedes:** none.
- [ ] **DF-045 · Core · P2b/A · depends: DF-042.** Protected portal and owner/admin authorization are enforced server-side. **Accept/evidence:** direct procedure/route denial tests, not navigation hiding. **Supersedes:** none.
- [ ] **DF-046 · Core · P2a/D · depends: DF-040.** Seed Admin User `admin@domain.test`/admin/Example Operations/neutral-system. **Accept/evidence:** seed/query/login/profile/address/preferences checks. **Supersedes:** S15.
- [ ] **DF-047 · Core · P2a/D · depends: DF-040.** Seed Alice Adams `alice@domain.test`/member/Alice & Co./violet-dark. **Accept/evidence:** seed/query/login/profile/address/preferences checks. **Supersedes:** S15.
- [ ] **DF-048 · Core · P2a/D · depends: DF-040.** Seed Bob Baker `bob@domain.test`/member/Bob Industries/blue-light. **Accept/evidence:** seed/query/login/profile/address/preferences checks. **Supersedes:** S15.
- [ ] **DF-049 · Core · P2a/D · depends: DF-046–DF-048.** Dev password is `Development123!`, documentation/dev only; production rejects it. **Accept/evidence:** prod guard test and secret-safe logs. **Supersedes:** none.
- [ ] **DF-050 · Convention · P2a/D · depends: DF-046–DF-048.** Seeds use fake/non-routable contact/address/avatar data, no privacy labels or reduced-motion field. **Accept/evidence:** seed fixture review and PII/log tests. **Supersedes:** S15.

### API, providers, observability — DF-051 through DF-060

- [ ] **DF-051 · Core · P2b/A · depends: DF-023, DF-029.** oRPC is sole application API, contract-first with Zod and typed errors/auth expectations. **Accept/evidence:** contract tests and absence of parallel ad hoc API. **Supersedes:** S05.
- [ ] **DF-052 · Core · P2b/A · depends: DF-051.** OpenAPI and typed client generate from oRPC and stale-check. **Accept/evidence:** reproducible generation/diff check/consumer compile. **Supersedes:** S05.
- [ ] **DF-053 · Core · P2c/O · depends: DF-027.** AnalyticsPort supports only used typed operations; PostHog adapter honors consent and excludes PII. **Accept/evidence:** mapping/consent/redaction tests. **Supersedes:** none.
- [ ] **DF-054 · Core · P2c/O · depends: DF-027.** OTel initializes vendor-neutral traces/metrics/log context and test export. **Accept/evidence:** spans include safe request/procedure/duration/outcome correlation. **Supersedes:** S16.
- [ ] **DF-055 · Core · P2c/O · depends: DF-027, DF-054.** evlog emits semantic structured events once with OTel/analytics fan-out at adapters. **Accept/evidence:** correlated event assertions, no scattered console/provider calls. **Supersedes:** none.
- [ ] **DF-056 · Convention · P2c/O · depends: DF-053–DF-055.** Redact passwords, tokens, cookies, email bodies, addresses, DOB, provider payloads, secrets. **Accept/evidence:** redaction unit/integration tests. **Supersedes:** none.
- [ ] **DF-057 · Implementation · P2c/O · depends: DF-027, DF-029.** Groq adapter implements minimal AiPort; missing key is explicit disabled/unconfigured state. **Accept/evidence:** deterministic adapter/error/timeout tests; core usable without AI call. **Supersedes:** none.
- [ ] **DF-058 · Implementation · P2c/O · depends: DF-044.** Resend is configured email adapter; preview transport owns local behavior. **Accept/evidence:** provider selection tests; no raw key logs. **Supersedes:** none.
- [ ] **DF-059 · Capability · P2c/O · depends: DF-028.** Storage boundary describes R2/S3-compatible object operations and Postgres metadata; R2 disabled/uninstalled. **Accept/evidence:** manifest/dependency audit/docs. **Supersedes:** S10.
- [ ] **DF-060 · Capability · P2c/O · depends: DF-028.** Jobs expose typed inline/outbox-friendly core path; Celery/Flower disabled, no broker preselected. **Accept/evidence:** manifest/dependency audit/inline tests. **Supersedes:** S07, S10.

### Feature stub and generators — DF-061 through DF-070

- [ ] **DF-061 · Core · P4/F · depends: DF-037, DF-051, DF-026.** `feature-stub` is neutral, removable, and generator-ready. **Accept/evidence:** no domain vocabulary; removal/generator docs. **Supersedes:** S09.
- [ ] **DF-062 · Core · P4/F · depends: DF-061.** Feature contract exposes owner-scoped list/get/create/update/status/archive or documented delete semantics. **Accept/evidence:** contract tests and OpenAPI. **Supersedes:** S09.
- [ ] **DF-063 · Core · P4/F · depends: DF-062.** Service validates policy and returns typed expected failures. **Accept/evidence:** unit boundary/state/error tests. **Supersedes:** none.
- [ ] **DF-064 · Core · P4/F · depends: DF-063, DF-038.** Drizzle store uses atomic mutation + audit/outbox and correct owner/admin scope. **Accept/evidence:** DB integration rollback/authorization tests. **Supersedes:** none.
- [ ] **DF-065 · Core · P4/F · depends: DF-053–DF-055, DF-064.** Feature emits analytics, evlog, and OTel evidence without PII. **Accept/evidence:** correlated provider integration assertions. **Supersedes:** none.
- [ ] **DF-066 · Core · P4/F · depends: DF-062–DF-065.** Feature UI handles list/search/filter/create/edit/status/archive and all pending/empty/validation/403/404/server/success states. **Accept/evidence:** component and E2E journeys. **Supersedes:** S09.
- [ ] **DF-067 · Convention · P4/F · depends: DF-066.** XState is used only for a meaningful feature workflow; durable transitions remain Postgres. **Accept/evidence:** machine transition tests and persistence proof. **Supersedes:** none.
- [ ] **DF-068 · Convention · P4/F · depends: DF-066.** Zustand is used only for a real ephemeral view concern; server/URL/durable data stay out. **Accept/evidence:** state ownership review/tests. **Supersedes:** none.
- [ ] **DF-069 · Core · P4/F · depends: DF-061–DF-068.** `pnpm generate:feature <name>` validates, plans, applies, verifies, updates names/contracts/routes/tables/tests/exports/docs/Graphify, and never overwrites. **Accept/evidence:** disposable fixture generation and duplicate/rollback tests. **Supersedes:** S09.
- [ ] **DF-070 · Convention · P4/F · depends: DF-069.** Generator internals compose parse→validate→plan→apply→verify→report; CLI contains no business logic. **Accept/evidence:** unit tests and code review. **Supersedes:** none.

### Public routes and marketing design — DF-071 through DF-080

- [ ] **DF-071 · Core · P3b/M · depends: DF-026.** `/` is an original refined domain-neutral DarkFactory landing page with real navigation/CTAs. **Accept/evidence:** browser screenshot/navigation/E2E. **Supersedes:** S14.
- [ ] **DF-072 · Core · P3b/M · depends: DF-026.** `/features` explains actual contracts/Postgres/auth/observability/provider/generator capabilities. **Accept/evidence:** links/content match implementation. **Supersedes:** S14.
- [ ] **DF-073 · Core · P3b/M · depends: DF-026.** `/solutions` presents generic archetypes explicitly as examples, not baked domains. **Accept/evidence:** content review/browser. **Supersedes:** S14.
- [ ] **DF-074 · Core · P3b/M · depends: DF-052.** `/resources` links only existing architecture, OpenAPI, capabilities, and repository resources. **Accept/evidence:** internal link check/browser. **Supersedes:** none.
- [ ] **DF-075 · Core · P3b/M · depends: DF-005.** `/about` explains infrastructure minimalism, AI-native context, stable core/adapters. **Accept/evidence:** content/browser review. **Supersedes:** none.
- [ ] **DF-076 · Core · P3b/M · depends: DF-044.** `/contact` validates and truthfully reports preview/non-delivery or configured delivery; no fake success. **Accept/evidence:** form integration/E2E. **Supersedes:** none.
- [ ] **DF-077 · Core · P3b/M · depends: DF-026.** `/legal/privacy` and `/legal/terms` are marked generic placeholders needing legal review. **Accept/evidence:** browser/content check. **Supersedes:** none.
- [ ] **DF-078 · Convention · P3b/M · depends: DF-071–DF-077.** Public design continuously references `https://www.squarespace.com/` for restraint/hierarchy, never copying. **Accept/evidence:** AGENTS/design review and original screenshots. **Supersedes:** S14.
- [ ] **DF-079 · Convention · P3b/M · depends: DF-071–DF-077.** `https://placehold.co/`, fake avatars/favicon may support generic content with correct alt semantics. **Accept/evidence:** asset/source/alt review. **Supersedes:** none.
- [ ] **DF-080 · Core · P3b/M · depends: DF-071–DF-079.** Public loading/not-found/error/mobile navigation states are polished and accessible. **Accept/evidence:** E2E/a11y/responsive screenshots. **Supersedes:** none.

### Portal, account, administration, theme — DF-081 through DF-090

- [ ] **DF-081 · Core · P3c/R · depends: DF-042, DF-026.** `/sign-in`, `/sign-up`, `/forgot-password` render complete accessible working flows. **Accept/evidence:** auth E2E including preview reset. **Supersedes:** none.
- [ ] **DF-082 · Core · P3c/R · depends: DF-045.** `/dashboard` uses real/clearly labeled seed metrics, recent items, actions, capability status. **Accept/evidence:** member/admin browser journey; no invented domain. **Supersedes:** S14.
- [ ] **DF-083 · Core · P3c/R · depends: DF-066.** Feature-items portal routes enforce owner/admin and correct 403/404 policy. **Accept/evidence:** direct URL/procedure E2E/integration. **Supersedes:** none.
- [ ] **DF-084 · Core · P3c/R · depends: DF-034–DF-036, DF-042.** Account/profile/address/preferences/security routes persist supported fields and session/security state. **Accept/evidence:** reload/new-session E2E. **Supersedes:** S15.
- [ ] **DF-085 · Core · P3c/R · depends: DF-045.** `/admin/users` is admin-only, searchable/paginated, non-destructive, server-authorized. **Accept/evidence:** member denial/admin acceptance E2E. **Supersedes:** none.
- [ ] **DF-086 · Convention · P3c/R · depends: DF-082–DF-085.** Portal continuously references `https://ui.shadcn.com/blocks` for composition, never copying or importing its domain. **Accept/evidence:** AGENTS durable URL and original portal screenshots. **Supersedes:** S14.
- [ ] **DF-087 · Core · P3a/U · depends: DF-026, DF-036.** Modes light/dark/system and ten named schemes share semantic tokens. **Accept/evidence:** automated 3-mode/10-scheme matrix. **Supersedes:** S11.
- [ ] **DF-088 · Core · P3a/U · depends: DF-087, DF-042.** Theme precedence is Postgres→SSR cookie→anonymous local storage→system resolver with no flash/hydration mismatch. **Accept/evidence:** reload/login/reconciliation E2E and visual observation. **Supersedes:** S11.
- [ ] **DF-089 · Convention · P3a/U · depends: DF-026.** Typography is Manrope display + Public Sans body/UI, all sans; prohibited fonts/serif absent. **Accept/evidence:** font/network/CSS audit and screenshots. **Supersedes:** S11.
- [ ] **DF-090 · Core · P3a/U · depends: DF-071–DF-089.** WCAG intent, keyboard/focus/labels/contrast/44×44/stable layout/reduced-motion/responsive widths hold across surfaces. **Accept/evidence:** a11y tools + manual keyboard + 375/768/1024/1440 screenshots. **Supersedes:** S11, S15.

### Environment, local HTTPS, deployment, capabilities — DF-091 through DF-100

- [ ] **DF-091 · Core · P1/W · depends: DF-029.** `.env.schema`/`.env.example` cover app, DB, auth, AI, email, analytics, OTel, disabled capabilities without secrets. **Accept/evidence:** config parsing/docs/secret scan. **Supersedes:** none.
- [ ] **DF-092 · Convention · P1/W · depends: DF-091.** Client env is explicit allowlist; production forbids weak/default seeds/preview assumptions. **Accept/evidence:** bundle inspection and production-config failure tests. **Supersedes:** none.
- [ ] **DF-093 · Implementation · P5a/X · depends: DF-014.** Canonical local URL is `https://darkfactory.localhost` through portless; raw port is hidden. **Accept/evidence:** browser URL, `portless get`, no fixed user-facing URL search. **Supersedes:** S12.
- [ ] **DF-094 · Implementation · P5a/X · depends: DF-093.** PM2 runs long-lived `darkfactory-web-dev` via `portless darkfactory pnpm dev`; scripts are idempotent and expose status/logs/stop. **Accept/evidence:** repeated start creates no duplicate; PM2/portless health output. **Supersedes:** S12.
- [ ] **DF-095 · Implementation · P5a/X · depends: DF-093.** `portless trust` is primary; mkcert install/generate/Vite cert wiring is documented fallback only; private keys ignored. **Accept/evidence:** no-warning HTTPS and fallback policy/key-ignore check. **Supersedes:** S12.
- [ ] **DF-096 · Core · P5a/X · depends: DF-042, DF-093.** Auth origins/callbacks/secure cookies/browser secure context work at canonical HTTPS URL. **Accept/evidence:** browser/network/cookie E2E. **Supersedes:** S12.
- [ ] **DF-097 · Core · P5a/X · depends: DF-012, DF-091, DF-093–DF-095.** `pnpm doctor` checks Node/pnpm, Docker/Postgres, Cloudflare, provider config status, portless/PM2 route/process/trust, Graphify, enabled tools, and mkcert only if fallback. **Accept/evidence:** healthy and missing-prerequisite fixture outputs with no secrets. **Supersedes:** S12.
- [ ] **DF-098 · Implementation · P6/L · depends: DF-014.** Web green path builds/deploys through official `@vinext/cloudflare`. **Accept/evidence:** package/script/config and safe deploy-preview artifact. **Supersedes:** S08.
- [ ] **DF-099 · Implementation · P6/L · depends: DF-098.** Alchemy 0.93.12 owns only actual supported ancillary Cloudflare resources. **Accept/evidence:** plan/config contains no vinext web resource or fictional wrapper. **Supersedes:** S08.
- [ ] **DF-100 · Capability · P5b/G · depends: DF-029.** Manifest validates enabled/configured/available/unknown/incompatible states; disabled capabilities uninstalled and truthful. **Accept/evidence:** parser tests and dependency inventory. **Supersedes:** S07, S10, S16.

### Scripts, hooks, CI, delivery — DF-101 through DF-110

- [ ] **DF-101 · Core · P1/W · depends: DF-011–DF-020.** All listed root scripts exist and perform real work or truthful not-applicable result. **Accept/evidence:** script inventory and focused command transcripts. **Supersedes:** none.
- [ ] **DF-102 · Core · P1/W · depends: DF-019, DF-101.** `pnpm verify` is the complete pre-push gate; `pnpm run ci` unambiguously invokes the repository lifecycle script and mirrors GitHub Actions. **Accept/evidence:** task/workflow comparison plus a clean `pnpm run ci` invocation. **Supersedes:** none.
- [ ] **DF-103 · Core · P1/W · depends: DF-101.** Husky pre-commit is staged/focused and calls scripts; pre-push calls full deterministic gate. **Accept/evidence:** hook fixture behavior; no duplicated logic. **Supersedes:** none.
- [ ] **DF-104 · Convention · P1/W · depends: DF-103.** Hooks/tests/gates are never bypassed, weakened, skipped, or snapshot-deleted for green. **Accept/evidence:** AGENTS/conventions and review history. **Supersedes:** none.
- [ ] **DF-105 · Core · P1/W · depends: DF-102.** CI uses frozen pnpm install, safe caches, isolated Postgres, migrations/seeds, config validation, full deterministic gates. **Accept/evidence:** workflow and successful run. **Supersedes:** S01.
- [ ] **DF-106 · Core · P1/W · depends: DF-105.** CI checks format/lint/type/build/unit/contract/integration/OpenAPI/Graphify/docs/E2E/a11y and uploads failure artifacts. **Accept/evidence:** job log/artifact test. **Supersedes:** none.
- [ ] **DF-107 · Convention · P1/L · depends: DF-102–DF-106.** Every commit is focused and made/pushed only after its affected green gate. **Accept/evidence:** commit/evidence ledger. **Supersedes:** none.
- [ ] **DF-108 · Convention · P6/L · depends: DF-107.** Every push is followed to terminal CI; repository-owned failures are reproduced/fixed/rerun. **Accept/evidence:** CI URLs and repair loop notes. **Supersedes:** none.
- [ ] **DF-109 · Core · P6/L · depends: DF-098, DF-105–DF-108.** Deployment is protected and depends on green CI; untrusted PR secrets never deploy. **Accept/evidence:** workflow permissions/dependency review. **Supersedes:** S08.
- [ ] **DF-110 · Convention · P6/L · depends: DF-108.** External/flaky blockers record URL/logs/rerun/owner/stop condition and are never labeled green. **Accept/evidence:** blocker template or final explicit none. **Supersedes:** none.

### Tests, Graphify, evidence, post-build — DF-111 through DF-120

- [ ] **DF-111 · Core · P2–P6/L · depends: applicable behavior.** Unit tests cover validators, theme/config/manifest, services/policies, generators, errors/redaction, machines. **Accept/evidence:** deterministic suite and behavior trace. **Supersedes:** none.
- [ ] **DF-112 · Core · P2–P6/L · depends: DF-023–DF-060.** Contract/integration tests cover oRPC/OpenAPI/adapters/DB/auth/feature/providers/atomicity/scoping/seeds. **Accept/evidence:** isolated real-Postgres suite. **Supersedes:** none.
- [ ] **DF-113 · Core · P3–P6/L · depends: DF-071–DF-090.** E2E covers public nav, sign-up, all seeds, logout/protection, feature flow, account persistence, theme/no-flash, admin, reset, mobile portal. **Accept/evidence:** Playwright report/traces. **Supersedes:** none.
- [ ] **DF-114 · Core · P3–P6/L · depends: DF-090.** Accessibility/visual/responsive/security smoke/build-runtime/generator matrices are complete. **Accept/evidence:** axe/manual keyboard/screenshots/security assertions/@vinext output/generator fixture. **Supersedes:** S11–S13.
- [ ] **DF-115 · Core · P5b/G · depends: stable architecture.** Graphify build/update/check/verify exist; agents query before broad exploration and update after feature/symbol/contract/relationship/architecture changes. **Accept/evidence:** graph freshness and example route→contract→service→repo→schema→adapter queries. **Supersedes:** none.
- [ ] **DF-116 · Convention · P5b/G · depends: DF-115.** AGENTS is the constitution: contracts, Drizzle/oRPC, Postgres-first, state/effect roles, CI follow-through, docs/OpenAPI/Graphify, sans UI, continual exact reference URLs. **Accept/evidence:** policy checklist. **Supersedes:** S07, S11, S14.
- [ ] **DF-117 · Capability · P5b/G · depends: DF-100.** Memori remains disabled Postgres-backed context capability with provenance/authority rules; no core memory tables/dependency. **Accept/evidence:** descriptor/docs/dependency/schema audit. **Supersedes:** S10.
- [ ] **DF-118 · Core · P6/L · depends: DF-001–DF-117.** Final evidence bundle maps every DF item to files/tests/commands/browser/CI and includes final SHA/tree/dependencies/migrations/seeds/OpenAPI/Graphify/HTTPS/deploy/events. **Accept/evidence:** inspectable report with no unsupported success claim. **Supersedes:** none.
- [ ] **DF-119 · Capability · POST/S · depends: green DF-118.** Create authorized Shannon TODO from `https://github.com/KeygraphHQ/shannon`: white-box source-guided live exploitation on isolated source/target, scoped credentials/safety/evidence/remediation/rerun. **Accept/evidence:** owned TODO with current official instructions prerequisite, boundaries, stop condition; core build not deferred. **Supersedes:** S13.
- [ ] **DF-120 · Convention · POST/S · depends: green DF-118.** Create continuing agentic software-factory/SDLC TODO sourced from `https://www.youtube.com/watch?v=VQy50fuxI34`, plus recurring gates, compatibility/extension/security/a11y/seed/capability/Graphify/CI-watcher loops with owner/trigger/command/evidence/stop. **Accept/evidence:** durable TODO set; video ideas validated against DarkFactory; TODOs do not replace v0.1 work. **Supersedes:** none.

## 12. Phase acceptance and integration order

- **P0:** DF-001–DF-010 complete; spec self-review green; owners exclusive.
- **P1:** DF-011–DF-020, DF-021–DF-022, DF-029–DF-030, DF-091–DF-092, DF-101–DF-106 green before core fan-out.
- **P2:** integrate D then A; O may run after config stabilizes. DF-023–DF-025 and DF-031–DF-060 green with empty DB/auth/provider evidence.
- **P3:** integrate U before M/R; R waits on auth. DF-071–DF-090 green with browser/a11y/responsive proof.
- **P4:** DF-061–DF-070 green; disposable generator fixture removed; graph/contracts/docs updated.
- **P5:** X and G own disjoint surfaces. DF-093–DF-097, DF-100, DF-115–DF-117 green.
- **P6:** DF-098–DF-114 and DF-118 green; official deployment boundary, full browser run, final CI evidence.
- **POST:** only after green P6, create DF-119–DF-120 TODOs; they do not excuse incomplete core work.

At each integration boundary: run focused tests while iterating, run the phase gate, update generated artifacts/Graphify/docs, commit one coherent green change, push, follow CI to terminal green, then release the dependent owner.

## 13. Definition of done

DarkFactory v0.1 is complete only when:

- DF-001 through DF-118 are checked with observable evidence.
- DF-119 and DF-120 have complete post-build owned TODO records after the green system exists.
- S01 through S16 are absent except where explicitly described as rejected/superseded.
- No disabled capability is installed/running or described as enabled.
- No secrets, private keys, alternate lockfiles, fake production fallbacks, disabled tests, or core implementation TODOs are committed.
- `https://darkfactory.localhost` works through portless + PM2 with secure auth; no fixed raw-port URL is user-facing.
- Web deployment proof uses official `@vinext/cloudflare`; Alchemy stays ancillary-only.
- Public and portal references are exact and continual, typography is all sans serif, and the app remains domain-neutral.
- The final pushed commit's GitHub Actions state is green, or an exact genuinely external blocker is documented without claiming completion.

## 14. Phase 0 self-review record

This document intentionally defines a contiguous checklist from **DF-001 through DF-120**.

Required mechanical/content checks before P1 integration:

- ID count is 120; unique count is 120; minimum is 001; maximum is 120; no gaps.
- Every item has exactly one class, a phase/owner, dependencies, observable acceptance/evidence, and superseded reference (`none` allowed).
- S01–S16 cover every settled contradiction: package manager, workspace, framework, language, API, data, Redis/RabbitMQ, SST/deployer boundary, feature identity, optional installation/payments, visual system, local URL/trust/process path, Shannon mode, domain neutrality, sample privacy/reduced motion, and error tracking.
- Normative sections and checklist agree on Node/pnpm/vinext/Alchemy versions, Civet plugin order, `pageExtensions`, TypeScript boundaries, `@vinext/cloudflare`, portless/PM2/mkcert precedence, routes, seeds, themes, capabilities, and post-build sources.
- Acceptance criteria name observable artifacts/behavior rather than subjective completion claims.
- No requirement in `DARKFACTORY_ONE_SHOT_PROMPT.md` is intentionally deferred or dropped; disabled capabilities are represented but not installed.
