# Conventions

Code rules. Workflow is in [AGENTS.md](AGENTS.md), boundaries in [ARCHITECTURE.md](ARCHITECTURE.md). Biome (`ultracite/core`, configured in `biome.jsonc`) and `tsconfig.base.json` enforce most of this; run `bun run check`.

## Modules

- ESM only. `verbatimModuleSyntax` is on, so import types with `import type`.
- Use named exports. Default exports are only for framework entry files (`page.tsx`, `layout.tsx`, configs).
- Import other packages only through their `exports` map (`@darkfactory/email/server`), never `src/` paths.
- Put server-only code behind `./server` or a `./server/<name>` subpath. Its `browser` condition points to an `unsupported` stub that throws.
- Route handlers, CLI entry files and adapters hold no business rules: they parse input, call a service and map the result.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride` and `verbatimModuleSyntax` are on. Do not relax them per file.
- No `any`, no `@ts-ignore`. Narrow `unknown` with Zod or type guards.
- Prefer `Readonly<{ … }>` object types and `as const` tuples. Derive unions from the tuple: `type EmailAdapterId = (typeof EMAIL_ADAPTERS)[number]`.
- Validate every external input with Zod: env, requests, provider responses and YAML.

## Naming

| Thing | Style | Example |
| --- | --- | --- |
| Files and folders | kebab-case | `contact-throttle-repository.ts` |
| Types, classes, components | PascalCase | `ContactServiceError`, `StatCard` |
| Functions, variables | camelCase, verb first | `createResendEmailPort`, `parseServerEnv` |
| Constants | SCREAMING_SNAKE | `REQUEST_DATABASE_POOL_MAX_CONNECTIONS` |
| Error codes | SCREAMING_SNAKE, stable | `TOO_MANY_REQUESTS`, `EMAIL_PROVIDER_UNAVAILABLE` |
| Event names | `entity.past-tense-action`, kebab-case | `contact.submitted`, `feature-item.archived` |

## Errors

- Model expected failures as data or as a typed error with a stable `code`, never as a bare message:

  ```ts
  export type ContactServiceErrorCode = "TOO_MANY_REQUESTS" | "SERVICE_UNAVAILABLE";

  export class ContactServiceError extends Error {
    readonly code: ContactServiceErrorCode;
    constructor(code: ContactServiceErrorCode) {
      super(CONTACT_SERVICE_ERROR_MESSAGES[code]);
      this.name = "ContactServiceError";
      this.code = code;
    }
  }
  ```

- Adapters return result unions instead of throwing provider errors upward: `{ status: "failed"; code; retryable }` for email, `{ status: "failed"; category; retryable }` for AI.
- Map errors to HTTP once, at the contract. Each contract declares its codes and statuses (for example `CONTACT_ERRORS` in `packages/api/src/contracts/contact.ts`).
- Codes are public API: never rename one; add a new code instead.
- Never return stack traces, SQL or provider payloads to a client. Never swallow an error without logging it as an event.

## Logging and events

- Emit semantic events through a `StructuredEventSink` (evlog in the app). Do not use `console.*` in application code.
- An event has `eventId`, `name`, `occurredAt` and `correlation` (request id), and optionally `action`, `entityId`, `entityType`, `outcome`, `source`, `errorCategory`, `durationMs` and `attributes`. See `SemanticEvent` in `packages/observability/src/port.ts`.
- Pass attributes through `redact` (`packages/observability/src/redaction.ts`). Never log secrets, tokens, cookies, emails or message bodies.
- Traces and metrics go through `TelemetryPort`, product analytics through `AnalyticsPort`.

## Testing

- Put Vitest tests next to the code: `*.test.ts`, and `*.contract.test.ts` for contracts. Integration tests live in `tests/integration/`, Playwright specs in `tests/e2e/` (`*.a11y.spec.ts` for axe). Layers: [docs/testing.md](docs/testing.md).
- Use the fakes from each brick's `./test` export (`createRecordingAiPort`, `createRecordingAnalyticsPort`, `createRecordingEventSink`, `createRecordingTelemetry`). Do not mock vendor SDKs in feature tests.
- Coverage must stay at 100% for lines, branches, functions and statements. Do not add coverage exclusions: `scripts/ci/test-invariants.test.ts` pins the exclusion list and fails if a tracked source file is not measured. Do not add coverage-ignore comments either (reviewed, not machine-checked).
- One behavior per test, named after the behavior.

## Feature slice layout

`bun run generate:feature <name>` creates this layout. Hand-written features follow it too.

```text
packages/db/src/generated/<name>/schema.ts        Drizzle table
packages/db/src/generated/<name>/repository.ts    owner-scoped repository
packages/db/migrations/<tag>.sql                  migration
packages/api/src/generated/<name>/contract.ts     oRPC contract + Zod schemas + errors
packages/api/src/generated/<name>/service.ts      service (depends on the repository port)
apps/web/src/features/<name>/index.ts             the feature's public surface
apps/web/src/features/<name>/names.ts             route, table and API identifiers
apps/web/src/features/<name>/feature.test.ts      tests
apps/web/src/features/<name>/graphify.json        navigation metadata
apps/web/src/app/(portal)/<plural>/page.tsx       portal page (presentation)
docs/features/<name>.md                           feature doc
```

The generator also updates `.darkfactory/features.json`, `apps/web/src/features/generated-navigation.ts`, `packages/db/migrations/meta/_journal.json` and the `*-registry.ts` files under `packages/api/src/generated/` and `packages/db/src/generated/`; never edit those by hand. Paths under `generated/` and `generated-navigation.ts` are excluded from coverage, so keep hand-written logic out of them. Put view-model mapping (contract output → plain props) in the feature folder, not in the page or in `packages/ui`.
