# Capabilities

A capability is an external service the product uses through a port: email, analytics, AI, telemetry, or the database host. Each one has:

- a **port**: a small TypeScript interface that services depend on;
- one or more **adapters**: the only files that talk to the vendor;
- an **adapter registry**: the list of adapter ids that config and the manifest accept;
- a **disabled** implementation and a **recording fake** for tests;
- an entry in `capabilities.yaml` and keys in the env schema.

Capability packages declare `"brick": "capability"` and may depend on no other brick ([package graph](generated/package-graph.md)).

## The manifest

`capabilities.yaml` records the project identity, the fixed architecture choices (`database.orm: drizzle`, `api.provider: orpc`) and which adapter each capability uses. One Zod loader validates it: `packages/config/src/server/capabilities-loader.ts`, using the schema in `packages/config/src/capabilities.ts`. Provider fields are enums built from the registry in each brick's `src/adapters.ts` (for example `EMAIL_ADAPTERS` in `packages/email/src/adapters.ts`) and from `DATABASE_PROVIDERS` in `packages/config/src/database.ts`, so the manifest cannot name an adapter that does not exist. `packages/config/src/capabilities.server.test.ts` loads an adapter module for every registry id.

Entries with `enabled: false` (docs, uptime, error tracking, storage and so on) are placeholders. No code exists for them. Do not describe them as available.

`bun run doctor` reads the manifest and adds the probes it implies: Bun for `workspace.script_runtime`, Docker and Postgres for `database.engine`, portless when `development.https` is enabled, and Graphify when `developer_context.code_graph` is enabled.

## Anatomy of a capability brick

`packages/ai` is the reference. Copy its shape:

```text
packages/<capability>/
  package.json               "brick": "capability"; exports ".", "./adapters", "./server/<vendor>", "./test"
  src/index.ts               port types, result union, createDisabled<Capability>Port
  src/adapters.ts            <CAPABILITY>_ADAPTERS registry and its id type
  src/server/<vendor>.ts     adapter: the only file that imports the vendor SDK or calls its API
  src/server/unsupported.ts  browser stub for the server export (throws)
  src/test.ts                recording fake for other packages' tests
```

Rules:

- The port speaks your domain, not the vendor's. It returns a result union with a stable category or code (for example `{ status: "failed"; category: "provider_unavailable"; retryable: true }` from `AiPort`), never a vendor error object.
- The brick has no workspace dependencies. The app wires it in; `config` imports only its `./adapters` registry.
- `package.json` maps the server export's `browser` condition to `unsupported.ts` and lists that file in `sideEffects`.

## Recipe: swap Resend for another email provider

This example replaces Resend with a hypothetical `postmark` adapter. Features do not change: auth uses `EmailPort`, the contact service uses the contact delivery port, and both only see the result union.

1. **Write the adapter.** Add `packages/email/src/server/postmark.ts` exporting `createPostmarkEmailPort(options): EmailPort` and a contact variant. Implement `sendPasswordReset` and `sendEmailVerification` with the existing renderers (`render-reset-password.ts`, `render-email-verification.ts`, `render-contact.ts`). Map every provider outcome to the existing codes: `EMAIL_PROVIDER_*` for `EmailPort` and `CONTACT_PROVIDER_*` for the contact port (`packages/email/src/server-types.ts`). Prefer `fetch` with an injectable transport, as the PostHog adapter does, over adding an SDK. Re-export both factories from `packages/email/src/server.ts`.
2. **Register it.** Add `"postmark"` to `EMAIL_ADAPTERS` in `packages/email/src/adapters.ts`, and its loader to `ADAPTER_MODULES` in `packages/config/src/capabilities.server.test.ts`. The delivery result's `provider` field and the env and manifest enums pick it up from the registry.
3. **Add the config.** In `packages/config/src/server.ts`, add `POSTMARK_SERVER_TOKEN` and make it required when `EMAIL_TRANSPORT` is `postmark`, next to the existing `RESEND_API_KEY` rule. Add the key, with no value, to `.env.example`.
4. **Select it.** Add a `postmark` branch to `selectEmailPort` (`packages/email/src/server/provider.ts`) and `selectContactEmailPort` (`packages/email/src/server/contact.ts`). Pass the token where they are called: `apps/web/src/server/request-scope.ts` and `apps/web/src/app/api/orpc/[...rest]/route.ts`.
5. **Test it.** Unit-test the adapter with a fake `fetch`: sent, rejected, invalid response, network failure, missing token. Add selection and env-schema tests. Coverage must stay at 100%.
6. **Flip the manifest.** Set `email.provider: postmark` in `capabilities.yaml`.
7. **Configure deploys.** Set `EMAIL_TRANSPORT` and `EMAIL_PROVIDER` in `apps/web/wrangler.jsonc`, then `pnpm exec wrangler secret put POSTMARK_SERVER_TOKEN` (in `apps/web`) for each environment.
8. **Remove the old adapter.** Delete `createResendEmailPort` (`provider.ts`), `createResendContactEmailPort` (`contact.ts`) and the Resend types in `server-types.ts`, with their tests. Drop `resend` from `packages/email/package.json` and `EMAIL_ADAPTERS`, and delete `RESEND_API_KEY` from the env schema, `getProviderCapabilities`, `.env.example` and the doctor's email env group (`scripts/doctor/doctor.ts`).
9. **Verify.** Run `pnpm install`, `bun run verify:prepush`, and open a PR.

Local development is unaffected. `EMAIL_TRANSPORT=preview` still writes files to `packages/email/previews/`.

## Recipe: add a new capability

1. Create `packages/<capability>` with `"brick": "capability"`. Write the port in `src/index.ts`, with its result union and a disabled implementation, and the registry in `src/adapters.ts`.
2. Write the recording fake in `src/test.ts`, and a failing test for the first consumer.
3. Write the adapter under `src/server/`, plus the `unsupported.ts` browser stub.
4. Add env keys in `packages/config/src/server.ts`, a manifest enum in `packages/config/src/capabilities.ts`, an `ADAPTER_MODULES` entry, and the manifest entry.
5. Build the port in the app's composition root: `apps/web/src/server/request-scope.ts` for per-request ports, or the route module for process-wide ones (as `analyticsFor` in `apps/web/src/app/api/orpc/[...rest]/route.ts`). Pass it to the services that need it.
6. Run `bun run docs:generate`, and document the capability in this file and in the README Stack table.

## Recipe: remove a capability

1. Remove the consumer wiring from the app and services.
2. Remove its registry import, env keys and manifest enum from `packages/config`, then its manifest entry (or set `enabled: false` if you plan to bring it back).
3. Delete the package and its entries in the app's and root `package.json`.
4. Run `pnpm install`, `bun run docs:generate` and `bun run verify:prepush`.

## Database host

The database host is swapped with `DATABASE_PROVIDER`, not a port, because every provider speaks Postgres:

| Value | Use | Production rule |
| --- | --- | --- |
| `postgres` | Local and any managed Postgres | `sslmode=verify-full`, no local hosts |
| `planetscale` | PlanetScale Postgres | `verify-full`, pooled PgBouncer host `*.pg.psdb.cloud` on port 6432 |
| `hyperdrive` | Cloudflare Hyperdrive in front of any Postgres | `HYPERDRIVE` binding required; `DATABASE_URL` must be absent |

Every profile also rejects `host`, `hostaddr` and `port` query overrides. The profiles live in `DATABASE_PROVIDER_PROFILES` in `packages/config/src/database.ts`. See [deploy.md](deploy.md#hyperdrive) for Hyperdrive setup.
