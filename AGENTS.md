# DarkFactory Agent Constitution

DarkFactory is a domain-neutral, AI-native application foundation. It is opinionated about developer experience and intentionally unopinionated about business domains. This file is executable policy for every contributor and agent. Later decisions override earlier records.

Read `ARCHITECTURE.md` and `CONVENTIONS.md` before changing the repository.

## Requirement language

Classify every requirement before implementing it:

- **Core** — present in every DarkFactory project.
- **Capability** — optional, explicitly enabled, and removable through its manifest and adapter boundary.
- **Convention** — a rule contributors and agents must follow.
- **Implementation** — the current replaceable mechanism; never mistake it for an architectural invariant.

Do not promote an Implementation to Core or add a Capability implicitly.

## Work sequence

1. Read the relevant contracts, feature boundary, tests, and architecture docs.
2. Before broad exploration, query the Graphify map with `graphify query`, `graphify path`, or `graphify explain` when `graphify-out/graph.json` exists.
3. If the map is missing, generate it with the repository graph script or `graphify extract .`; do not reconstruct the repository from repeated broad searches.
4. Define or update the observable contract and its failing test before implementation. Documentation-only and non-behavioral changes do not need artificial tests.
5. Implement the smallest complete vertical change. Reuse existing code; never create a second convention beside an existing one.
6. Run the narrowest relevant check while iterating, then the repository lifecycle gates required for the change.
7. Update Graphify after adding a feature, moving public symbols, changing contracts or database relationships, or materially changing architecture. Use the repository update script or `graphify extract . --update`, then verify the map.
8. Update architecture, generated OpenAPI, and enabled internal documentation when their source contracts changed.
9. Commit only the focused change. After pushing, follow GitHub Actions to a terminal state; investigate and fix repository-owned failures before asking the user. Stop only when checks are green, no checks exist, or an exact external blocker is documented.

For long-running work, create or update the root `.omp-status.md` after meaningful edits or verification and before handoff, pause, or context reset. Keep it concise: timestamp, thread, goal, branch, changed files, completed work, last verification, next action, and stop condition.

## Source and module rules

- Author application, feature, UI, service, schema, adapter, script, and test source in **Civet**.
- Use TypeScript only where tooling requires an exact file or format: tool configuration, generated code, environment declarations, Cloudflare bindings, database migration artifacts, third-party entrypoints, or externally published compatibility surfaces.
- Never convert authored application code to TypeScript for familiarity. Never manually edit generated TypeScript.
- Build tiny, independently composable functions and components. Group very small related units in a local `index.civet`; split files only when reuse, independent testing, a meaningful boundary, or growth makes the split clearer.
- Keep business behavior out of route handlers, CLI handlers, framework entrypoints, and adapters.
- Organize application work as feature-vertical slices. A feature owns its UI, state, contract use, orchestration, feature-local server code, and tests. Move code to a shared package only after it is genuinely cross-feature.
- Use named exports and explicit local public surfaces. Do not deep-import another feature's internals or create broad barrels that conceal dependencies.
- Use an existing feature generator when present. A generated feature must update names, contracts, route registration, database objects, tests, and Graphify without leaving the generic stub's identity behind.

## Contracts, data, and providers

- Define the oRPC contract, input/output schemas, authorization expectations, and typed errors before implementing a handler.
- All application API access crosses oRPC. Do not create a parallel ad hoc REST, server-action, or direct database path. OpenAPI is generated from the same contracts when enabled.
- Access PostgreSQL through Drizzle stores/repositories and migrations. Do not bypass Drizzle with feature-local SQL unless a measured need is documented and the database package owns the exception.
- Use this decision order for data-related needs: PostgreSQL core feature → proven PostgreSQL extension/pattern → external infrastructure only with a compelling measured reason.
- Do not add Redis, RabbitMQ, or another data system as a default or speculative fallback. New infrastructure must justify another source of truth, failure mode, credential, deployment, monitoring surface, and agent context.
- Define small ports at external boundaries; keep provider names in adapters. Domain and application code must not import Cloudflare, PlanetScale, PostHog, Groq, Resend, R2/S3, Celery, or another vendor SDK.
- Keep framework dependencies pointing inward: framework → application → domain; adapters implement application ports.
- Use Effect only for infrastructure/service boundaries with meaningful resource, concurrency, retry, timeout, cancellation, configuration, or typed-failure complexity. Use XState for explicit lifecycles and persist durable transitions in PostgreSQL. Use Zustand only for ephemeral local UI state, never server data, URL state, or durable preferences.

## Events, observability, and errors

- Emit stable, meaningful application events through evlog. Do not scatter provider calls or unstructured console output through features.
- Send product analytics through the analytics port and PostHog adapter. Use OpenTelemetry for traces, metrics, and technical logs. Core code imports neither provider directly.
- Preserve causal and request context, but never log secrets, credentials, session tokens, raw sensitive profile fields, or full provider payloads.
- Model expected failures as typed domain/application errors and map them once at contract boundaries. Never swallow errors or expose internal stack details to clients.

## Lifecycle gates

The canonical lifecycle is:

`develop → typecheck → compile/build → unit → integration → e2e → lint → format check → Graphify update/verify → docs → commit → pre-push → CI → deployment`

Root pnpm scripts and Turborepo tasks are the source of truth. `pnpm run ci` must mirror GitHub Actions. Never use bare `pnpm ci` as a gate: pnpm reserves it for clean installation. Pre-commit hooks stay fast and focused; pre-push covers the wider validation required before CI. Never bypass a failing gate, disable a test, or skip hooks merely to make a change pass.

Use pnpm for packages, workspaces, and the sole lockfile. Turborepo is the root task graph. Bun may run a compatible local script only when the repository explicitly supports it; it is not a second package manager.

## UI constitution

- Maintain two domain-neutral surfaces: a refined public site and a practical authenticated portal. Do not invent a business-specific sitemap, entities, metrics, or workflow.
- Treat `design-system/darkfactory/MASTER.md` as the authoritative UI specification and `.impeccable.md` as persistent design context. Read both before designing or implementing an interface; page-specific design files may narrow but not silently replace the Master.
- Use <https://www.squarespace.com/> as a continual public-site reference for editorial restraint, hierarchy, spacing, imagery, and polished responsive composition. It inspires patterns; do not copy layouts, copy, branding, assets, or trade dress.
- Use <https://ui.shadcn.com/blocks> as a continual authenticated-portal reference for proven shells, navigation, forms, tables, settings, account, and administration patterns. It inspires composition; do not copy a block wholesale or let examples define the product domain.
- All typography is sans serif. The default direction is Manrope for display/headings and Public Sans for body/UI; never introduce serif typography, Inter, Roboto, Arial, or Open Sans.
- Build with Tailwind and shadcn tokens. Support light, dark, and system modes plus the ten defined color palettes; reject dark-only design and generic purple/cyan glowing “AI” aesthetics.
- Preserve visible keyboard focus, semantic structure, labels, contrast, and minimum 44×44 px interactive targets. Verify responsive behavior at 375, 768, 1024, and 1440 px.
- Keep loading and interaction states stable: reserve dimensions and never use jump, bounce, scale, or hover translation that shifts layout.
- Use meaningful icons from one coherent outline family. Do not use emoji or decorative icons as structural interface controls.
- Do not expose a reduced-motion preference in the user profile. Still honor CSS `prefers-reduced-motion` and avoid motion that blocks comprehension.
- Generic multi-page placeholder content may use `placehold.co`, fictional avatars, and a fake favicon. Use neutral, obviously fictional identities and `.test` email addresses. Never use a real person's data or imply a business vertical.

## Security and repository hygiene

- Never commit or print secrets, default production passwords, private certificate keys, tokens, `.env` values, provider payloads, or personal data.
- Seeded identities and credentials are development-only. Production must reject development seeds and defaults.
- Keep generated local HTTPS private keys ignored; commit only safe setup instructions and public examples.
- Do not add dependencies, infrastructure, flags, abstractions, aliases, compatibility shims, or “future-proofing” without an active requirement.
- Do not duplicate code, suppress failures, edit unrelated files, or bundle cleanup into a functional commit.
- Focused commits contain one coherent change and its contract, tests, generated artifacts, Graphify update, and directly affected documentation.
