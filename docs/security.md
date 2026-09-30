# Security model

How DarkFactory is meant to be kept safe while you build on it. This is guidance, not a penetration-test report, compliance assessment or certification. To report a vulnerability, see [SECURITY.md](../SECURITY.md).

## Threat model

| Boundary | Threat | Primary control |
| --- | --- | --- |
| Browser → Worker | Cross-site requests, oversized or malformed input | Origin and `sec-fetch-site` checks on unsafe oRPC methods, bounded request bodies, Zod contracts |
| Session | Stolen or replayed cookies, stale sessions after sign-out | Better Auth secure cookies over HTTPS only, database-confirmed sign-out, no Hyperdrive query caching |
| Authorization | Member reads or mutates another user's data | Server-side role checks, owner-scoped repositories; UI visibility is never a control |
| Abuse | Contact-form spam, connection exhaustion | HMAC-keyed throttle buckets, per-isolate database client cap with `503 DATABASE_CAPACITY` |
| Configuration | Shipping development secrets, local URLs or preview email to production | `parseServerEnv` and database profiles fail closed; `deploy:web:*` validates before deploying |
| Data | Secrets or personal data leaking into logs, events, analytics or test artifacts | `redact` on every event, typed public errors, redacting E2E error guards |
| Supply chain and CI | Malicious dependency or workflow change | Pinned actions, least-privilege tokens, no `pull_request_target`, Dependency Review, CodeQL, pnpm 11's default one-day minimum release age with no exclusions, a build-script allowlist (`allowBuilds` in `pnpm-workspace.yaml`), and a three-day Dependabot cooldown |
| Agent plane | An agent acting outside its grant | Opt-in operator, admin-only API, explicit approvals, exact repository grants, filesystem sandbox (`sandbox-exec` on macOS, bubblewrap on Linux). On Linux the agent has no network and no credentials; each run reaches one model through a relay to a local OMP gateway |

Request path: untrusted client → HTTPS → Better Auth session and origin checks → oRPC schema and authorization → service rules → Drizzle repository → Postgres, with redacted events and provider adapters on the side.

## Controls to keep

- Validate untrusted input at the contract edge, and provider output before it enters application code. Expected failures become typed errors with stable codes; clients never receive stacks, SQL or provider payloads.
- Keep authorization on the server. Route groups, navigation visibility and disabled buttons are not security boundaries.
- Keep provider SDKs in adapters, and Postgres access in Drizzle repositories with reviewed migrations. Never build SQL from untrusted input or change schema at application startup.
- Use the canonical HTTPS URL locally (`https://darkfactory.localhost` through portless). Do not bypass certificate warnings or switch tests to raw HTTP; Playwright trusts only the portless CA by SPKI pin.
- A disabled capability exposes no route, credential, schema or availability claim.
- An observability failure must not turn a successful mutation into a client error, and must not hide security-relevant errors.

## Secrets

- The Zod schema in `packages/config/src/server.ts` (`parseServerEnv`) is the only env contract. [`.env.example`](../.env.example) holds only empty or example values.
- `bun run setup` writes `.env` with mode `0600`; `bun run dev` writes `.dev.vars` the same way. Both are git-ignored. Do not `source .env` as a shell script.
- Real values belong in ignored env files, a secret manager (`op run --env-file=.env -- …`), CI secret stores or `wrangler secret put`. Never commit or print `.env`, auth secrets, database passwords, provider tokens, session cookies, private keys or raw env dumps. Share `bun run doctor` output only with values redacted.
- `BETTER_AUTH_SECRET` and `CONTACT_THROTTLE_SECRET` are independent and at least 32 characters. Production rejects development secrets, local callback origins and preview email.
- Client env access is an explicit allowlist; a server value is not browser-safe because it exists.
- Seed identities and `Development123!` are public test fixtures. Seed and reset require `--confirm-environment=<development|test>` matching `APP_ENV`, and refuse everything else. Never put real personal data in fixtures; use `.test` addresses.

## Scanning

| Scan | When | Private repositories |
| --- | --- | --- |
| CodeQL (JavaScript/TypeScript and Actions) | PRs and pushes to `main`, weekly | Runs when `DF_CODEQL_ENABLED=true` |
| Dependency Review (high severity) | PRs to `main` | Runs when `DF_DEPENDENCY_REVIEW_ENABLED=true` |
| OpenSSF Scorecard | Pushes to `main`, weekly, branch-protection changes | Public repositories only |
| Dependabot | Scheduled (`.github/dependabot.yml`) | Always |

A private scan that is not enabled is **not run**, never a pass; an enabled scan that cannot run fails. Analysis and uploads fail closed: no `continue-on-error` or suppressed upload errors. `scripts/ci/workflow-invariants.test.ts` pins actions to full SHAs, read-only default tokens, no persisted checkout credentials, the four CI lanes and the job names that required status checks reference.

Deployment credentials are never available to pull-request workflows. No workflow deploys; an authorized deploy needs exact-SHA CI evidence ([deploy.md](deploy.md#release-checklist)).

## Penetration testing

Live exploitation tools (for example [Shannon](https://github.com/KeygraphHQ/shannon)) may run only with written authorization, against an isolated copy of the source and an isolated non-production target with disposable data, synthetic identities and scoped credentials, while a human monitors and can stop the run. Never test production, shared environments or third-party systems. Findings close only with a fix, a regression test and a scoped rerun.

## Reporting

Report suspected vulnerabilities privately, as described in [SECURITY.md](../SECURITY.md). Do not put vulnerability details or sensitive evidence in a public issue or pull request.
