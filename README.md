# DarkFactory

[![CI](https://github.com/jeffscottward/darkfactory/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffscottward/darkfactory/actions/workflows/ci.yml)

DarkFactory is a domain-neutral, Postgres-first application foundation for building AI-assisted products without making an AI provider, business vertical, or optional service part of the core architecture. It combines a public site, authenticated portal, contract-first API, portable PostgreSQL data layer, provider adapters, and an inspectable engineering lifecycle.

The repository is a v0.1 foundation under active verification. The CI badge reports the repository workflow; it is not a production-readiness, deployment, coverage, or security certification.

## Architecture

A normal application request follows one owned path:

```text
browser or external client
  -> Vite/vinext route on Cloudflare-compatible runtime
  -> oRPC contract validation + Better Auth context
  -> application command or query
  -> domain rule + application port
  -> Drizzle repository/adapter
  -> PostgreSQL
  -> semantic event -> evlog / analytics port / OpenTelemetry
  -> typed oRPC result or error
```

The oRPC contract is the API source of truth. OpenAPI is generated from it. Features do not call PostgreSQL, analytics, or provider SDKs directly.

See [ARCHITECTURE.md](ARCHITECTURE.md) for decision boundaries and [CONVENTIONS.md](CONVENTIONS.md) for implementation rules.

## Implemented surfaces

The current route tree contains:

- Public: `/`, `/about`, `/features`, `/solutions`, `/resources`, `/privacy`, `/terms`, `/legal/privacy`, and `/legal/terms`.
- Authentication: `/sign-in`, `/sign-up`, `/forgot-password`, `/reset-password`, and `/verify-email`.
- Portal: `/dashboard`, `/feature-items`, `/feature-items/new`, and `/feature-items/[id]`.
- Account: `/account`, `/account/profile`, `/account/address`, `/account/preferences`, and `/account/security`.
- Administration: `/admin` and `/admin/users`.
- Runtime endpoints: Better Auth under `/api/auth/[...all]`, oRPC under `/api/orpc/[...rest]`, and `/theme-bootstrap.js`.

The generated OpenAPI document at [`packages/api/openapi.json`](packages/api/openapi.json) currently covers account profiles and addresses, preferences and themes, dashboard summaries, feature-item operations, and admin listings. Route existence does not by itself certify an end-to-end flow; use the evidence guide and CI results for verification.

## Stack

| Area | Current implementation |
| --- | --- |
| Language and workspace | Civet 0.11.15, TypeScript 6.0.2 at tooling boundaries, pnpm 11.16.0, Turborepo 2.10.6 |
| Web | React 19.2.8, vinext 1.0.0-beta.3, Vite 8.1.5, Cloudflare Workers |
| UI | Tailwind CSS 4.3.3, shadcn/Radix composition, Manrope and Public Sans |
| API | oRPC 1.14.8, Zod 4.1.12, generated OpenAPI 3.1.1 |
| Authentication | Better Auth 1.6.24 with its Drizzle adapter |
| Data | PostgreSQL 17.6 local image, Drizzle ORM 0.45.2, `pg` 8.22.0 |
| State | XState 5.32.5 for explicit lifecycles; Zustand 5.0.14 for ephemeral local UI state |
| Providers | Groq, React Email/Resend, PostHog, evlog, and OpenTelemetry behind ports or runtime selection |
| Quality | Biome/Ultracite, Vitest 4.1.10, Playwright 1.61.1, Husky, Graphify |

Optional providers are not automatically available merely because an adapter exists. [`capabilities.yaml`](capabilities.yaml) is the capability truth source.

## Prerequisites

- Node.js 22.13.0 or newer and Corepack.
- pnpm 11.16.0, selected through Corepack.
- Docker with Compose for the isolated local PostgreSQL service.
- PM2 for the durable local web process.
- Varlock for loading the public environment schema and injecting ignored local values.
- Graphify for repository graph commands and agent context.
- A browser trusted for the portless local certificate authority.
- Cloudflare credentials only when an authorized operator intentionally runs a deployment command.

Provider credentials are optional unless the corresponding provider is being exercised. The local email transport defaults to preview.

## Safe local setup

```bash
git clone https://github.com/jeffscottward/darkfactory.git
cd darkfactory
corepack enable
corepack install --global pnpm@11.16.0
pnpm install --frozen-lockfile
cp .env.example .env
```

Treat [`.env.schema`](.env.schema) as the public variable contract and [`.env.example`](.env.example) as safe starter values. Put real values only in an ignored environment file, Varlock/1Password reference, CI secret store, or deployment secret store. Never commit `.env`, resolved secrets, private keys, or raw environment dumps. Client variables remain an explicit allowlist; a server variable is not safe for a browser bundle merely because it exists in the schema.

Before startup, set `DATABASE_PROVIDER=postgres` and provide distinct development-only values of at least 32 characters for both `BETTER_AUTH_SECRET` and `CONTACT_THROTTLE_SECRET`. All three are required; never reuse either secret outside this disposable environment.

For the repository's disposable local application database, set `DATABASE_URL` in the ignored environment to:

```text
postgresql://darkfactory_app:darkfactory-app-local-only@127.0.0.1:5432/darkfactory_dev
```

Then start PostgreSQL and apply the checked-in migrations with Varlock loading the ignored values:

```bash
pnpm db:test:up
varlock run -- pnpm db:migrate
```

### Development seed warning

`pnpm db:seed` creates predictable development identities (`admin@domain.test`, `alice@domain.test`, and `bob@domain.test`) with the shared password `Development123!`. These accounts and credentials are deliberately unsafe outside a disposable development or test database. The command requires `APP_ENV=development` or `APP_ENV=test`, but you must still inspect `DATABASE_URL` before running it. Never seed a shared, staging, customer, or production database.

```bash
varlock run -- pnpm db:seed
```

`pnpm db:reset` is destructive and has the same environment restriction. Use it only against a disposable local/test target.

## Canonical local HTTPS and PM2

The only canonical human-facing local URL is <https://darkfactory.localhost>. Portless owns the hidden port and trusted HTTPS route. PM2 owns one stable process named `darkfactory-web-dev`.

```bash
pnpm dev:trust
pnpm dev:bindings
pnpm dev:https
pnpm dev:status
pnpm dev:logs
pnpm dev:stop
```

`pnpm dev:https` is idempotent and starts `portless darkfactory pnpm dev` through PM2. Run `pnpm dev:trust` first. Use `pnpm certs:install` and `pnpm certs:generate` only as the documented mkcert fallback when portless trust cannot work; generated certificates and keys stay ignored.

The Cloudflare Worker runtime reads server bindings from the ignored `apps/web/.dev.vars` file rather than inheriting them from PM2. `pnpm dev:bindings` validates `.env`, writes a same-directory temporary file with mode `0600`, and atomically replaces the binding file without printing its contents. Regenerate it after changing `.env`; never commit it.

After PostgreSQL, environment values, trust, and the PM2 route are ready, inspect the complete prerequisite report:

```bash
varlock run -- pnpm doctor
```

See [Local development](docs/local-development.md) for installation details, lifecycle recovery, and cleanup.

## Feature generator

Always inspect the plan before writing files:

```bash
pnpm generate:feature example-name --dry-run
pnpm generate:feature example-name
```

The generator accepts one feature name plus optional `--dry-run` and `--json` flags. A generated feature must replace the generic identity everywhere and carry its contract, route registration, persistence, tests, exports, and graph changes. Review the output and run the affected gates; generation is not verification.

## Scripts

| Purpose | Commands |
| --- | --- |
| Development | `pnpm dev`, `pnpm dev:https`, `pnpm dev:status`, `pnpm dev:logs`, `pnpm dev:stop`, `pnpm dev:trust` |
| Certificate fallback | `pnpm certs:install`, `pnpm certs:generate` |
| Database | `pnpm db:generate`, `pnpm db:check`, `pnpm db:migrate`, `pnpm db:seed`, `pnpm db:reset`, `pnpm db:test:up`, `pnpm db:test:down` |
| Build and types | `pnpm build`, `pnpm types`, `pnpm types:check`, `pnpm typecheck` |
| Static checks | `pnpm lint`, `pnpm lint:markdown`, `pnpm format:check` |
| Generated contracts | `pnpm auth:schema:check`, `pnpm api:openapi:generate`, `pnpm api:openapi:check` |
| Tests | `pnpm test:unit`, `pnpm test:integration`, `pnpm test:e2e`, `pnpm test` |
| Full gates | `pnpm verify`, `pnpm run ci` |
| Graphify | `pnpm graph:build`, `pnpm graph:update`, `pnpm graph:check`, `pnpm graph:verify` |
| Operations | `pnpm doctor`, `pnpm generate:feature` |
| Explicit web deployment | `pnpm deploy:web:check`, `pnpm deploy:web:preview`, `pnpm deploy:web` |

Use `pnpm run ci`, not bare `pnpm ci`: pnpm reserves the latter for clean installation.

## Testing and evidence

Start the isolated PostgreSQL service and load the test environment before database-backed checks. Playwright starts or reuses the canonical portless route and stores failure material in `playwright-report/` and `test-results/`.

```bash
pnpm db:test:up
varlock run -- pnpm test:unit
varlock run -- pnpm test:integration
varlock run -- pnpm test:e2e
varlock run -- pnpm verify
pnpm db:test:down
```

No command is considered successful without its observed exit result. Do not infer a green repository from this README or from a narrower check. See [Testing and evidence](docs/testing-and-evidence.md) and the draft [DF evidence map](docs/evidence-map.md).

## Graphify

When `graphify-out/graph.json` exists, agents query it before broad repository exploration:

```bash
graphify query "Trace a feature-item request from route to PostgreSQL"
graphify path "featureItems.create" "feature_items"
graphify explain "createFeatureItemService"
```

Refresh and verify the graph after adding features, moving public symbols, changing contracts or database relationships, or materially changing architecture:

```bash
pnpm graph:update
pnpm graph:check
pnpm graph:verify
```

`graphify-out/` is generated output and is not hand-edited. Build and update replace only Graphify's known generated entries before extraction so stale snapshot-root node identities cannot survive a refresh.

## Capabilities and deployment boundary

The web application builds and deploys only through the official `@vinext/cloudflare` adapter. `pnpm deploy:web:check` validates the adapter setup in dry-run mode without building or deploying. The explicit `deploy:web:preview` and `deploy:web` commands are credentialed Cloudflare operations; no automatic deployment workflow or proof of a completed deployment is claimed here.

Alchemy is reserved only for a real, explicitly enabled ancillary Cloudflare resource. No ancillary resource is enabled, so there is intentionally no `alchemy.run.ts` and no Alchemy deployment step. Alchemy 0.93.12 is a source-reviewed compatibility baseline, not an installed or active deployment layer. See [Capabilities and deployment](docs/capabilities-and-deployment.md) and [ADR 0001](docs/adr/0001-vinext-alchemy-boundary.md).

## Security

This repository does not claim a completed penetration test or security certification. Follow [Security](docs/security.md) for trust boundaries, environment handling, seed restrictions, and the authorized post-build Shannon policy. Shannon work is tracked only as post-build work in [TODO.md](TODO.md); it is never a substitute for unfinished core verification.

## Contributing and documentation

Before changing the repository, read:

- [Agent constitution](AGENTS.md)
- [Architecture](ARCHITECTURE.md)
- [Conventions](CONVENTIONS.md)
- [Reusable master build and orchestration prompt](MASTER_PROMPT.md)
- [Local development](docs/local-development.md)
- [Testing and evidence](docs/testing-and-evidence.md)
- [Capabilities and deployment](docs/capabilities-and-deployment.md)
- [Security](docs/security.md)
- [Post-build work](TODO.md)

Keep changes focused, update contracts and generated artifacts with their source, refresh Graphify when relationships change, run the applicable gate, and never describe pending CI, browser, deployment, or security evidence as complete.
