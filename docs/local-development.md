# Local development

This guide expands the safe local workflow from the [README](../README.md). It describes repository commands that exist today; it does not assert that a particular machine is already healthy.

## Toolchain

DarkFactory currently expects:

- Bun 1.3.14 for scripts and TypeScript.
- Node.js 22.13.0 or newer for Corepack/pnpm and measured compatibility paths.
- Corepack 0.34.7 selecting pnpm 11.16.0 as the sole package manager and lockfile owner.
- Docker Engine with Docker Compose and a running daemon.
- PM2 7.0.3, Portless 0.13.0, Varlock 1.13.0, uv 0.11.32, and Graphify 0.9.2.
- Workspace Playwright 1.61.1 with Chromium.

Civet, Turborepo, Vite, vinext, Wrangler, Vitest, Portless, and Playwright are workspace dependencies installed from `pnpm-lock.yaml`. The repository doctor checks the reviewed versions.

```bash
sh scripts/install-prerequisites.sh
```

The bare-POSIX installer supports macOS and Debian/Ubuntu. It installs only missing or incompatible pinned user-space tools, runs the frozen pnpm install, and installs Chromium through Bun. It checks Docker/Compose/daemon and portless trust without starting services or trusting certificates. Docker startup, portless trust, account setup, credentials, and adding the managed local bin directory to `PATH` remain explicit manual blockers. The installer never reads environment secret files, seeds data, or deploys.

## Environment contract

[`.env.schema`](../.env.schema) is the public source of truth for variable names, types, sensitivity, and safe defaults. [`.env.example`](../.env.example) is a copyable starting point, not a secret store.

```bash
cp .env.example .env
```

Keep `.env` ignored. Resolve real values with Varlock and, where available, secret-manager references rather than copying secrets between files. `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `CONTACT_THROTTLE_SECRET` are required; the two secrets must be distinct development-only values of at least 32 characters. Set `DATABASE_PROVIDER=postgres` for the local Compose service. Provider groups remain unavailable until all values needed by that provider are configured. Never expose server variables to client code without adding them to the explicit client allowlist and reviewing the bundle boundary.

`WORKFLOW_REPOSITORIES_ROOT` remains optional for product-only use. Before you start the operator app, set it to an absolute directory that contains the repositories the operator may access. The operator API fails closed before it opens a database when this value is missing, empty, or not absolute.

For a local command that needs environment values, use:

```bash
varlock run -- bun run <script>
```

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

Put that value in the ignored `.env`, then apply migrations:

```bash
varlock run -- bun run db:migrate
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
varlock run -- bun run db:seed -- --confirm-environment=development
varlock run -- bun run db:reset -- --confirm-environment=development
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

First establish Portless trust:

```bash
bun run dev:trust
```

Start the deployable product:

```bash
bun run dev:bindings
bun run dev:https
bun run dev:status
```

The product lifecycle owns one PM2 process, `darkfactory-web-dev`, and the `darkfactory` Portless route. The Worker runtime reads server bindings from `apps/web/.dev.vars`.

After you set `WORKFLOW_REPOSITORIES_ROOT`, start the authenticated local operator meta-layer:

```bash
bun run operator:dev
bun run operator:status
```

The operator lifecycle owns a separate PM2 process, `darkfactory-operator-dev`, and the `operator.darkfactory` Portless route. `operator:dev` runs `operator:bindings` before startup. The operator runtime reads `apps/operator/.dev.vars`.

Both lifecycle commands inspect and reuse only the expected process. They reject a process with the same PM2 name but a different executable, working directory, arguments, or environment version. Both binding commands use validated Varlock output, create a mode-`0600` same-directory temporary file, and atomically replace only their ignored destination without printing its contents.

Use the matching status, bounded log, and stop commands:

```bash
bun run dev:logs
bun run dev:stop
bun run operator:logs
bun run operator:stop
```

Run `dev:bindings` or `operator:bindings` again after relevant `.env` changes. Never commit either `.dev.vars` file.

### Wayfinder queue and worker

The operator app is a development meta-layer, not a deployable business capability. Its Wayfinder status service checks the bounded local manifest at `~/.agents/skills/wayfinder/SKILL.md`. It returns only `installed` or `unavailable` and identifies the tracker as `local-markdown`.

Wayfinder start validates the authenticated owner, repository grant, scope paths, and request. It creates a durable workflow run and returns `queued`. HTTP and browser code do not execute OMP.

Start the worker separately to process queued effects:

```bash
varlock run -- corepack pnpm --filter @darkfactory/jobs run worker:pilot
```

The worker command needs Varlock to provide `DATABASE_URL`, absolute `WORKFLOW_REPOSITORIES_ROOT`, `WORKFLOW_REPOSITORY_GRANTS`, `WORKFLOW_VERIFIER_ID=darkfactory-verify-core-v2`, and the pinned `WORKFLOW_VERIFIER_IMAGE_DIGEST`. Lease owner, poll interval, and shutdown timeout remain optional.

The pilot worker creates one scoped OMP adapter, wraps it with the local Wayfinder execution adapter, and injects both into the workflow runtime. It must claim the plan effect before dispatch. The operator and its OMP/Wayfinder adapters are excluded from `deploy:web`. This guide does not claim remote CI worker execution or completed Wayfinder execution or evidence.

### mkcert fallback

Portless trust is primary. Use mkcert only when it is installed and portless trust cannot satisfy the local browser or platform:

```bash
bun run certs:install
bun run certs:generate
varlock run -- bun run doctor -- --cert-fallback
```

The fallback generates `.certs/localhost.pem` and `.certs/localhost-key.pem` for `localhost`, `*.localhost`, `127.0.0.1`, and `::1`. `.certs/`, PEM files, and keys are ignored. Never commit, attach, or paste the private key.

## Doctor

Run the doctor only after dependencies, environment, PostgreSQL, trust, route, and PM2 process are ready:

```bash
varlock run -- bun run doctor
```

It checks the capability manifest, the installed Node and Bun versions independently, Corepack/pnpm, the pinned toolchain, vinext, Docker and PostgreSQL, Wrangler and Cloudflare configuration, required/provider environment status, Portless, HTTPS trust, PM2, Graphify, Varlock, uv, enabled development tools, and mkcert only when the fallback flag is selected. A reported failure is a prerequisite to repair, not a reason to weaken the check.

Machine-readable output is available with:

```bash
varlock run -- bun run doctor -- --json
```

## Common recovery

### Canonical route is unhealthy

1. Run `bun run dev:status` and `bun run dev:logs`.
2. Stop the owned process with `bun run dev:stop`.
3. Run `bun run dev:trust`.
4. Regenerate bindings with `bun run dev:bindings`, then start with `bun run dev:https`.
5. Confirm `portless get darkfactory` returns the canonical HTTPS URL.

If another noncanonical portless proxy is active, stop that proxy before retrying. Do not change DarkFactory to a raw port to work around the conflict.

### Operator route is unhealthy

1. Run `bun run operator:status` and `bun run operator:logs`.
2. Stop the owned process with `bun run operator:stop`.
3. Confirm that `WORKFLOW_REPOSITORIES_ROOT` is an absolute directory.
4. Regenerate bindings with `bun run operator:bindings`, then start with `bun run operator:dev`.
5. Confirm `portless get operator.darkfactory` returns the operator HTTPS URL.

Do not move operator routes into `apps/web` or use a raw port as a workaround.

### PostgreSQL is unhealthy

```bash
bun run db:test:down
bun run db:test:up
varlock run -- bun run db:migrate
```

This destroys the disposable local database. After rechecking `APP_ENV` and `DATABASE_URL`, seed again with `varlock run -- bun run db:seed -- --confirm-environment=development`.

### Finish a local session

```bash
bun run operator:stop
bun run dev:stop
bun run db:test:down
```

Do not delete unrelated PM2 processes or global portless routes as part of DarkFactory cleanup.

## Next steps

- [Testing and evidence](testing-and-evidence.md)
- [Capabilities and deployment](capabilities-and-deployment.md)
- [Security](security.md)
