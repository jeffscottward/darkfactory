# Testing

## Layers

| Layer | Where | Runs with | Needs |
| --- | --- | --- | --- |
| Unit | `**/*.test.ts(x)` next to the code, `tests/generator/` | Vitest project `unit` | nothing |
| Contract | `**/*contract.test.ts` | Vitest project `contract` | nothing |
| Operations | `scripts/**/*.test.ts` | Vitest project `operations` | nothing |
| E2E helpers | `tests/e2e/helpers/*.test.ts` | Vitest project `e2e-helpers` | nothing |
| Integration | `tests/integration/**/*.test.ts` | Vitest project `integration` | Postgres |
| E2E | `tests/e2e/*.spec.ts` | Playwright project `e2e` | Postgres, build |
| Accessibility | `tests/e2e/*.a11y.spec.ts` | Playwright project `a11y` (axe) | Postgres, build |

Pick the lowest layer that proves the behavior. A rule in a service is a unit test. A contract's input, output and error codes are a contract test. SQL and migrations are an integration test. Only full user journeys (sign-in, cookies, navigation) need E2E.

## Commands

```sh
bun run test                 # every layer
bun run test:unit
bun run test:contract
bun run test:integration     # needs the local test Postgres (below)
bun run test:e2e             # playwright test --project e2e
bun run test:a11y            # playwright test --project a11y
bun run verify:coverage      # unit + contract + operations + E2E helpers, 100% gate
pnpm exec vitest run packages/api/src/contact.contract.test.ts
bun scripts/with-test-env.ts pnpm exec playwright test --ui
```

## The coverage gate

`vitest.config.ts` measures `apps/*/src`, `packages/*/src` and `scripts/` and fails below 100% on lines, branches, functions or statements. Tests, `.d.ts` files, `generated/` paths and `apps/web/src/features/generated-navigation.ts` are excluded.

Thresholds alone can be bypassed by excluding a file. `scripts/ci/test-invariants.test.ts` prevents that: it pins the coverage `include` and `exclude` lists, fails when a tracked non-test source file falls outside them, and checks that every test file runs in exactly one Vitest project. There are no committed coverage totals to update.

If coverage drops, write the missing test. Do not add ignore pragmas or exclusions.

Vitest always runs under Node through `pnpm exec`, even when Bun orchestrates the script: Bun does not implement the `node:inspector` coverage APIs that `@vitest/coverage-v8` needs. The raw report goes to the ignored `coverage/` directory.

## Generated artifacts

Generated files are checked against their sources in `verify:prepush` and the core lane. Regenerate instead of editing them:

| Source changed | Regenerate | Check |
| --- | --- | --- |
| oRPC contract | `bun run openapi:generate` | `bun run openapi:check` |
| Better Auth config | `pnpm --filter @darkfactory/auth exec bun run auth:schema:generate` | `bun run auth:schema:check` |
| Drizzle schema | `bun run db:generate` | `bun run db:check` |
| A workspace `package.json` | `bun run docs:generate` | `bun run docs:check` |

## How E2E runs

One `playwright test` run covers both projects. Everything uses Playwright built-ins:

- **Environment:** `playwright.config.ts` generates a run id, secrets, ports and a per-run database URL once. Workers inherit them. Remote provider credentials are blanked and `APP_ENV=test`.
- **webServer:** Playwright starts two servers and stops them afterwards. The first is a private portless HTTPS proxy with its own state directory and port. The second is the production build of the web app behind that proxy.
- **globalSetup:** creates the run database, migrates, resets and seeds it (exactly three identities), and starts the email preview capture server. Its teardown drops the database and removes the previews.
- **Per-file isolation:** each database-backed spec calls `resetDatabase` in `test.beforeAll`.
- **TLS:** there is no `ignoreHTTPSErrors`. Chromium trusts only the portless CA, through an SPKI pin (`--ignore-certificate-errors-spki-list`), and Node-side requests trust it through `NODE_EXTRA_CA_CERTS`.
- **CI policy:** `forbidOnly`, `retries: 1` and `failOnFlakyTests`. A test that passes only on retry fails the run. Traces are recorded on the first retry.

Local runs need Postgres and a production build: `bun run verify:browser` builds first. Use `bun scripts/with-test-env.ts pnpm exec playwright test --ui` for an interactive loop with the trace viewer.

## Integration tests

Integration tests use `@darkfactory/testkit/postgres` to create an isolated database per file on the maintenance server in `DATABASE_URL`. The testkit refuses a non-local or non-test maintenance database. Start Postgres with `bun run setup` or `bun run db:test:up`, then run `bun run test:integration`. Like the browser lane, it runs through `scripts/with-test-env.ts`, which sets `APP_ENV=test` and points `DATABASE_URL` at `TEST_DATABASE_URL`, or at the compose test role when that is empty, so the app database in `.env` is never used.

The browser lane (`bun run verify:browser`) needs the same two variables.

## CI lanes

| Lane | Script | What it proves |
| --- | --- | --- |
| core | `verify:core` | format, lint, generated artifacts (OpenAPI, auth schema, docs), typecheck |
| coverage | `verify:coverage` | unit, contract, operations and E2E-helper tests at 100% coverage |
| integration | `verify:integration` | repositories, migrations, auth and API against real Postgres |
| browser | `verify:browser` | production build, Playwright `e2e` and `a11y` |

`bun run verify` runs all four locally. `bun run verify:prepush` runs the fast subset on every push. Playwright reports and traces are uploaded only when the browser lane fails.

## Writing good tests

- Use fakes from each brick's `./test` export instead of mocking SDKs.
- Assert on stable error codes, not message text.
- Keep one behavior per test and name the test after it.
- Do not add sleeps in E2E. Wait on locators and responses.
- Never add `.only` or `.skip` to get green. `forbidOnly` fails CI.
