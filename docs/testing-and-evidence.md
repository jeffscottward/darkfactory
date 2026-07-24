# Testing and evidence

DarkFactory separates a command from evidence that the command passed. A file, test name, badge, or prior run is not current proof. Record the exact revision, environment boundary, command, exit result, and artifact location for every claim.

The final DF evidence ledger is a draft at [evidence-map.md](evidence-map.md). It remains pending until Main records final revision and CI/browser/Graphify evidence.

## Gate selection

Run the narrowest check while iterating, then the complete gate required by the changed contract.

| Change | Focused evidence | Follow-through |
| --- | --- | --- |
| Pure rule, schema, state transition, or typed error | Owning package's unit test | `pnpm test:unit` plus applicable static checks |
| Drizzle repository, migration, auth boundary, transaction, or adapter | Real-PostgreSQL integration test | `pnpm test:integration` plus migration/schema checks |
| Rendered route or user journey | Relevant Playwright project/spec and browser observation | `pnpm test:e2e`; include failure artifacts or screenshots required by the DF item |
| oRPC contract | Contract test and generated OpenAPI check | `pnpm api:openapi:check`, typecheck, integration tests |
| Auth schema | Focused auth test | `pnpm auth:schema:check` and relevant integration/E2E flow |
| Feature generator | Disposable fixture or generator test | Generator matrix, static checks, graph update/verify |
| Documentation only | Scoped link/path review and Markdown lint | No artificial application test |
| Architecture, symbol, contract, or relationship | Focused behavior gate | Graphify update, check, verify, and representative queries |

Do not skip, weaken, snapshot away, or delete a failing test to obtain a green result.

## Local test preparation

The integration and browser suites must use controlled local dependencies, never production providers or credentials.

```bash
pnpm db:test:up
varlock load -- pnpm db:migrate
```

Use an ignored test environment with `APP_ENV=test`, the local runner `DATABASE_URL`, a non-production Better Auth secret of at least 32 characters, and the canonical local URL. Optional live provider credentials are not needed for core deterministic tests.

Install the current Chromium binary when Playwright has not done so on the machine:

```bash
pnpm exec playwright install chromium
```

## Repository commands

```bash
varlock load -- pnpm test:unit
varlock load -- pnpm test:integration
varlock load -- pnpm test:e2e
```

The aggregate test script runs unit, contract, operations, integration, E2E, and accessibility suites:

```bash
varlock load -- pnpm test
```

The broad deterministic pre-push lifecycle is:

```bash
pnpm verify:core
```

Environment-heavy verification remains explicit:

```bash
varlock load -- pnpm verify:integration
pnpm verify:graph
varlock load -- pnpm verify:browser
```

The complete sequential local lifecycle and its CI alias are:

```bash
varlock load -- pnpm verify
varlock load -- pnpm run ci
```

`verify` composes all four lanes without weakening any gate. GitHub Actions executes those lanes concurrently with `fail-fast: false`: core handles static checks, builds, unit/contract/operations tests, and docs; integration starts isolated PostgreSQL; graph installs the pinned Graphify build and proves tracked metadata freshness; browser installs Chromium, starts isolated PostgreSQL and HTTPS, runs E2E/a11y, and preserves failure evidence. Never substitute bare `pnpm ci`; that is pnpm's clean-install command.

Stop the local database after the evidence is captured:

```bash
pnpm db:test:down
```

## Browser evidence

Automated browser coverage currently uses Chromium at <https://darkfactory.localhost>. Playwright starts or reuses the portless route, retains traces and video on failure, and captures screenshots only on failure.

For a DF item that requires visual, responsive, keyboard, authentication, cookie, or network evidence, record more than `pnpm test:e2e`:

1. Revision and browser version.
2. Route and initial database/persona state.
3. Viewport: 375, 768, 1024, or 1440 px where responsive evidence applies.
4. Theme mode and color palette where visual state matters.
5. Keyboard path, visible focus, labels, target size, and reduced-motion observation where accessibility applies.
6. Relevant request/response, redirect, and cookie attributes with secrets redacted.
7. Screenshot, trace, or video path and a short statement of what it proves.
8. Exact failures and rerun result; never omit a failing viewport or persona.

`playwright-report/` and `test-results/` are local/generated evidence. GitHub Actions uploads them for failed runs for seven days. A missing artifact must not be described as passing evidence.

## Graphify evidence

After a change to features, public symbols, contracts, database relationships, or architecture:

```bash
pnpm graph:update
pnpm graph:check
pnpm graph:verify
```

Record the Graphify version, graph digest/manifest, source fingerprint, source file count, and representative query output. At minimum, the final evidence should trace a route or oRPC procedure through contract, service, repository, schema, and adapter. Query before broad exploration when the graph exists.

## Generated artifact evidence

Generated artifacts are checked against their sources rather than hand-edited:

```bash
pnpm auth:schema:check
pnpm api:openapi:check
pnpm db:check
```

For the final bundle, record:

- Generated OpenAPI path and digest.
- Migration filenames/digests and schema check output.
- Seed command target classification and observed persona/content result.
- Dependency and lockfile digest or inventory.
- Graphify manifest/digest and verification query.
- HTTPS process/route/trust observations.
- Structured event/log/trace evidence with sensitive fields redacted.
- Cloudflare preview/deployment evidence only if an authorized deployment actually occurred.

## CI and deployment truth

The CI badge is a pointer to GitHub Actions, not durable evidence by itself. Final evidence needs the workflow run URL, commit SHA, attempt number, terminal conclusion, and artifact URLs or an explicit statement that no artifact was produced.

The current workflow verifies the repository but does not deploy it. `pnpm deploy:web:preview` and `pnpm deploy:web` are explicit credentialed Cloudflare operations. Do not run them as a documentation check, and do not mark deployment green without an authorized target plus observed deployment output and runtime probe.

External or flaky blockers remain failures or blockers. Record the URL/log, owner, rerun count, next action, and stop condition. Never relabel a pending, skipped, cancelled, timed-out, infrastructure-owned, or unobserved result as green.

## Evidence record template

Use this block for each command or manual observation:

```text
DF item:
Revision SHA:
UTC time:
Owner:
Environment/target:
Preconditions and fixture state:
Command or browser steps:
Exit/result:
Artifact URL or repository-relative path:
Redactions applied:
What this proves:
What this does not prove:
Failure/blocker and owner, if any:
Rerun/stop condition:
```

A final reviewer must be able to reproduce the result from the record without relying on chat history.

## Documentation-only validation

For this documentation set, use a scoped command rather than a project-wide formatter or suite:

```bash
pnpm exec markdownlint-cli2 README.md AGENTS.md TODO.md docs/local-development.md docs/testing-and-evidence.md docs/capabilities-and-deployment.md docs/security.md docs/adr/0001-vinext-alchemy-boundary.md docs/evidence-map.md
```

Also verify every repository-relative link and referenced path. External links prove only that the source was consulted, not that an integration was executed.
