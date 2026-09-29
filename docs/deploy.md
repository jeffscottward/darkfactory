# Deploy

Only `apps/web` deploys. It runs as a Cloudflare Worker and is built and shipped by `@vinext/cloudflare` (ADR-001 in [ARCHITECTURE.md](../ARCHITECTURE.md#decisions)). The operator app is never deployed. No GitHub workflow deploys; every deploy is an explicit operator action.

## Commands

| Command | What it does |
| --- | --- |
| `bun run deploy:web:check` | Validates the production database config, then runs `vinext-cloudflare deploy --dry-run`. Nothing ships. |
| `bun run deploy:web:preview` | The same validation, then a Cloudflare preview deploy. A preview URL is not production evidence. |
| `bun run deploy:web` | The same validation, then a real production deploy. |
| `bun run deploy:web:staging:check` / `deploy:web:staging` | The same for the `staging` environment in `apps/web/wrangler.jsonc`. |

Every deploy command first runs `scripts/deployment.ts`. It reads `DATABASE_PROVIDER` and `DATABASE_URL` from the deploying shell (Bun also loads the root `.env`, where the shell wins), validates them against the production profile for that provider, and checks that every environment in `wrangler.jsonc` declares a `HYPERDRIVE` binding exactly when its `DATABASE_PROVIDER` var is `hyperdrive`. The local `.env` fails this check on purpose, so export the target environment's values:

```sh
DATABASE_PROVIDER=planetscale DATABASE_URL="$PROD_DATABASE_URL" bun run deploy:web:check
# or: op run --env-file=prod.env -- bun run deploy:web:check
```

For a production-like local run that deploys nothing: `bun run build`, then `pnpm exec portless darkfactory pnpm --filter @darkfactory/web run start`.

## One-time setup

1. **Credentials.** Export a scoped `CLOUDFLARE_API_TOKEN` in the shell that deploys, or inject it with `op run`. The template's `apps/web/wrangler.jsonc` pins the owner's `account_id`; replace it with yours (the planned `bun run init` will remove it so the account comes from `CLOUDFLARE_ACCOUNT_ID`).
2. **Domain and vars.** In `apps/web/wrangler.jsonc`, set the custom-domain `routes` and the `vars` for each environment: `APP_ENV` (`production`), `APP_URL`, `BETTER_AUTH_URL` (must equal `APP_URL`), `APP_NAME`, `DATABASE_PROVIDER`, `EMAIL_PROVIDER`, `EMAIL_TRANSPORT` and `EMAIL_FROM`. `vars`, routes and bindings are not inherited by named environments. Production rejects `EMAIL_TRANSPORT=preview`; `EMAIL_PROVIDER` and `EMAIL_TRANSPORT` are `disabled` together or not at all (staging ships with email disabled on `workers_dev`).
3. **Secrets.** Set each secret once per environment. Values never go in `wrangler.jsonc` or git.

   ```sh
   cd apps/web
   pnpm exec wrangler secret put BETTER_AUTH_SECRET
   pnpm exec wrangler secret put CONTACT_THROTTLE_SECRET
   pnpm exec wrangler secret put RESEND_API_KEY      # required when EMAIL_TRANSPORT=resend
   pnpm exec wrangler secret put DATABASE_URL        # not with DATABASE_PROVIDER=hyperdrive
   pnpm exec wrangler secret put BETTER_AUTH_SECRET --env staging   # repeat each for staging
   ```

   `BETTER_AUTH_SECRET` and `CONTACT_THROTTLE_SECRET` must be distinct and at least 32 characters. Optional: `POSTHOG_KEY` (with the `POSTHOG_HOST` var) enables analytics; `OTEL_EXPORTER_OTLP_ENDPOINT` enables trace export. `ai` is not wired into an app yet, so Groq keys have no effect.
4. **Database.** Pick a `DATABASE_PROVIDER` and meet its production rule ([capabilities.md](capabilities.md#database-host)).

## Hyperdrive

Hyperdrive pools Postgres connections close to the Worker. The code path is the same with or without it: the request scope opens one `pg` client per request, and the connection string comes from the `HYPERDRIVE` binding instead of `DATABASE_URL`.

1. Create one config per environment, with query caching **disabled**. Cached reads could return stale sessions.

   ```sh
   cd apps/web
   pnpm exec wrangler hyperdrive create app-db \
     --connection-string="$ORIGIN_DATABASE_URL" \
     --caching-disabled
   ```

   For full origin verification, upload the origin CA first and pass it:

   ```sh
   pnpm exec wrangler cert upload certificate-authority --name app-db-ca --ca-cert origin-ca.pem
   pnpm exec wrangler hyperdrive create app-db \
     --connection-string="$ORIGIN_DATABASE_URL" \
     --caching-disabled --sslmode=verify-full --ca-certificate-id=<ca-id>
   ```

2. Add the binding to **each** environment in `wrangler.jsonc`, because bindings are not inherited and an id belongs to one instance:

   ```jsonc
   "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<hyperdrive-id>" }]
   ```

3. Set `DATABASE_PROVIDER` to `hyperdrive` in that environment's `vars`, and delete its `DATABASE_URL` secret. Validation fails closed if the binding is missing, or if `DATABASE_URL` is also set.
4. Run `DATABASE_PROVIDER=hyperdrive DATABASE_URL= bun run deploy:web:check`.

For local Worker runs with the binding declared, export `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE=<local Postgres URL>`; otherwise keep `DATABASE_PROVIDER=postgres` locally. The per-isolate client cap (`REQUEST_DATABASE_POOL_MAX_CONNECTIONS` in `packages/db/src/server/client.ts`) still applies; Hyperdrive's own pool size protects the origin database.

## Migrations

Migrations run from a trusted machine, not from the Worker. Point at the origin database directly (not Hyperdrive):

```sh
DATABASE_PROVIDER=postgres DATABASE_URL="$ORIGIN_DATABASE_URL" bun run db:migrate
```

Ship schema changes as expand, then contract: add columns or tables in one release and remove old ones in a later release, so the running Worker and the new schema stay compatible during rollout and rollback. Never run `db:seed` or `db:reset` against production; both refuse any `APP_ENV` other than `development` or `test`.

## Source maps and logs

`apps/web/wrangler.jsonc` sets `"upload_source_maps": true`, so stack traces in Workers Logs map to TypeScript. Client bundles do not publish source maps. Tail live logs with:

```sh
cd apps/web && pnpm exec wrangler tail
```

Responses from the request scope (auth, strict sign-out and oRPC routes) carry `x-request-id`. Search Workers Logs for that id. See [debugging.md](debugging.md).

## Release checklist

A release needs exact-SHA evidence. PRs do not. This is operator policy: the deploy scripts check database config, not GitHub.

1. Merge the release PR with all four lanes green.
2. Bump `version` in the root `package.json`, the workspace packages and `capabilities.yaml`, then move `## [Unreleased]` in `CHANGELOG.md` to the new version with today's date.
3. Dispatch `ci.yml` (`workflow_dispatch`) on the exact commit you will ship; merges to `main` do not trigger it. Confirm the run's `head_sha` equals that commit and that all four lanes passed (`gh run view <run-id> --json headSha,conclusion,jobs`). A dispatch request alone is not evidence.
4. Check CodeQL and Dependency Review for open high or critical findings.
5. Apply pending migrations ([Migrations](#migrations)).
6. `bun run deploy:web:staging:check`, then `bun run deploy:web:staging`, and smoke-test staging.
7. `bun run deploy:web:check`, then `bun run deploy:web`.
8. Probe production over HTTPS: the home page, sign-in, and one authenticated oRPC call. Check the logs for errors, using the request ids.
9. Tag the commit (`git tag vX.Y.Z && git push origin vX.Y.Z`) and publish the GitHub release with the changelog section.
10. Record in the release notes: the SHA, CI run URL, deployer and Cloudflare environment, redacted deploy output, migration state, secret names changed, probe results, and the rollback version id. A green build or a deploy exit code is not proof of a healthy release.

Rollback:

```sh
cd apps/web
pnpm exec wrangler deployments list
pnpm exec wrangler rollback <version-id>
```

Rolling back the Worker does not roll back the database. This is why migrations must stay backward compatible.
