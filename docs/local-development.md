# Local development

This guide expands the safe local workflow from the [README](../README.md). It describes repository commands that exist today; it does not assert that a particular machine is already healthy.

## Toolchain

DarkFactory currently expects:

- Node.js 22.13.0 or newer.
- Corepack selecting pnpm 11.16.0.
- Docker Engine with Docker Compose.
- PM2 available on `PATH`.
- Graphify available on `PATH`.
- Varlock available for `.env.schema` validation and environment injection.
- A Chromium-compatible browser for the current Playwright project.

Portless, Civet, Turborepo, Vite, vinext, Wrangler, Vitest, and Playwright are workspace dependencies installed by pnpm. The repository doctor checks the reviewed versions.

```bash
corepack enable
corepack install --global pnpm@11.16.0
pnpm install --frozen-lockfile
```

Install PM2 and Graphify through your managed global-tool workflow if they are absent. Do not add them to an application package merely to repair one workstation.

## Environment contract

[`.env.schema`](../.env.schema) is the public source of truth for variable names, types, sensitivity, and safe defaults. [`.env.example`](../.env.example) is a copyable starting point, not a secret store.

```bash
cp .env.example .env
```

Keep `.env` ignored. Resolve real values with Varlock and, where available, secret-manager references rather than copying secrets between files. `DATABASE_URL`, `BETTER_AUTH_SECRET`, and `CONTACT_THROTTLE_SECRET` are required; the two secrets must be distinct development-only values of at least 32 characters. Set `DATABASE_PROVIDER=postgres` for the local Compose service. Provider groups remain unavailable until all values needed by that provider are configured. Never expose server variables to client code without adding them to the explicit client allowlist and reviewing the bundle boundary.

For a local command that needs environment values, use:

```bash
varlock run -- pnpm <script>
```

Do not source `.env` as a shell script: environment-file syntax and shell syntax are not interchangeable, and the example contains values with spaces and angle brackets.

Production configuration must not reuse the development auth secret, local URLs, preview-only assumptions, `.test` identities, or seed password.

## PostgreSQL

The checked-in Compose service is isolated to loopback and uses tmpfs storage. It is disposable: stopping it with the repository down command removes its volumes.

```bash
pnpm db:test:up
```

The disposable local application URL is:

```text
postgresql://darkfactory_app:darkfactory-app-local-only@127.0.0.1:5432/darkfactory_dev
```

The unprivileged `darkfactory_app` role owns only the disposable application database. The separate `darkfactory_test_runner` role and `darkfactory_test_maintenance` database are reserved for the isolated test harness to create and drop per-run databases; do not run the application with that database-creation role.

Put that value in the ignored `.env`, then apply migrations:

```bash
varlock run -- pnpm db:migrate
```

Useful database commands:

| Command | Effect |
| --- | --- |
| `pnpm db:generate` | Compile the Drizzle schema and generate migration artifacts. Review generated changes. |
| `pnpm db:check` | Check the compiled schema and migration history. |
| `pnpm db:migrate` | Apply checked-in migrations to `DATABASE_URL`. |
| `pnpm db:seed` | Idempotently create the development personas and sample content. |
| `pnpm db:reset` | Destructively clear development data. |
| `pnpm db:test:down` | Stop the Compose service and remove its volumes. |

### Seed and reset safety

Both seed and reset require `APP_ENV=development` or `APP_ENV=test`; they reject production. That guard does not prove the connection target is disposable. Before either command, inspect the destination host and database name without printing its password.

The development identities are:

| Role | Email | Local password |
| --- | --- | --- |
| Administrator | `admin@domain.test` | `Development123!` |
| Member | `alice@domain.test` | `Development123!` |
| Member | `bob@domain.test` | `Development123!` |

These credentials are public test fixtures. Never enable them in a shared, staging, customer, or production database.

## Trusted HTTPS lifecycle

The canonical local address is <https://darkfactory.localhost>. Do not document or bookmark the hidden raw port as the application URL.

First establish portless trust:

```bash
pnpm dev:trust
```

Then materialize the validated values into the ignored Worker binding file and start the long-lived process:

```bash
pnpm dev:bindings
pnpm dev:https
```

The lifecycle owns exactly one PM2 process, `darkfactory-web-dev`, running `portless darkfactory pnpm dev`. Starting again inspects and reuses the expected process instead of creating a duplicate. A process with the same PM2 name but a different executable, working directory, or arguments is rejected rather than adopted.

Vinext's Cloudflare Worker runtime reads server bindings from `apps/web/.dev.vars`; the parent PM2 environment is deliberately restricted to non-secret process controls. `pnpm dev:bindings` writes a mode-`0600` temporary file and atomically replaces the destination without printing its contents. Regenerate it after `.env` changes and never commit it.

```bash
pnpm dev:status
pnpm dev:logs
pnpm dev:stop
```

- `dev:status` checks PM2 identity, the named portless route, and an HTTPS probe.
- `dev:logs` reads the last 200 lines without starting a streaming process.
- `dev:stop` stops the owned PM2 process and saves PM2 state.

### mkcert fallback

Portless trust is primary. Use mkcert only when it is installed and portless trust cannot satisfy the local browser or platform:

```bash
pnpm certs:install
pnpm certs:generate
varlock run -- pnpm doctor -- --cert-fallback
```

The fallback generates `.certs/localhost.pem` and `.certs/localhost-key.pem` for `localhost`, `*.localhost`, `127.0.0.1`, and `::1`. `.certs/`, PEM files, and keys are ignored. Never commit, attach, or paste the private key.

## Doctor

Run the doctor only after dependencies, environment, PostgreSQL, trust, route, and PM2 process are ready:

```bash
varlock run -- pnpm doctor
```

It checks the capability manifest, Node and pnpm versions, the pinned toolchain, vinext, Docker and PostgreSQL, Wrangler and Cloudflare configuration, required/provider environment status, portless, HTTPS trust, PM2, Graphify, enabled development tools, and mkcert only when the fallback flag is selected. A reported failure is a prerequisite to repair, not a reason to weaken the check.

Machine-readable output is available with:

```bash
varlock run -- pnpm doctor -- --json
```

## Common recovery

### Canonical route is unhealthy

1. Run `pnpm dev:status` and `pnpm dev:logs`.
2. Stop the owned process with `pnpm dev:stop`.
3. Run `pnpm dev:trust`.
4. Regenerate bindings with `pnpm dev:bindings`, then start with `pnpm dev:https`.
5. Confirm `portless get darkfactory` returns the canonical HTTPS URL.

If another noncanonical portless proxy is active, stop that proxy before retrying. Do not change DarkFactory to a raw port to work around the conflict.

### PostgreSQL is unhealthy

```bash
pnpm db:test:down
pnpm db:test:up
varlock run -- pnpm db:migrate
```

This destroys the disposable local database. Seed again only after rechecking `APP_ENV` and `DATABASE_URL`.

### Finish a local session

```bash
pnpm dev:stop
pnpm db:test:down
```

Do not delete unrelated PM2 processes or global portless routes as part of DarkFactory cleanup.

## Next steps

- [Testing and evidence](testing-and-evidence.md)
- [Capabilities and deployment](capabilities-and-deployment.md)
- [Security](security.md)
