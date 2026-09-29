# Getting started

## Prerequisites

- [mise](https://mise.jdx.dev/). It installs the Node, Bun and pnpm versions pinned in [`mise.toml`](../mise.toml).
- Docker with Compose, for local Postgres. Without Docker, run your own PostgreSQL 17 with the roles in [`infra/docker/postgres.compose.yml`](../infra/docker/postgres.compose.yml) and point `DATABASE_URL` at it.
- macOS or Linux. The operator plane is optional; running agents through it currently needs macOS ([operator.md](operator.md)).

## Get the code

```sh
git clone https://github.com/jeffscottward/darkfactory.git acme && cd acme
mise install
```

<!-- init:start -->
### Rename the template (planned)

**Not available yet.** A follow-up adds `bun run init`, which rewrites the template identity for a new project. It will run once, on a clean tree, before `setup`:

```sh
bun run init -- --name <Name> --slug <slug> --scope @<scope> --domain <domain> [--repo <owner/repo>]
```

Until then, the project keeps the `darkfactory` name, the `@darkfactory` scope and the `https://darkfactory.localhost` URL. Commit the result of `init` before you continue.
<!-- init:end -->

## Set up

```sh
bun run setup
```

`setup` is idempotent, so re-run it whenever something drifts. It:

1. checks that Node, Bun and pnpm match `mise.toml`;
2. installs dependencies with the frozen lockfile;
3. creates `.env` from `.env.example` with mode `0600`, generating `BETTER_AUTH_SECRET` and `CONTACT_THROTTLE_SECRET` and pointing `DATABASE_URL` at local Postgres (it only fills empty values, and skips `DATABASE_URL` when `DATABASE_PROVIDER=hyperdrive`);
4. starts Postgres with `docker compose` and waits until it is healthy (without Docker it prints manual instructions and continues);
5. runs migrations and seeds the development accounts;
6. writes the Worker bindings file `apps/web/.dev.vars`, validated by `parseServerEnv`.

A failed migration or seed does not stop the run; `setup` lists the problems and exits non-zero at the end. Local Postgres keeps its data in `tmpfs`, so after a Docker or machine restart run `bun run setup` again.

`bun run setup -- --check` reports missing tools, dependencies, `.env` and `.dev.vars` without changing anything. It does not probe the database.

Browser tests need Chromium once: `pnpm exec playwright install chromium`.

## Run

```sh
bun run dev
```

The app runs at `https://darkfactory.localhost`. portless provides trusted local HTTPS, so secure cookies behave the same as in production. The first run may ask for your password once, to trust the portless certificate authority and bind port 443; `bun run dev:trust` repeats the trust step.

Seeded accounts (development and test only; seeding refuses any other `APP_ENV`):

| Email | Role |
| --- | --- |
| `admin@domain.test` | Admin |
| `alice@domain.test` | Member |
| `bob@domain.test` | Member |

The password for all three is `Development123!`.

Local email is not sent. It is written as preview files under `packages/email/previews/`.

## Everyday loop

```sh
bun run check                                  # format check, lint, typecheck
pnpm exec vitest run path/to/file.test.ts      # one test file
bun run test                                   # every suite
git push                                       # runs verify:prepush
```

`bun run dev` rewrites `apps/web/.dev.vars` from `.env` on every start; `bun run dev:bindings` refreshes it alone. Never commit `.env` or `.dev.vars`, and do not `source .env` as a shell script. Variables exported in your shell win over `.env`.

Database commands:

```sh
bun run db:migrate
bun run db:seed -- --confirm-environment=development
bun run db:reset -- --confirm-environment=development
bun run db:generate    # after changing the Drizzle schema
bun run db:check
```

Seed and reset require exactly one `--confirm-environment=<development|test>` that matches `APP_ENV`, and refuse any other `APP_ENV`, including production. The flag proves a deliberate invocation, not that `DATABASE_URL` is disposable: check the host first.

## Add your first feature

```sh
bun run generate:feature project --dry-run
bun run generate:feature project
bun run db:migrate
```

This creates the table, migration, repository, contract, service, portal page, feature doc and tests, then runs verification. See the layout in [CONVENTIONS.md](../CONVENTIONS.md#feature-slice-layout).

## Using 1Password or another secret manager

The env schema in `packages/config/src/server.ts` is the only env contract. To inject secrets instead of storing them in `.env`, wrap the command:

```sh
op run --env-file=.env -- bun run dev
```

## When something is off

- `bun run doctor` checks the toolchain, required env keys, the Cloudflare config and the services `capabilities.yaml` implies. Run it while `bun run dev` is serving, so the portless route and trust checks can pass. `--json` prints machine-readable output.
- Postgres unhealthy: `bun run db:test:down`, then `bun run setup`.
- portless route unhealthy: `bun run dev:trust`, then restart `bun run dev`.
- If portless cannot provide HTTPS, `bun run certs:install` and `bun run certs:generate` create mkcert certificates; check them with `bun run doctor -- --cert-fallback`.
- More symptoms: [debugging.md](debugging.md).

## Next

- [testing.md](testing.md): the test layers and how to run each one
- [capabilities.md](capabilities.md): add or swap a provider
- [deploy.md](deploy.md): ship to Cloudflare
- [debugging.md](debugging.md): find the cause of a symptom
