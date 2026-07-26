<!-- markdownlint-disable-next-line MD041 -->
![DarkFactory — Full-Stack Project Scaffold, illustrated as a modular industrial complex labeled Frontend, Backend, Database, DevOps, Auth, and Testing](docs/assets/darkfactory-banner.webp)

# DarkFactory

| Category | Status |
| --- | --- |
| Verification | [![CI](https://github.com/jeffscottward/darkfactory/actions/workflows/ci.yml/badge.svg)](https://github.com/jeffscottward/darkfactory/actions/workflows/ci.yml) [![CodeQL](https://github.com/jeffscottward/darkfactory/actions/workflows/codeql.yml/badge.svg)](https://github.com/jeffscottward/darkfactory/actions/workflows/codeql.yml) |
| Project health | [![Coverage](https://img.shields.io/endpoint?url=https%3A%2F%2Fraw.githubusercontent.com%2Fjeffscottward%2Fdarkfactory%2Fmain%2Fdocs%2Fassessments%2Fcoverage-badge.json)](docs/assessments/coverage-summary.json) [![Agent Friendly Code 98.7/100](https://img.shields.io/badge/Agent%20Friendly%20Code-98.7%2F100-2ea44f)](docs/assessments/agent-friendly-0acd6c2.json) [![Latest release](https://img.shields.io/github/v/release/jeffscottward/darkfactory?display_name=tag&sort=semver)](https://github.com/jeffscottward/darkfactory/releases/latest) [![MIT license](https://img.shields.io/github/license/jeffscottward/darkfactory)](LICENSE) <br> [![OpenSSF Best Practices 100%](https://img.shields.io/badge/OpenSSF%20Best%20Practices-100%25-2ea44f)](https://www.bestpractices.dev/projects/13782) |
| Community and runtime | [![PRs welcome](https://img.shields.io/badge/PRs-welcome-2ea44f)](CONTRIBUTING.md) [![Open issues](https://img.shields.io/github/issues/jeffscottward/darkfactory?label=open%20issues)](https://github.com/jeffscottward/darkfactory/issues) [![Open pull requests](https://img.shields.io/github/issues-pr/jeffscottward/darkfactory?label=open%20pull%20requests)](https://github.com/jeffscottward/darkfactory/pulls) <br> [![Bun 1.3.14](https://img.shields.io/badge/Bun-1.3.14-fbf0df)](https://bun.sh/) [![pnpm 11.16](https://img.shields.io/badge/pnpm-11.16.0-F69220?logo=pnpm&logoColor=white)](package.json) |

DarkFactory is a domain-neutral, Postgres-first application foundation for building AI-assisted products without making an AI provider, business vertical, or optional service part of the core architecture. It combines a public site, authenticated portal, contract-first API, portable PostgreSQL data layer, provider adapters, and an inspectable engineering lifecycle.

The badges above are either live pointers to authoritative sources or versioned assessment results linked to their exact evidence; they are not a production-readiness, deployment, coverage-completeness, or security certification. See [Testing and evidence](docs/testing-and-evidence.md) for the limits and reproducibility contract behind repository claims.

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
| Language and workspace | Civet 0.11.15, Bun 1.3.14 for scripts and TypeScript, Node.js >=22.13 compatibility, pnpm 11.16.0 for packages/workspaces, Turborepo 2.10.6 |
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

| Requirement | Supported version or state | Purpose | Installer behavior |
| --- | --- | --- | --- |
| Host platform | macOS with Homebrew, or Debian/Ubuntu with `apt` and root/`sudo` | Deterministic workstation bootstrap | Uses the existing platform package manager; never installs Homebrew or guesses an unsupported platform |
| Bun | Exactly 1.3.14 | Primary script and TypeScript runtime | Installs the exact user-scoped release when absent or mismatched |
| Node.js | Compatible 22.13 or newer runtime (installer bootstrap target 22.13.1) | Corepack/pnpm, PM2/Portless, Vitest, and measured compatibility paths | Keeps a compatible installed runtime; bootstraps 22.13.1 through Homebrew or pinned `n` 10.2.0 only when Node is missing or too old |
| Corepack and pnpm | Corepack 0.34.7; pnpm 11.16.0 | Sole dependency/workspace manager and lockfile owner | Activates the pinned pnpm release; installs workspace dependencies from the frozen lockfile |
| Python and uv | Compatible Python 3.13 or 3.14; uv 0.11.32 | Graphify and Python-backed repository tooling | Keeps a compatible installed Python; installs the exact user-scoped uv release |
| Docker, Compose, PostgreSQL | Docker and Compose installed; daemon running; isolated PostgreSQL service available | Local integration database | Installs Docker/Compose where supported; an operator must start the daemon before database work |
| PM2 and Portless | PM2 7.0.3; workspace Portless 0.13.0 | Durable named local process and stable HTTPS URL | Installs exact tool/dependency releases; does not start services or trust certificates |
| Varlock | 1.13.0 | Environment validation and injection | Installs the exact release |
| Graphify | `graphifyy` 0.9.2 | Repository graph build/query/verification | Installs the exact Python package through uv |
| Playwright and Chromium | Workspace Playwright 1.61.1 with its compatible Chromium | Browser and accessibility verification | Installs frozen workspace dependencies and the installer-managed browser once |
| Local HTTPS trust | Browser trusts the Portless local certificate authority | Warning-free `https://darkfactory.localhost` | Manual: run `bun run dev:trust`; the installer never changes trust stores |
| Provider/deployment credentials | Required only for an intentionally exercised provider or authorized Cloudflare operation | Optional AI, email, analytics, observability, and deployment paths | Manual and conditional; the installer never inspects accounts or creates credentials |

Provider credentials are optional unless the corresponding provider is being exercised. The local email transport defaults to preview.

## Safe local setup

```bash
git clone https://github.com/jeffscottward/darkfactory.git
cd darkfactory
sh scripts/install-prerequisites.sh
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
bun run db:test:up
varlock run -- bun run db:migrate
```

### Development seed warning

`bun run db:seed` creates predictable development identities (`admin@domain.test`, `alice@domain.test`, and `bob@domain.test`) with the shared password `Development123!`. These accounts and credentials are deliberately unsafe outside a disposable development or test database. The command requires a validated `APP_ENV=development` or `APP_ENV=test` and exactly one out-of-band `--confirm-environment=<development|test>` argument that matches it. Bun may load `APP_ENV` from `.env`; dotenv cannot supply the command-line confirmation.

The package scripts intentionally omit confirmation, so append the matching flag after `--`:

```bash
varlock run -- bun run db:seed -- --confirm-environment=development
varlock run -- bun run db:reset -- --confirm-environment=development
```

`bun run db:reset` is destructive. The matching confirmation proves only that the invocation was explicit; it does not prove `DATABASE_URL` points to a disposable target. Inspect the destination without printing its password, and never seed or reset a shared, staging, customer, or production database.

## Canonical local HTTPS and PM2

The only canonical human-facing local URL is <https://darkfactory.localhost>. Portless owns the hidden port and trusted HTTPS route. PM2 owns one stable process named `darkfactory-web-dev`.

```bash
bun run dev:trust
bun run dev:bindings
bun run dev:https
bun run dev:status
bun run dev:logs
bun run dev:stop
```

`bun run dev:https` is idempotent and starts `portless darkfactory bun run dev` through PM2. Run `bun run dev:trust` first. Use `bun run certs:install` and `bun run certs:generate` only as the documented mkcert fallback when portless trust cannot work; generated certificates and keys stay ignored.

The Cloudflare Worker runtime reads server bindings from the ignored `apps/web/.dev.vars` file rather than inheriting them from PM2. `bun run dev:bindings` validates `.env`, writes a same-directory temporary file with mode `0600`, and atomically replaces the binding file without printing its contents. Regenerate it after changing `.env`; never commit it.

After PostgreSQL, environment values, trust, and the PM2 route are ready, inspect the complete prerequisite report:

```bash
varlock run -- bun run doctor
```

See [Local development](docs/local-development.md) for installation details, lifecycle recovery, and cleanup.

## Feature generator

Always inspect the plan before writing files:

```bash
bun run generate:feature example-name --dry-run
bun run generate:feature example-name
```

The generator accepts one feature name plus optional `--dry-run` and `--json` flags. A generated feature must replace the generic identity everywhere and carry its contract, route registration, persistence, tests, exports, and graph changes. Review the output and run the affected gates; generation is not verification.

## Scripts

| Purpose | Commands |
| --- | --- |
| Development | `bun run dev`, `bun run dev:https`, `bun run dev:status`, `bun run dev:logs`, `bun run dev:stop`, `bun run dev:trust` |
| Certificate fallback | `bun run certs:install`, `bun run certs:generate` |
| Database | `bun run db:generate`, `bun run db:check`, `bun run db:migrate`, `bun run db:seed`, `bun run db:reset`, `bun run db:test:up`, `bun run db:test:down` |
| Build and types | `bun run build`, `bun run types`, `bun run types:check`, `bun run typecheck` |
| Static checks | `bun run lint`, `bun run lint:markdown`, `bun run format:check` |
| Generated contracts | `bun run auth:schema:check`, `bun run api:openapi:generate`, `bun run api:openapi:check` |
| Tests | `bun run test:unit`, `bun run test:integration`, `bun run test:e2e`, `bun run test` |
| Full gates | `bun run verify`, `bun run ci` |
| Graphify | `bun run graph:build`, `bun run graph:update`, `bun run graph:check`, `bun run graph:verify` |
| Operations | `bun run doctor`, `bun run generate:feature` |
| Explicit web deployment | `bun run deploy:web:check`, `bun run deploy:web:preview`, `bun run deploy:web` |

Vitest and Vinext's development, build, and deployment CLIs deliberately run through package-local binaries under Node. These are narrow measured compatibility exceptions: Bun 1.3.14 misloads Vitest's Vite `zod` dependency, its V8 coverage path lacks the `node:inspector` APIs required by `@vitest/coverage-v8`, Vite's development server requires WebSocket events that Bun does not implement, and a Bun-generated Vinext production bundle can report success while returning 404 for authored routes. Bun and Turbo still orchestrate compatible lifecycle and package tasks; pnpm remains the sole package and lockfile owner.

## Testing and evidence

Start the isolated PostgreSQL service and load the test environment before database-backed checks. Playwright starts or reuses the canonical portless route and stores failure material in `playwright-report/` and `test-results/`.

```bash
bun run db:test:up
varlock run -- bun run test:unit
varlock run -- bun run test:integration
varlock run -- bun run test:e2e
varlock run -- bun run verify
bun run db:test:down
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
bun run graph:update
bun run graph:check
bun run graph:verify
```

`graphify-out/` is generated output and is not hand-edited. Build and update replace only Graphify's known generated entries before extraction so stale snapshot-root node identities cannot survive a refresh.

## Capabilities and deployment boundary

The web application builds and deploys only through the official `@vinext/cloudflare` adapter. The package `start` command uses Vite's Cloudflare-faithful production preview rather than Vinext's generic Node wrapper. Stop the canonical development process, regenerate Worker bindings, build, and run `corepack pnpm exec portless darkfactory corepack pnpm --filter @darkfactory/web run start` to preview the built Worker at the configured canonical HTTPS origin. Filesystem email previews are disabled in a production bundle; a real production environment must use its validated Resend configuration. `bun run deploy:web:check` validates adapter setup in dry-run mode without building or deploying. The explicit `bun run deploy:web:preview` and `bun run deploy:web` commands are credentialed Cloudflare operations; no automatic deployment workflow or proof of a completed deployment is claimed here.

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
