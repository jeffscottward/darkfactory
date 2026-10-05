# Changelog

Notable changes to DarkFactory will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and published releases will use [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Linux support for the operator plane. OMP and git run in a bubblewrap sandbox with the same filesystem scope as the macOS `sandbox-exec` profile: scopes read-only, writable only in implementation runs. The worker checks `bwrap` and user namespaces before each run and fails closed. See `docs/operator.md`.
- On Linux the agent and git cannot start other processes, as on macOS. bubblewrap loads a seccomp filter under which `fork`, `vfork` and any `clone` that is not a thread fail with `EPERM`; threads still work. `git worktree add`, which runs git itself, is the one exception. Before each run the worker checks that the filter stops a test process from starting, and fails closed; the filter supports x86_64 and arm64. See `docs/operator.md#platform-support`.
- On Linux the agent has no network and holds no credentials. Each run reaches exactly one model through a relay to a local `omp auth-gateway`, which gets credentials from `omp auth-broker`. DarkFactory pins no model: `WORKFLOW_OMP_MODEL` names yours, and planning, implementation and review all use it. Configure it with `WORKFLOW_OMP_GATEWAY_URL` and `WORKFLOW_OMP_GATEWAY_TOKEN_FILE`; the worker refuses to start with a gateway but no model. Before each run the worker checks the gateway, the model and `nsenter`, and fails closed. See `docs/operator.md#models-and-credentials`.
- The Docker verifier reaches rootless Docker, or any local daemon, through `DOCKER_HOST`. Only local unix sockets are accepted.

### Changed

- Design system: DarkFactory now looks and behaves like shadcn/ui (new-york-v4). Themes use shadcn's exact CSS variables (`background` … `sidebar-ring`, `--radius`) through Tailwind v4 `@theme inline`; `success`, `warning`, `info` and `destructive-foreground` are documented extensions, and the older names (`surface`, `primary-subtle`, …) are derived from them. Fonts are Geist Sans and Geist Mono (bundled; Manrope and Public Sans are removed). Defaults equal shadcn: radius `0.625rem`, `--spacing` `0.25rem`, Tailwind type scale, `text-sm` UI text. Button, Input, Textarea, Label, Card (new `CardAction`), Badge, Separator, Skeleton, Avatar, Tabs (new `line` variant), DropdownMenu (new `DropdownMenuShortcut`, destructive items) and Dialog use shadcn class strings; a new `@darkfactory/ui/client/sidebar` ports the shadcn Sidebar. Controls keep the 44px touch-target box around shadcn-sized chrome; inputs are 44px tall. See `design-system/darkfactory/MASTER.md` sections 3 and 7.
- Portal shell: shadcn sidebar-07 / dashboard-01 anatomy. An inset sidebar (16rem) collapses to icons (3rem) with the trigger, the rail or Ctrl/⌘+B. Below 768px it is a drawer styled like the shadcn sheet, built on the native popover API so it works before hydration. Sign-in, sign-up, password and verification pages use the shadcn login card. The site header has the trigger, a separator, the page title and the user menu.
- Appearance: System plus eleven themes, each a shadcn variable set: Default Light and Default Dark (shadcn Neutral), Graphite (#333 gray), Dracula, Monokai, Tokyo Night, One Dark, Night Owl, Synthwave '84, GitHub Dark and GitHub Light, with official accents. Users also set font size (Small, Default, Large), density (Compact, Default, Comfortable) and roundness (None, Small, Medium, Large; Medium is the new default). All four apply live, render on the server without a flash and persist in the `darkfactory-theme` cookie, localStorage (`darkfactory.anonymous-ui.v2`) and `user_preferences`. Migration `0009_appearance_preferences` replaced `mode` and `color_scheme`; migration `0010_shadcn_themes` moves retired theme names (Catppuccin, Gruvbox, Nord, Everforest, Rosé Pine, Kanagawa) to System and makes Medium the default radius. A retired name in a cookie or API payload also reads as System. To add a theme, see "Add a theme" in the Master.
- Portal navigation: the sidebar shows Overview (the `/dashboard` page) and a Features group with Feature items and generated features. The user menu has only Settings and Sign out. Settings is one page with link tabs: Account (`/settings/account/profile`, `address`, `preferences`, `security`), Administration (`/settings/administration`, admins only) and Appearance (`/settings/appearance`, with theme, font size, density and roundness as radio groups instead of user-menu submenus). Old URLs redirect: `/account` and `/account/*` to the matching Account section, `/admin` and `/admin/users` to Administration. Spacing and type scale with the density and font size settings; touch targets stay 44px.
- `PageHeader` accepts `description` and `eyebrow` only with `variant="public"`; `SectionHeader` has no `description`.
- Portal pages have no filler text: page headers show the title and actions only, explanatory paragraphs are gone, and empty results show one compact row (`InlineNotice`) instead of a large empty-state block. Error messages and safety notices stay. Public pages keep their content with tighter spacing.
- Implementation artifacts record file modes as git does (0644, or 0755 when executable), whatever the host umask.
- vinext and `@vinext/cloudflare` 1.0.0 (stable), up from 1.0.0-beta.13 and beta.11. `bun run doctor` expects the new versions, and an invariant test keeps its expected versions equal to the pnpm catalog. (#51)
- Bun 1.4.2, up from 1.3.14. Under Bun 1.3.14 the worker could miss a child process's exit after it had run children with extra pipes (fd 3 and up), as its bubblewrap sandbox does, and the model relay's cleanup then waited forever; not reproduced on 1.4.2. Run `mise install`. The verifier image now builds on `oven/bun:1.4.2`: rebuild it and pin its new digest; see [Rebuild the verifier image](docs/operator.md#rebuild-the-verifier-image).

### Fixed

- The operator worker starts with the optional `WORKFLOW_*` keys left empty, as `.env.example` ships them; it used to exit, and its CLI printed nothing. It now prints configuration errors (the key, never its value) and only the type of any other startup error.
- Dev page loads were slow: `lucide-react` was excluded from client dependency pre-bundling, so each cold load fetched about 1,900 icon modules (12.6 MB). It is pre-bundled again: requests per page fell from 2,083 to 216 and time to network idle from 2.4 s to 0.5 s. Production was not affected (31 requests, first contentful paint about 0.1 s). Font files are no longer inlined as base64 in the stylesheet.
- `bun run dev` and `bun run operator:dev` start again: vinext 1.0 takes Vite's `--host`, not `--hostname`. A test now checks the forwarded flags against the installed CLI. (#51 regression)
- On Linux, the verifier container (uid 65532) can read its workspace. The checkout followed the worker's umask, so under a restrictive umask such as 077 it could read nothing.
- The Docker verifier passes on a real workspace; before, every run failed. Its checks now find `node`, the workspace copy gets the image's dependencies and its own git repository, `/tmp` allows executables, and a passing check prints only its ID, so a build no longer overflows the 32 KiB result. The task limit, which counts threads, rises from 256 to 512. `scripts/ci/test-invariants.test.ts` started about 20 `vitest list` processes at once; it now runs at most four (two under the verifier's 2-CPU quota), and a failing list no longer leaves others running. Rebuild the image and pin its new digest; see [Rebuild the verifier image](docs/operator.md#rebuild-the-verifier-image).
- The model relay's cleanup waits at most 5 s for its helper process to exit, so a lost exit can no longer hang the operator worker.

## [0.3.1] - 2026-09-29

Security fix release. Covers [#40](https://github.com/jeffscottward/darkfactory/pull/40), [#43](https://github.com/jeffscottward/darkfactory/pull/43), [#46](https://github.com/jeffscottward/darkfactory/pull/46), [#47](https://github.com/jeffscottward/darkfactory/pull/47) and [#48](https://github.com/jeffscottward/darkfactory/pull/48). If you built the operator verifier image with 0.3.0 or earlier, follow the rebuild steps under Security.

### Changed

- Pre-push takes about 37 s instead of about 80 s. The init clone acceptance test (clone, init, install) moved to its own `acceptance` Vitest project, which the CI coverage lane runs with coverage; run it locally with `bun run test:acceptance`. (#48)
- Test tooling: jsdom 30 and `@testing-library/react` 16.3.3. (#43, #40)

### Fixed

- The pre-push hook accepts Git's empty input, which Git sends for "Everything up-to-date" and for pushes it already rejected (stale lease, non-fast-forward). It used to fail with "expected four fields" and hide Git's own message. (#47)
- The verifier's `build-web` check points at `apps/web`'s `vinext` binary, and the image makes its dependencies readable for the runtime user regardless of the builder's umask. (#47)
- Two load-dependent test flakes (#46): an isolated RSC build test now runs the plugin hook that initializes `es-module-lexer`, and an operator test waits for run details to load.

### Security

- The operator verifier image leaked local secrets. Its `Dockerfile.dockerignore` re-included whole `apps/` and `packages/` subtrees, so each app's `.dev.vars` (which holds every non-empty value from `.env`), other `.env*` files and host `node_modules` were copied into the image. `.dev.vars` stayed root-only in the image, so code under verification (uid 65532, no network) could not read it; anyone with access to the image can. World-readable `.env*` files there were readable in the container, with `/output` as the only way out. The allowlist now names files only, and an invariant test rejects directory re-includes. (#47)
- The verifier image fetches pnpm as a checksum-pinned registry tarball instead of an unpinned `npm install --global`, and its Bun base defaults to a digest-pinned `oven/bun:1.3.14`. `DARKFACTORY_VERIFIER_BASE_IMAGE` is now an optional override, which must still be digest-pinned. (#47)

To remove the exposure, rebuilding is not enough: the worker keeps running the image pinned in `.env`.

1. Run `pnpm --filter @darkfactory/jobs verifier:image:setup`, set the printed digest as `WORKFLOW_VERIFIER_IMAGE_DIGEST` in `.env`, then restart `worker:pilot`.
2. Delete every other verifier image. A rebuild untags the old one, so list them by label: `docker image ls --filter label=org.darkfactory.verifier.identity`, then `docker image rm` each ID except the new digest. Remove old images from any registry too.
3. Rotate the credentials from `.env` if an old image was exported, pushed or shared, and any real secrets in other `.env*` files under `apps/` or `packages/`.

## [0.3.0] - 2026-09-29

Covers [#36](https://github.com/jeffscottward/darkfactory/pull/36), [#37](https://github.com/jeffscottward/darkfactory/pull/37), [#38](https://github.com/jeffscottward/darkfactory/pull/38), [#39](https://github.com/jeffscottward/darkfactory/pull/39), [#42](https://github.com/jeffscottward/darkfactory/pull/42) and [#44](https://github.com/jeffscottward/darkfactory/pull/44).

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

- `init --fresh-history` (also for shallow or detached clones) and `init --without-operator`, which removes every `agent-sdlc` brick; the quickstart now starts from `gh repo create --template`. (#44)
- A reference dashboard view-model (`apps/web/src/features/dashboard/view-model.ts`) for headless data-to-presentation mapping, and pointer headers (`What / Used by / See`) on central modules. (#44)
- `docs:check` verifies real imports against declared bricks, requires a one-line purpose per package, and resolves backticked repository paths and `path#symbol` references in Markdown. `knip` gates dead code and unused dependencies. (#44)

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

- Coverage runs in parallel and CI builds once, in the browser lane. `bun run test` runs the database suites against the test database on a normal developer `.env`. (#44)
- Operator workflow state moved from `@darkfactory/state` to `@darkfactory/jobs`; vinext moved to 1.0.0-beta.13, and the E2E fixture gate now reads Worker bindings instead of a leaked host `NODE_ENV`. (#44)

### Removed

- Speculative capabilities that were never installed (Celery/Flower, Mintlify, Uptime Kuma, GlitchTip, R2, Memori, Postgres extensions, TanStack devtools) from the manifest, environment schema and API projection; they are listed as roadmap candidates in `docs/capabilities.md`. (#44)
- PM2, Varlock, Corepack and the prerequisite installer, replaced by `mise` and `bun run setup`. (#38)
- The orphan `packages/shared` and `packages/storage` packages and the `capability:add` scaffolder. (#38)
- The custom E2E harness (about 26,800 lines), replaced by Playwright built-ins. (#37)
- Committed coverage and graph artifacts, the hosted security preflight, change-detector tests and copied CI shell scripts. (#36)
- `docs/generated/architecture-inventory.json`, replaced by the package graph, and the superseded testing, local-development, capabilities-and-deployment and Hyperdrive guides.
- Root scripts `ci`, `types`, `types:check`, `coverage:check`, `coverage:generate`, `coverage:update`, `test:coverage`, `typecheck:database-integration`, `verify:graph`, `capability:add`, `dev:https`, `dev:logs`, `dev:status` and `dev:stop`; `api:openapi:check` and `api:openapi:generate` are now `openapi:check` and `openapi:generate`. (#36, #38, #44)

### Fixed

- A request connection-slot leak behind a recurring browser-test flake. (#37)
- The feature generator's migration, now covered by a real-Postgres test. (#36)
- The Drizzle snapshot, realigned with an empty custom migration. (#38)
- Handlers that assembled their own database and auth returned inconsistent errors on capacity exhaustion; the shared scope maps it once. (#38)

### Security

- A client-supplied `x-request-id` is never trusted. (#38)
- All open Dependabot alerts patched. (#36)
- Remove request-supplied cookies from dashboard transport when no trusted session cookie is available.
- `fflate` raised to 0.7.5 for GHSA-px8p-9vwx-vf98 (an infinite loop on malformed ZIP64 archives). (#44)

### Upgrading an existing 0.2.x checkout

1. Stop the old PM2 processes, which hold the `darkfactory.localhost` route: `pm2 delete darkfactory-web-dev darkfactory-operator-dev`.
2. Copy anything you still need from `.env.schema` into `.env`, then run `mise install && bun run setup`.
3. Delete generated Civet leftovers: `find . -name '*.civet.d.ts' -not -path '*/node_modules/*' -delete`.
4. Copy ignored local files that an older commit tracked (for example `.omp-status.md`) out of the repository before checking out a pre-0.3.0 commit; Git overwrites them.

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

[Unreleased]: https://github.com/jeffscottward/darkfactory/compare/v0.3.1...HEAD
[0.3.1]: https://github.com/jeffscottward/darkfactory/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/jeffscottward/darkfactory/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/jeffscottward/darkfactory/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/jeffscottward/darkfactory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/jeffscottward/darkfactory/releases/tag/v0.1.0
