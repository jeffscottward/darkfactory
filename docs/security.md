# Security

This document defines development and verification boundaries. It is not a penetration-test report, production-readiness statement, compliance assessment, or security certification.

## Trust boundaries

DarkFactory's intended request boundary is:

```text
untrusted browser/client input
  -> HTTPS transport
  -> Better Auth session/origin boundary
  -> oRPC schema + authorization contract
  -> application service/domain rules
  -> Drizzle repository
  -> PostgreSQL
  -> redacted structured events and provider adapters
```

Keep authorization on the server. Route groups, navigation visibility, client state, and UI-disabled controls are not security boundaries. Validate untrusted input at the contract edge and validate provider output before it enters application code. Expected failures become typed contract errors; clients must not receive internal stacks or provider payloads.

## Secrets and environment

- [`.env.schema`](../.env.schema) is the public variable contract; it contains no secret values.
- [`.env.example`](../.env.example) contains only safe empty/example values.
- Real values belong in ignored environment files, Varlock/secret-manager references, CI secret stores, or deployment secret stores.
- Never commit or print `.env`, auth secrets, database passwords, provider tokens, session cookies, private certificates, or raw environment dumps.
- Client environment access is an explicit allowlist. Server presence does not make a value browser-safe.
- Missing optional credentials must disable the provider or select an explicit safe local transport. Never silently fall back to fake production behavior.
- Production must reject development auth secrets, local callback origins, preview-only assumptions, and seed defaults.

Use Varlock to validate/inject values without treating `.env` as shell code:

```bash
varlock load -- pnpm doctor
```

When sharing diagnostic output, redact values and retain only variable names/state.

## Local HTTPS and authentication

Use <https://darkfactory.localhost> through portless. Trusted HTTPS is required for realistic secure cookies, callback origins, and secure-context browser APIs. Do not bypass certificate warnings or change tests to raw HTTP.

Portless trust is primary. mkcert is fallback-only, and generated private keys remain ignored. Better Auth's base URL and trusted application origin must both match the canonical URL in local development. Test authentication redirects, cookie attributes, session expiry, authorization denial, and recovery flows through the rendered application and network evidence.

## Data and seeded identities

PostgreSQL owns durable application state; features access it through Drizzle repositories and reviewed migrations. Never construct feature-local SQL from untrusted input or mutate production schema at application startup.

The seed identities and `Development123!` password are public test fixtures. Seed/reset commands are permitted only with `APP_ENV=development` or `APP_ENV=test`, and only after confirming the database is disposable. Never put customer, employee, production, or copied personal data in a seed fixture. Use fictional `.test` addresses and placeholders from <https://placehold.co/>.

`pnpm db:reset` is destructive. Environment-name validation does not replace target verification, a snapshot, or human approval for any non-disposable data operation.

## API, provider, and observability rules

- Define oRPC input/output schemas, typed errors, and authorization expectations before handlers.
- Keep handlers thin; they parse transport context, invoke one application operation, and map results.
- Access PostgreSQL through Drizzle stores/repositories and explicit transactions.
- Keep provider SDKs in adapters. Domain/application code must not import provider clients.
- Emit product analytics through the analytics port, traces/metrics through OpenTelemetry, and semantic events through evlog.
- Preserve request and causal identifiers while excluding secrets, tokens, raw sensitive profile fields, credentials, and full provider payloads.
- An observability failure must not turn a successful mutation into a client failure, but it must be inspectable without swallowing security-relevant application errors.

## Capability and deployment safety

A disabled capability must not expose a route, dependency, credential, schema, service, or availability claim. Follow [Capabilities and deployment](capabilities-and-deployment.md) before enabling a provider or Cloudflare resource.

The web deployer is official `@vinext/cloudflare`. The repository does not currently claim an automatic or completed deployment. Alchemy is absent while no ancillary resource is enabled; an empty `finalize()` program is unsafe because it can reconcile/delete prior stage state. See [ADR 0001](adr/0001-vinext-alchemy-boundary.md).

Deployment credentials must never be available to untrusted pull requests. An authorized deployment needs exact-SHA CI evidence, least privilege, environment approval, secret ownership, runtime verification, and rollback evidence.

## Security evidence

Security evidence should cover observable denial and redaction, not source-text assertions alone:

- Unauthenticated access is denied at protected operations.
- Member/admin authorization boundaries are exercised server-side.
- Owner scoping prevents cross-user reads and mutations.
- Invalid and oversized inputs return typed public errors.
- Database constraints and transactions preserve invariants.
- Secure cookie/origin/callback behavior is observed at canonical HTTPS.
- Logs, analytics, traces, reports, and failure artifacts exclude sensitive values.
- Provider-unavailable paths are explicit and do not invent success.
- Seed/reset production guards fail closed.
- Deployment and capability state matches the manifest and environment.

Record commands, browser/network steps, target, revision, artifacts, redactions, and limitations in [the draft evidence map](evidence-map.md). A static scan or unit test is not proof of a live deployment or penetration test.

## Shannon post-build hardening boundary

[Shannon](https://github.com/KeygraphHQ/shannon) is an autonomous white-box pentester that reads source and performs live exploitation against a target. It can mutate data and prove vulnerabilities. DarkFactory permits it only as authorized, source-guided, white-box live exploitation against an isolated source copy and isolated non-production target.

Never run Shannon as black-box reconnaissance, against production, against a shared environment, with production/customer data, or with credentials that reach another system. Repository ownership alone does not authorize every deployed target.

Before execution, the security owner must consult the current official Shannon repository, [configuration guide](https://github.com/KeygraphHQ/shannon/blob/main/docs/configuration.md), and [safety and limitations guide](https://github.com/KeygraphHQ/shannon/blob/main/docs/safety.md). Do not freeze a command from this document: installation, configuration, model/provider, workspace, and safety instructions can change. Record the reviewed Shannon commit/release and source URLs in the run evidence.

A run requires all of the following:

1. Final DarkFactory evidence is green for the exact source SHA; Shannon does not replace core verification.
2. Explicit written authorization identifies target, source, tester, window, techniques, credentials, data-mutation limits, rate/concurrency limits, exclusions, emergency contact, and stop authority.
3. Source and target are isolated from production, with disposable/snapshotted PostgreSQL data, synthetic identities, scoped test credentials, restricted network egress, and no customer data.
4. Rules of engagement define allowed hosts/routes/methods, authentication flows, excluded third parties, destructive-action limits, cost limit, and immediate stop conditions.
5. Evidence handling defines a restricted workspace, secret redaction, retention/deletion, report access, and safe proof-of-concept reproduction.
6. A human monitors the run and can revoke credentials, isolate the target, and stop the process.

The required workflow is authorization and isolation, source-guided run, evidence review, severity/ownership assignment, remediation, focused regression tests, rebuild/redeploy of the isolated target, and a scoped rerun. Findings are not closed by prose or code review alone.

Detailed owners, prerequisites, evidence, rerun requirements, and stop conditions are in the post-build [TODO](../TODO.md).

## Reporting a vulnerability

No repository-specific private reporting channel or support policy is currently documented. Do not invent one. Avoid placing exploit details, credentials, or sensitive evidence in a public issue. Use the repository owner's established private contact mechanism when one is available, and disclose only what that authorized channel permits.
