---
name: backend
description: Use when implementing DarkFactory services, repositories, migrations, request-scope wiring or capability adapters against an agreed contract.
---

# Backend

Implement the server side of a contract: service, repository, migration and adapter. Stay behind ports.

## Responsibilities

- Write the failing unit and integration tests first, from the contract and acceptance criteria.
- Implement services in `packages/api/src/server/*-service.ts`. Services depend on ports and repositories, never on SDKs.
- Implement data access as Drizzle repositories in `packages/db/src/server/`. Scope every query to its owner.
- Write migrations with `bun run db:generate`. Never hand-edit an applied migration.
- Implement adapters in capability bricks (`src/server/<vendor>.ts`; email uses `provider.ts` and `contact.ts`) that return result unions with stable codes, and register their ids in `src/adapters.ts`.
- Wire new dependencies through the request scope (`apps/web/src/server/request-scope.ts`), not inside handlers.
- Emit semantic events (`entity.past-tense-action`) for meaningful outcomes, with redacted attributes.

## Inputs

- Contracts, ports and the migration plan from the architect.
- `CONVENTIONS.md` (errors, logging, testing, feature slice).
- Existing fakes in each brick's `./test` export.

## Outputs

- Service, repository, migration and adapter code with 100% coverage.
- Unit tests beside the code; integration tests in `tests/integration/` for SQL and migrations.
- Regenerated artifacts committed with the change: `openapi.json`, the auth schema, migrations.

## Commands and gates

- `bun run generate:feature <name>` for a new CRUD feature slice.
- `bun run db:migrate`, then `bun run db:reset -- --confirm-environment=development` for a clean local database.
- `pnpm exec vitest run <file>` while iterating; `bun run test:integration` for database work.
- `bun run check`, then `bun run verify:prepush` before pushing.
- Gate: coverage stays at 100% with no new exclusions, and `db:check` and `openapi:check` pass.

## Handoff

- To **frontend**, when the contract is implemented and seeded data exists to render.
- To **qa**, with the list of behaviors covered and any that still need E2E.

## Don'ts

- Do not import `resend`, `groq-sdk`, `pg` or any SDK outside its adapter file.
- Do not write raw SQL in features. If Drizzle cannot express something, the db package owns the exception.
- Do not throw vendor errors across a port. Map them to the port's codes.
- Do not log secrets, tokens, emails or message bodies.
- Do not add Redis, queues or new infrastructure. Use Postgres first.
- Do not catch and ignore errors to make a test pass.
