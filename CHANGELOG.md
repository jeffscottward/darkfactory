# Changelog

Notable changes to DarkFactory will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and published releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Covers [#36](https://github.com/jeffscottward/darkfactory/pull/36), [#37](https://github.com/jeffscottward/darkfactory/pull/37), [#38](https://github.com/jeffscottward/darkfactory/pull/38) and the follow-up documentation, template and dependency work.

### Added

- `bun run setup`: one idempotent bootstrap that checks the toolchain, installs dependencies, writes `.env` with generated secrets, starts Postgres, migrates, seeds and writes the Worker `.dev.vars`. The toolchain is pinned once in `mise.toml`. (#38)
- `bun run check` (format check, lint, typecheck) and a foreground `bun run dev` over portless HTTPS. (#38)
- Fail-closed `DATABASE_PROVIDER` profiles for `postgres`, `planetscale` and `hyperdrive`, with the Cloudflare Hyperdrive binding passed to request database composition. (#38)
- One request scope for the auth, strict sign-out and oRPC routes (`withRequestScope`, built on `openRequestScope`), with one `503 DATABASE_CAPACITY` response. (#38)
- `x-request-id` on every scoped response, resolved from a well-formed `cf-ray` or a fresh UUID and shared by events, spans and audit records. (#38)
- Private Worker source maps uploaded to Cloudflare. (#38)
- Shared VS Code settings, extension recommendations and launch configs. (#38)
- A Playwright-native browser lane: `webServer`, `globalSetup`, `e2e` and `a11y` projects, SPKI-pinned portless CA trust and per-file database resets. (#37)
- A `brick` role in every workspace `package.json`, and a live package graph (`docs/generated/package-graph.md`) that `docs:generate` derives from them. `docs:check` fails when the graph is stale, a role is missing or a dependency breaks the role rules.
- Role skills for pm, architect, backend, frontend, qa, security, scalability and release in `.agents/skills/`, also exposed to Claude Code through `.claude/skills`.
- Guides: getting started, testing, capabilities (add or swap a provider), deploy, debugging and the operator plane.
- `bun run init`: renames the template (scope, slug, domain, repository URLs, env prefixes, database names, LICENSE holder), drops instance-only history and removes itself; a renamed copy passes check and tests.
- Weekly grouped Dependabot updates for npm packages with a release-age cooldown, alongside the existing GitHub Actions group.

### Changed

- All sources are strict TypeScript; packages export TypeScript source, each package typechecks with `tsc`, and Biome lints all code. The runtime is Node 24 LTS. (#37)
- CI runs four required lanes (core, coverage, integration, browser) on pull requests and manual dispatch only, and the pre-push hook runs `verify:prepush` with the same unit set as CI. (#36)
- The capability manifest is truthful and registry-driven: provider enums come from each brick's adapter registry, one loader parses `capabilities.yaml`, and `doctor` derives its probes from it. (#38)
- `packages/jobs` owns the operator workflow schema and repository; the operator plane is an opt-in brick and uses the shared request scope. (#38)
- Biome is configured in `biome.jsonc` with a rationale per rule; `doctor` parses `wrangler.jsonc` with `jsonc-parser`. (#38)
- The trusted theme load retries a database-capacity 503 under one deadline instead of rendering an indeterminate theme. (#38)
- Project the safe active-session identity and owner-scoped dashboard summary from one authenticated oRPC context, and reuse identical portal and administration session checks within one server request.
- Toolchain and dependencies: native TypeScript 7 for typechecks (the compiler API stays pinned as `typescript-api` for tooling), Vitest 5, Biome 2.5 with Ultracite 7, better-auth 1.7, React 19.3, Vite 8.3, Playwright 1.63, portless 0.15, wrangler 4.142 and current patch releases across the catalog.
- README, AGENTS, ARCHITECTURE, CONVENTIONS, CONTRIBUTING and the security guide are rewritten to match the code. `CLAUDE.md` is a symlink to `AGENTS.md`. Historical specs, evidence and assessments moved to `docs/archive/`.

### Removed

- PM2, Varlock, Corepack and the prerequisite installer, replaced by `mise` and `bun run setup`. (#38)
- The orphan `packages/shared` and `packages/storage` packages and the `capability:add` scaffolder. (#38)
- The custom E2E harness (about 26,800 lines), replaced by Playwright built-ins. (#37)
- Committed coverage and graph artifacts, the hosted security preflight, change-detector tests and copied CI shell scripts. (#36)
- `docs/generated/architecture-inventory.json`, replaced by the package graph, and the superseded testing, local-development, capabilities-and-deployment and Hyperdrive guides.

### Fixed

- A request connection-slot leak behind a recurring browser-test flake. (#37)
- The feature generator's migration, now covered by a real-Postgres test. (#36)
- The Drizzle snapshot, realigned with an empty custom migration. (#38)
- Handlers that assembled their own database and auth returned inconsistent errors on capacity exhaustion; the shared scope maps it once. (#38)

### Security

- A client-supplied `x-request-id` is never trusted. (#38)
- All open Dependabot alerts patched. (#36)
- Remove request-supplied cookies from dashboard transport when no trusted session cookie is available.

## [0.2.1] - 2026-07-28

### Changed

- Aligned every workspace package manifest and the capability, OpenAPI, declaration, architecture, and graph metadata to version `0.2.1`.
- Persist complete Cloudflare Worker invocation logs without traces and enforce a 500 ms paid-runtime CPU ceiling as a fail-safe.

### Fixed

- Prevent speculative Next.js prefetches for authenticated portal, account, and administration links so hidden navigation trees do not spend Worker CPU before user intent.
- Resolve exact `GET /api/auth/get-session` status gating and response-token sanitization in one pass, while preserving fail-closed handling for inactive or malformed present sessions.
- Prevent staging Worker deployments from inheriting and temporarily reassigning the production custom domain.

## [0.2.0] - 2026-07-27

### Added

- Added Bun 1.3.14 as the primary script and TypeScript runtime while retaining supported Node.js and pnpm workspace paths.
- Added deterministic prerequisite installation for supported macOS and Debian/Ubuntu hosts, including pinned development, browser, graph, environment, and local database tooling.
- Added an exact four-metric V8 coverage gate and expanded contract, integration, browser, accessibility, lifecycle, generator, and operations coverage.

### Changed

- Aligned local development, CI, documentation, repository adapters, and Graphify lifecycle commands around the Bun-first toolchain.
- Refreshed repository-health and OpenSSF Best Practices evidence without treating optional score optimization as a release prerequisite.

### Fixed

- Secured same-Worker request-local dispatch for authentication, oRPC, theme, portal, administration, and dashboard requests while preserving request identity, trusted cookies and origins, abort deadlines, Cloudflare cleanup ownership, and client-IP rate limiting.
- Added PlanetScale Postgres compatibility for system certificate roots and bounded database query execution.
- Hardened portable CI startup and teardown across Corepack, pnpm selection, Linux browser readiness, Miniflare isolation, Cloudflare Worker preview, and Portless execution.

### Security

- Added bounded staging and release security gates, credential-safe evidence handling, and stricter redaction of secrets from reports, previews, and failure artifacts.
- Hardened database, authentication, email, process-lifecycle, filesystem, and generated-feature boundaries against unsafe overrides, path escapes, leaked credentials, and incomplete cleanup.

## [0.1.0]

### Added

- Domain-neutral public, authentication, portal, account, and administration surfaces.
- Contract-first oRPC API, generated OpenAPI, Better Auth integration, and PostgreSQL/Drizzle persistence.
- Provider ports for AI, email, analytics, observability, jobs, state, and storage capabilities.
- Reproducible local development, feature generation, Graphify lifecycle, and agent-specific repository adapters.
- Unit, contract, operations, integration, browser, accessibility, and deterministic coverage verification lanes.
- Contribution, support, vulnerability-reporting, release, and repository-health policies.

### Security

- Added secret-safe environment boundaries, isolated test infrastructure, private vulnerability reporting, secret scanning and push protection, dependency review, CodeQL for JavaScript/TypeScript and Actions, and OpenSSF Scorecard analysis.
- Updated direct and transitive build dependencies to resolve eight published advisories: [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99), [GHSA-g7r4-m6w7-qqqr](https://github.com/advisories/GHSA-g7r4-m6w7-qqqr), [GHSA-r5fr-rjxr-66jc](https://github.com/advisories/GHSA-r5fr-rjxr-66jc) / CVE-2026-4800, [GHSA-f23m-r3pf-42rh](https://github.com/advisories/GHSA-f23m-r3pf-42rh) / CVE-2026-2950, [GHSA-xxjr-mmjv-4gpg](https://github.com/advisories/GHSA-xxjr-mmjv-4gpg) / CVE-2025-13465, [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj) / CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, and CVE-2026-35591, [GHSA-pm4m-ph32-ghv5](https://github.com/advisories/GHSA-pm4m-ph32-ghv5), and [GHSA-mh99-v99m-4gvg](https://github.com/advisories/GHSA-mh99-v99m-4gvg). A current `pnpm audit` reports zero known vulnerabilities.
- No published DarkFactory-specific security advisory or NVD CVE record matching the project name or repository was identified when this first release was prepared. This bounded statement is not a claim that the software is vulnerability-free.

[Unreleased]: https://github.com/jeffscottward/darkfactory/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/jeffscottward/darkfactory/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jeffscottward/darkfactory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jeffscottward/darkfactory/releases/tag/v0.1.0
