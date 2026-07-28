# Changelog

Notable changes to DarkFactory will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and published releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Project the safe active-session identity and owner-scoped dashboard summary from one authenticated oRPC context, removing `DashboardPage`'s separate session lookup.
- Reuse identical portal and nested-administration session checks within one React server request.

### Security

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
