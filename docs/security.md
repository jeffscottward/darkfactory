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
varlock run -- bun run doctor
```

When sharing diagnostic output, redact values and retain only variable names/state.

## Local HTTPS and authentication

Use <https://darkfactory.localhost> through portless. Trusted HTTPS is required for realistic secure cookies, callback origins, and secure-context browser APIs. Do not bypass certificate warnings or change tests to raw HTTP.

Portless trust is primary. mkcert is fallback-only, and generated private keys remain ignored. Better Auth's base URL and trusted application origin must both match the canonical URL in local development. Test authentication redirects, cookie attributes, session expiry, authorization denial, and recovery flows through the rendered application and network evidence.

## Data and seeded identities

PostgreSQL owns durable application state; features access it through Drizzle repositories and reviewed migrations. Never construct feature-local SQL from untrusted input or mutate production schema at application startup.

The seed identities and `Development123!` password are public test fixtures. Seed/reset commands require a validated `APP_ENV=development` or `APP_ENV=test` and exactly one matching `--confirm-environment=<development|test>` command-line argument. Bun may load `APP_ENV` from `.env`, but dotenv is never authorization and cannot provide the CLI confirmation. Never put customer, employee, production, or copied personal data in a seed fixture. Use fictional `.test` addresses and placeholders from <https://placehold.co/>.

Package scripts intentionally omit confirmation. Use an explicit invocation such as `varlock run -- bun run db:seed -- --confirm-environment=development` or `varlock run -- bun run db:reset -- --confirm-environment=development`. Reset is destructive, and a matching confirmation proves only deliberate invocation; it does not validate `DATABASE_URL`, prove the target disposable, replace a snapshot, or provide human approval for any non-disposable data operation.

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

Deployment credentials must never be available to untrusted pull requests. An authorized deployment needs exact-SHA CI evidence, least privilege, environment approval, secret ownership, runtime verification, and rollback evidence. Before actual deployment, explicitly dispatch full CI on a branch or tag resolving to the intended SHA, verify the observed run's `head_sha` matches it, and require all five lanes to succeed. A successful PR with an identical merged tree is merge evidence, not deployment-SHA execution evidence. This prerequisite is operator policy; the current deploy CLI has no automated GitHub CI/SHA gate.

## Hosted analyzer coverage

Follow the [hosted security bootstrap and rollout transaction](capabilities-and-deployment.md#hosted-security-capabilities). Public active checks cannot opt out. Private CodeQL and Dependency Review require their own exact lowercase `true` repository variables and positive GitHub feature API probes; CodeQL also requires administrator-confirmed licensing. False, missing, or empty private selections are **NOT CONFIGURED / NOT RUN**, never passing scan evidence. Configured-but-unavailable capabilities, invalid values, authentication/network failures, and unknown visibility block the affected check.

Analysis, ingestion, and public publication are separate:

- CodeQL covers repository JavaScript/TypeScript and Actions, not authored Civet. Without configured CodeQL, that hosted analysis is absent.
- Dependency Review enforces the high-severity pull-request dependency-change policy when active; its feature/dependency-graph support must be established independently of CodeQL.
- Free Scorecard analysis always runs, including for private repositories and after a capability-step failure; that failure remains blocking. Only positively verified public repositories may publish Scorecard results. Private or unknown repositories never publish to the public Scorecard service.
- `DF_CODE_SCANNING_UPLOAD_ENABLED` independently requests private SARIF ingestion and requires a positive feature probe. Public ingestion stays active. Disabled ingestion does not authorize private CodeQL analysis, and successful analysis or retained artifacts do not prove ingestion.

The authorization, validation, database, cookie/origin, redaction, and fail-closed production checks below remain mandatory complementary controls, not substitutes for missing hosted coverage. Record each operation's actual state, coverage gap, owner, and exact run/SHA/attempt/conclusion without exposing private results.

Preserve all five verification contexts and protected CodeQL Actions/JavaScript and Dependency Review checks, analyzer matrices/categories, the high-severity threshold, timeouts, least privilege, and compatible immutable action pins. Keep CodeQL `init`, `analyze`, and `upload-sarif` on one reviewed release family. Use `upload: never` for CodeQL analysis and a separate authorized ingestion step. Retain generated CodeQL and Scorecard SARIF artifacts for exactly seven days; artifact upload failures block. Enabled analysis and ingestion fail closed: no `continue-on-error`, success wrappers, or suppressed upload errors. Hosted PR preflight executes only the trusted base's generated helper; merge the helper-only bootstrap under baseline workflows before adopting successor workflows, never through a protection bypass.

### Restricted pull-request tokens

Fork and Dependabot pull-request tokens can be read-only without making read-only preflight unavailable. GitHub documents that [`security-events: read` permits listing code-scanning alerts](https://raw.githubusercontent.com/github/docs/main/data/reusables/actions/github-token-scope-descriptions.md); the [dependency comparison endpoint requires `contents: read`](https://docs.github.com/en/rest/dependency-graph/dependency-review#compare-two-commits). Preserve those declared permissions and the helper's GET-only transport. An actual denied read still blocks: never convert a 401/403 into a successful probe or an actor-specific skip.

GitHub separately [permits CodeQL uploads from `pull_request` workflows with read-only tokens](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/resource-not-accessible). Use the native upload action and keep its failures blocking. This exception is not private CodeQL licensing or a reason to grant fork write tokens, expose secrets, or use `pull_request_target`.

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

Follow the repository's [security policy](../SECURITY.md) for the private reporting channel, scope, and response expectations. Do not disclose suspected vulnerabilities or sensitive evidence in a public issue.
