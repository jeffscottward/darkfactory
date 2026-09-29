# Getting started

## Prerequisites

- [mise](https://mise.jdx.dev/). It installs the Node, Bun and pnpm versions pinned in [`mise.toml`](../mise.toml).
- Docker with Compose, for local Postgres. Without Docker, run your own PostgreSQL 17 with the roles in [`infra/docker/postgres.compose.yml`](../infra/docker/postgres.compose.yml) and point `DATABASE_URL` at it.
- macOS or Linux.
- Optional: running agents through the operator plane currently needs macOS ([operator.md](operator.md)).

## Get the code

<!-- init:start -->
Create your repository from the template with the [GitHub CLI](https://cli.github.com/). The new repository starts from one fresh commit, so none of the template's Git history comes with it:

```sh
gh repo create acme/acme-labs --template jeffscottward/darkfactory --private --clone && cd acme-labs
```

To only try the template, `git clone https://github.com/jeffscottward/darkfactory.git` instead. That clone carries the template's full history, so never push it.

<!-- init:end -->
Install the pinned toolchain in the checkout:

```sh
mise install
```

<!-- init:start -->
### Rename the template

Run this once, on a clean tree, before `setup`, then push the result:

```sh
bun run init -- --name "Acme Labs" --slug acme-labs --scope @acme --domain acme.dev --repo acme/acme-labs
git commit -m "chore: initialize project" && git push
```

Init rewrites the template identity for your project: the `@darkfactory` scope, the `darkfactory` slug and `darkfactory.localhost`, the production domain and email sender, the repository URLs, the `DARKFACTORY_` and `darkfactory_` prefixes, and the LICENSE holder. It removes the owner's Cloudflare `account_id`, and deploys use `CLOUDFLARE_ACCOUNT_ID` instead. It deletes instance-only history, runs `pnpm install` and regenerates the generated docs. Preview with `--dry-run`. Two options:

- `--without-operator` deletes the opt-in agent-SDLC plane: every workspace package whose `package.json` `brick` is `agent-sdlc`, plus their root scripts and dependencies, the `WORKFLOW_*` env keys, `docs/operator.md`, and the tests, config entries and doc lines that cite them.
- `--fresh-history` is for a plain `git clone`. After renaming, it commits the tree as a single root commit on your branch and removes the remotes and tags that still reach the template's commits. It needs a Git identity and refuses if other local branches carry template commits.

Init prints the next steps. It never suggests pushing a checkout that still carries the template's history. Then protect `main` ([deploy.md](deploy.md#branch-protection)).
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
bun run test                                   # every suite, against the test database
git push                                       # runs verify:prepush
```

`bun run dev` rewrites `apps/web/.dev.vars` from `.env` on every start; `bun run dev:bindings` refreshes it alone. Never commit `.env` or `.dev.vars`, and do not `source .env` as a shell script. Variables exported in your shell win over `.env`.

`bun run test` needs the local Postgres that `setup` starts (`bun run db:test:up` restarts it) and Chromium. Its database suites run through `scripts/with-test-env.ts`, which sets `APP_ENV=test` and points `DATABASE_URL` at `TEST_DATABASE_URL`, or at the compose test role when that is empty. The app database in `.env` is never used.

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
