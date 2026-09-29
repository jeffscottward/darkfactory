# Local development

This guide expands the safe local workflow from the [README](../README.md). It describes repository commands that exist today; it does not assert that a particular machine is already healthy.

## Toolchain

[`mise.toml`](../mise.toml) pins Node.js 24.21.0, Bun 1.3.14, and pnpm 11.16.0 (the sole package manager and lockfile owner). `.nvmrc`, `.bun-version`, and `package.json` repeat those pins for CI; `scripts/ci/toolchain-invariants.test.ts` keeps them equal. Docker Engine with Compose runs the disposable PostgreSQL service. Graphify 0.9.2 (through uv 0.11.32) is needed only for graph commands, and Playwright's Chromium (`bunx --bun --no-install playwright install chromium`) only for browser tests.

TypeScript, Biome, Turborepo, Vite, vinext, Wrangler, Vitest, Portless, and Playwright are workspace dependencies installed from `pnpm-lock.yaml`. The repository doctor checks the reviewed versions.

```bash
mise install
bun run setup
```

`bun run setup` (`scripts/setup/setup.ts`) is idempotent; `bun run setup -- --check` reports without changing anything. It checks the toolchain against `mise.toml` (and tells you to run `mise install` on a mismatch), runs `pnpm install --frozen-lockfile`, creates `.env`, starts PostgreSQL with `docker compose ... up --detach --wait` when Docker is available, migrates, seeds the development accounts, and writes `apps/web/.dev.vars`. Without Docker it prints how to use your own PostgreSQL and continues; a failed migration or seed makes it exit non-zero after the remaining steps.

## Environment contract

The Zod schema in `packages/config/src/server.ts` (`parseServerEnv`) is the only environment contract. [`.env.example`](../.env.example) documents every variable with safe values and is the template setup copies to the ignored `.env` (mode `0600`). Setup fills only empty `BETTER_AUTH_SECRET` and `CONTACT_THROTTLE_SECRET` values with `randomBytes(32)` secrets and an empty `DATABASE_URL` with the local role; it never overwrites a value and never prints secrets. The two secrets must stay distinct development-only values of at least 32 characters. Provider groups remain unavailable until all values needed by that provider are configured. Never expose server variables to client code without adding them to the explicit client allowlist and reviewing the bundle boundary.

`WORKFLOW_REPOSITORIES_ROOT` remains optional for product-only use. Before you start the operator app, set it to an absolute directory that contains the repositories the operator may access. The operator API fails closed before it opens a database when this value is missing, empty, or not absolute.

Bun loads the root `.env` for root scripts, and `db:migrate` passes it explicitly with `--env-file`. The shell environment wins over `.env`. 1Password users can wrap any command with `op run --env-file=.env --`.

Do not source `.env` as a shell script: environment-file syntax and shell syntax are not interchangeable, and the example contains values with spaces and angle brackets.

Production configuration must not reuse the development auth secret, local URLs, preview-only assumptions, `.test` identities, or seed password.

## PostgreSQL

The checked-in Compose service is isolated to loopback and uses tmpfs storage. It is disposable: stopping it with the repository down command removes its volumes.

```bash
bun run db:test:up
```

The disposable local application URL is:

```text
postgresql://darkfactory_app:darkfactory-app-local-only@127.0.0.1:5432/darkfactory_dev
```

The unprivileged `darkfactory_app` role owns only the disposable application database. The separate `darkfactory_test_runner` role and `darkfactory_test_maintenance` database are reserved for the isolated test harness to create and drop per-run databases; do not run the application with that database-creation role.

Setup writes that value to the ignored `.env` and applies migrations; rerun them with:

```bash
bun run db:migrate
```

Useful database commands:

| Command | Effect |
| --- | --- |
| `bun run db:generate` | Compile the Drizzle schema and generate migration artifacts. Review generated changes. |
| `bun run db:check` | Check the compiled schema and migration history. |
| `bun run db:migrate` | Apply checked-in migrations to `DATABASE_URL`. |
| `bun run db:seed` | Idempotently create the development personas and sample content; requires the matching confirmation below. |
| `bun run db:reset` | Destructively clear development data; requires the matching confirmation below. |
| `bun run db:test:down` | Stop the Compose service and remove its volumes. |

### Seed and reset safety

Both seed and reset require a validated `APP_ENV=development` or `APP_ENV=test` plus exactly one `--confirm-environment=<development|test>` command-line argument with the same value. Bun may auto-load `APP_ENV` from the root `.env`, but dotenv cannot provide this separate confirmation. The package scripts remain generic; callers append the flag after `--`:

```bash
bun run db:seed -- --confirm-environment=development
bun run db:reset -- --confirm-environment=development
```

Confirmation proves only that the command was invoked explicitly. It does not establish that `DATABASE_URL` is safe or disposable. Before either command, inspect the destination host and database name without printing its password.

The development identities are:

| Role | Email | Local password |
| --- | --- | --- |
| Administrator | `admin@domain.test` | `Development123!` |
| Member | `alice@domain.test` | `Development123!` |
| Member | `bob@domain.test` | `Development123!` |

These credentials are public test fixtures. Never enable them in a shared, staging, customer, or production database.

## Trusted HTTPS lifecycles

The canonical product address is <https://darkfactory.localhost>. The separate local operator address is <https://operator.darkfactory.localhost>. Do not document or bookmark hidden raw ports as application URLs.

Start the deployable product in the foreground (Ctrl-C stops it):

```bash
bun run dev
```

`dev` rewrites `apps/web/.dev.vars` from `.env` (validated by `parseServerEnv`, mode `0600`, atomic replace, values never printed), then runs `portless darkfactory bun scripts/dev.ts web`. Portless assigns the hidden port; `scripts/dev/serve.ts` forwards it to the app's `vinext dev`. On first use portless may ask for `sudo` to bind port 443 and trust its local CA; `bun run dev:trust` repeats the trust step.

After you set `WORKFLOW_REPOSITORIES_ROOT`, start the authenticated local operator meta-layer the same way on the `operator.darkfactory` route; it writes `apps/operator/.dev.vars`:

```bash
bun run operator:dev
```

Run `dev:bindings` or `operator:bindings` to refresh only the bindings. Never commit either `.dev.vars` file.

### Wayfinder queue and worker

The operator app is a development meta-layer, not a deployable business capability. Its Wayfinder status service checks the bounded local manifest at `~/.agents/skills/wayfinder/SKILL.md`. It returns only `installed` or `unavailable` and identifies the tracker as `local-markdown`.

Wayfinder start validates the authenticated owner, repository grant, scope paths, and request. It creates a durable workflow run and returns `queued`. HTTP and browser code do not execute OMP.

Start the worker separately to process queued effects:

```bash
pnpm --filter @darkfactory/jobs run worker:pilot
```

The worker loads the root `.env` and needs `DATABASE_URL`, absolute `WORKFLOW_REPOSITORIES_ROOT`, `WORKFLOW_REPOSITORY_GRANTS`, `WORKFLOW_VERIFIER_ID=darkfactory-verify-core-v2`, and the pinned `WORKFLOW_VERIFIER_IMAGE_DIGEST`. Lease owner, poll interval, and shutdown timeout remain optional.

The pilot worker creates one scoped OMP adapter, wraps it with the local Wayfinder execution adapter, and injects both into the workflow runtime. It must claim the plan effect before dispatch. The operator and its OMP/Wayfinder adapters are excluded from `deploy:web`. This guide does not claim remote CI worker execution or completed Wayfinder execution or evidence.

### mkcert fallback

Portless trust is primary. Use mkcert only when it is installed and portless trust cannot satisfy the local browser or platform:

```bash
bun run certs:install
bun run certs:generate
bun run doctor -- --cert-fallback
```

The fallback generates `.certs/localhost.pem` and `.certs/localhost-key.pem` for `localhost`, `*.localhost`, `127.0.0.1`, and `::1`. `.certs/`, PEM files, and keys are ignored. Never commit, attach, or paste the private key.

## Doctor

Run the doctor after setup, with `bun run dev` serving so the route and trust checks can pass:

```bash
bun run doctor
```

It treats the exact version in `.bun-version` as the Bun authority and requires both the executing Bun runtime and the `bun` resolved from `PATH` to match it. It also checks the installed Node version, capability manifest, pnpm, the pinned toolchain, vinext, Docker and PostgreSQL, Wrangler and Cloudflare configuration, required/provider environment status, Portless, HTTPS trust, Graphify, uv, enabled development tools, and mkcert only when the fallback flag is selected. A reported failure is a prerequisite to repair, not a reason to weaken the check.

Machine-readable output is available with:

```bash
bun run doctor -- --json
```

## Common recovery

### Canonical route is unhealthy

1. Stop `bun run dev` (Ctrl-C) and run `bun run dev:trust`.
2. Start it again with `bun run dev` (for the operator, `bun run operator:dev` after checking that `WORKFLOW_REPOSITORIES_ROOT` is absolute).
3. Confirm `portless get darkfactory` (or `portless get operator.darkfactory`) returns the canonical HTTPS URL.

If another noncanonical portless proxy is active, stop that proxy before retrying. Do not change DarkFactory to a raw port or move operator routes into `apps/web` to work around the conflict.

### PostgreSQL is unhealthy

```bash
bun run db:test:down
bun run db:test:up
bun run setup
```

This destroys the disposable local database; setup migrates and seeds it again.

### Finish a local session

Stop `bun run dev` and `bun run operator:dev` with Ctrl-C, then:

```bash
bun run db:test:down
```

Do not delete unrelated global portless routes as part of DarkFactory cleanup.

## Next steps

- [Testing and evidence](testing-and-evidence.md)
- [Capabilities and deployment](capabilities-and-deployment.md)
- [Security](security.md)
