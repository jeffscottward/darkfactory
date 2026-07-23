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

Keep `.env` ignored. Resolve real values with Varlock and, where available, secret-manager references rather than copying secrets between files. `DATABASE_URL` and `BETTER_AUTH_SECRET` are required. Provider groups remain unavailable until all values needed by that provider are configured. Never expose server variables to client code without adding them to the explicit client allowlist and reviewing the bundle boundary.

For a local command that needs environment values, use:

```bash
varlock load -- pnpm <script>
```

Do not source `.env` as a shell script: environment-file syntax and shell syntax are not interchangeable, and the example contains values with spaces and angle brackets.

Production configuration must not reuse the development auth secret, local URLs, preview-only assumptions, `.test` identities, or seed password.

## PostgreSQL

The checked-in Compose service is isolated to loopback and uses tmpfs storage. It is disposable: stopping it with the repository down command removes its volumes.

```bash
pnpm db:test:up
```

The local runner URL is:

```text
postgresql://darkfactory_test_runner:darkfactory-test-only@127.0.0.1:5432/darkfactory_test_maintenance
```

Put that value in the ignored `.env`, then apply migrations:

```bash
varlock load -- pnpm db:migrate
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

Then start the long-lived process with the resolved environment:

```bash
varlock load -- pnpm dev:https
```

The lifecycle owns exactly one PM2 process, `darkfactory-web-dev`, running `portless darkfactory pnpm dev`. Starting again inspects and reuses the expected process instead of creating a duplicate. A process with the same PM2 name but a different executable, working directory, or arguments is rejected rather than adopted.

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
varlock load -- pnpm doctor -- --cert-fallback
```

The fallback generates `.certs/localhost.pem` and `.certs/localhost-key.pem` for `localhost`, `*.localhost`, `127.0.0.1`, and `::1`. `.certs/`, PEM files, and keys are ignored. Never commit, attach, or paste the private key.

## Doctor

Run the doctor only after dependencies, environment, PostgreSQL, trust, route, and PM2 process are ready:

```bash
varlock load -- pnpm doctor
```

It checks the capability manifest, Node and pnpm versions, the pinned toolchain, vinext, Docker and PostgreSQL, Wrangler and Cloudflare configuration, required/provider environment status, portless, HTTPS trust, PM2, Graphify, enabled development tools, and mkcert only when the fallback flag is selected. A reported failure is a prerequisite to repair, not a reason to weaken the check.

Machine-readable output is available with:

```bash
varlock load -- pnpm doctor -- --json
```

## Common recovery

### Canonical route is unhealthy

1. Run `pnpm dev:status` and `pnpm dev:logs`.
2. Stop the owned process with `pnpm dev:stop`.
3. Run `pnpm dev:trust`.
4. Start again with `varlock load -- pnpm dev:https`.
5. Confirm `portless get darkfactory` returns the canonical HTTPS URL.

If another noncanonical portless proxy is active, stop that proxy before retrying. Do not change DarkFactory to a raw port to work around the conflict.

### PostgreSQL is unhealthy

```bash
pnpm db:test:down
pnpm db:test:up
varlock load -- pnpm db:migrate
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
