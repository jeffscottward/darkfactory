# Changelog

Notable changes to DarkFactory will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and published releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

No changes have been recorded for a release after 0.1.0.

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

[Unreleased]: https://github.com/jeffscottward/darkfactory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/jeffscottward/darkfactory/releases/tag/v0.1.0
