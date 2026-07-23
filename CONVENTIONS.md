# DarkFactory Conventions

These conventions keep DarkFactory predictable for people and AI agents. `AGENTS.md` defines mandatory execution policy; `ARCHITECTURE.md` defines boundaries and decision rationale.

## Naming

| Item | Convention | Example |
|---|---|---|
| Directories and authored files | kebab-case | `feature-stub/`, `account-menu.civet` |
| Civet functions and values | camelCase; verb-first for actions | `createFeatureItem`, `parseInput` |
| Components, classes, types, schemas exposed as types | PascalCase | `FeatureCard`, `FeatureItem` |
| Constants and environment variables | UPPER_SNAKE_CASE | `DEFAULT_PAGE_SIZE`, `DATABASE_URL` |
| Boolean values | `is`, `has`, `can`, or `should` prefix | `isEnabled`, `canManageUsers` |
| oRPC procedures | stable noun/verb names inside a feature namespace | `featureItem.create` |
| Application events | lowercase dotted namespace and past-tense fact | `feature-item.created` |
| Routes | lowercase kebab-case; nouns for resources | `/account/preferences` |
| PostgreSQL objects | snake_case, explicit plural tables | `feature_items`, `owner_id` |
| Tests | subject plus `.test.civet`; e2e journey plus `.spec.civet` if the runner requires it | `feature.service.test.civet` |

Use domain-neutral names in the foundation. Do not encode a sample company, industry, funnel, trading concept, or vertical into shared APIs or navigation.

## Decomposition and file size

- Start with small pure functions and independently composable components.
- Keep tiny related units together in a focused `index.civet`; a four-line function does not require a four-line file.
- Split when a unit gains independent reuse, independent tests, a meaningful feature/domain/provider boundary, or enough growth that scanning becomes difficult.
- A file that mixes transport, domain logic, persistence, and provider calls must be split by responsibility regardless of length.
- File size is a signal, not a quota. Do not create arbitrary line limits or fragment a cohesive unit to satisfy a metric.
- Scripts compose `parse → validate → plan → apply → verify → report`; CLI handlers contain no business logic.
- React components compose primitives and extracted behaviors. Do not duplicate or wrap a shadcn primitive without a concrete project-level purpose.

## Civet and TypeScript boundaries

Author `.civet` for application logic, features, React UI, contracts, schemas, services, adapters, scripts, and tests.

Use `.ts`/`.tsx` only when required by a tool, platform, generator, publication target, or exact filename convention, including `vite.config.ts`, Vitest/Playwright configuration, `alchemy.run.ts`, `drizzle.config.ts`, environment declarations, generated OpenAPI clients, generated Cloudflare bindings, and migration artifacts. Keep compatibility files thin and delegate into Civet when possible.
- Register `@danielx/civet/vite` in the Vite compatibility configuration and include `civet` in vinext/Next route `pageExtensions`; vinext does not discover `.civet` routes by default.
- Pin and verify a mutually compatible Node, Vite, React/RSC, vinext, and Civet toolchain during implementation. Exact versions are Implementation, not architectural invariants.

Never:

- choose TypeScript merely because it is more familiar;
- hand-edit generated TypeScript;
- maintain equivalent Civet and TypeScript implementations;
- let a compatibility entrypoint accumulate application behavior.

## Imports and exports

- Prefer named exports. Use a default export only when a framework or tool requires it.
- Each feature/package exposes a deliberate local public surface through its `index.civet` or documented entrypoint.
- Import another feature or package through that public surface; never deep-import internals.
- Keep local barrels narrow. Avoid repository-wide barrels, circular re-exports, and re-exports that hide ownership.
- Import domain/application abstractions, not provider implementations. Wire adapters only in composition roots.
- Remove obsolete exports when moving a symbol; do not leave aliases or compatibility shims unless an external contract explicitly requires them.

## Feature verticals

A feature may contain:

```text
feature-name/
├── index.civet
├── feature.contract.civet
├── feature.schema.civet
├── feature.service.civet
├── feature.store.civet          port or feature repository interface
├── feature.events.civet
├── feature.machine.civet        only for a real lifecycle
├── feature.state.civet          only for local UI state
├── components/
├── client/
├── server/
└── tests/
```

Use only the files the feature needs. The structure is a boundary vocabulary, not mandatory empty scaffolding. Keep feature-specific behavior in the vertical; promote a unit to a package only when multiple real consumers share its contract.

## Contracts, routes, and data

- Write schema, contract, typed success result, typed failure result, and authorization expectation before the implementation.
- oRPC contracts are the sole API definition. Generate OpenAPI and clients from them; do not maintain parallel handwritten specifications.
- Route and procedure handlers parse transport context, invoke one application operation, and map its result. They do not contain domain rules or direct database/provider calls.
- Validate untrusted input at the boundary and preserve validated types inward. Validate external provider output before it enters application code.
- Use Drizzle stores/repositories in the database package. Keep transactions explicit at the application boundary that owns the operation.
- Make schema changes through reviewed migrations. Never mutate production schema at application startup.
- Use UTC timestamps, explicit nullability, stable identifiers, and database constraints for invariants the database can enforce.
- PostgreSQL owns durable state. Query tooling owns server cache; the URL owns shareable navigation/filter state; Zustand owns only ephemeral local UI state.
- Prefer PostgreSQL core, then an extension/pattern, before proposing external data infrastructure. Record the measured reason for every exception.

## Errors, events, and logging

- Represent expected failures with stable typed domain/application errors. Include safe machine-readable codes and actionable messages.
- Map errors once at the oRPC boundary. Do not leak SQL, provider responses, stack traces, file paths, or secrets to clients.
- Catch only when adding context, translating an error, compensating, or recovering. Preserve the cause and never silently continue.
- Events describe facts that already happened. Keep payloads minimal, typed, versionable, and free of secrets or unnecessary personal data.
- Emit semantic application events through evlog. Do not use ad hoc console logging for operational behavior.
- Product events go through the analytics port/PostHog adapter. Traces, metrics, and technical logs use OpenTelemetry. Provider SDKs remain in adapters.
- Attach request/trace IDs and relevant entity IDs where safe. Redact credentials, cookies, authorization headers, tokens, addresses, dates of birth, and raw user/provider payloads.

## State and effects

- Use plain Civet functions for pure domain logic.
- Use XState only for explicit states and transitions; persist durable transition history in PostgreSQL.
- Use Zustand for local view coordination such as open panels, unsaved UI state, or temporary filters—not fetched server data or durable preferences.
- Use Effect when resource safety, typed failure composition, retry/timeout policy, cancellation, or concurrency justifies the added model.
- TanStack Devtools is development-only.

## Testing

- New behavior and bug fixes start with a test that fails for the intended observable reason. Do not write source-text, implementation-detail, or tautological tests.
- Unit tests cover pure rules, schemas, state transitions, typed errors, and boundary cases.
- Integration tests cover real contracts, Drizzle repositories, migrations, authentication boundaries, transactions, and adapters against controlled local dependencies.
- End-to-end tests cover critical user journeys through the rendered application, including authentication and the generic feature flow.
- Keep tests deterministic, isolated, parallel-safe, and independent of production credentials or live providers. Use explicit test/local adapters, never silent mocks in production code.
- A regression test must fail if the plausible bug returns. Test names describe behavior and outcome.
- Run the narrow test while iterating, then the applicable root lifecycle. `pnpm ci` and GitHub Actions must remain equivalent.
- Never skip, weaken, snapshot-away, or delete a failing test to obtain green status.

## UI and accessibility

- Use Tailwind tokens and shadcn primitives before custom controls. Shared UI belongs in `packages/ui`; feature compositions remain in their vertical.
- Typography is entirely sans serif: Manrope for display/headings and Public Sans for body/UI by default. Do not add serif fonts.
- Public pages use restrained editorial hierarchy and responsive composition inspired by `https://www.squarespace.com/`; authenticated pages use practical patterns inspired by `https://ui.shadcn.com/blocks`. References inspire; never copy their layouts, copy, assets, branding, or trade dress.
- Use semantic HTML, associated labels, logical heading order, descriptive controls, keyboard access, visible focus, sufficient contrast, useful empty/error/loading states, and 44×44 px minimum targets.
- Honor `prefers-reduced-motion` in CSS. Do not add a user-facing reduced-motion profile preference.
- Verify layouts at 375, 768, 1024, and 1440 px and support content expansion without clipping or fixed-height assumptions.
- Support light/dark/system mode and the configured ten palettes with the same semantic tokens. Avoid dark-only and purple/cyan glow-heavy “AI” aesthetics.

## Placeholders and sample identities

- Placeholder copy and data remain generic; they demonstrate structure, not a business model or prescribed information architecture.
- `placehold.co` may supply generic multi-page imagery. Fake avatars and a fake favicon are acceptable.
- Use clearly fictional names, reserved `.test` emails, non-routable/sample contact data, and development-only credentials. Never use real identities or production-like secrets.
- Do not label fictional privacy profiles or infer sensitive traits. A date-of-birth field may exist, but logging and displays must treat it as sensitive.
- Placeholder assets and content must not ship as deceptive claims or third-party impersonation.

## Commits and documentation

- Keep each commit focused on one coherent behavior or documentation change. Include its contract, tests, migrations/generated artifacts, Graphify update, and directly affected docs in that same commit.
- Do not mix unrelated cleanup, formatting, dependency upgrades, or architectural changes.
- Use the repository's conventional commit style with an imperative summary; explain the reason when it is not obvious.
- Update `ARCHITECTURE.md` for boundary or decision changes, `CONVENTIONS.md` for rules, and `AGENTS.md` for executable agent policy.
- After a push, follow configured GitHub checks to completion and fix repository-owned failures before declaring the work complete.
