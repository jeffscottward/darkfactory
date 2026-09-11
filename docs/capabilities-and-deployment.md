# Capabilities and deployment

[`capabilities.yaml`](../capabilities.yaml) records architectural selections and capability intent. Runtime availability still depends on installed code, complete configuration, and a successful focused check. Do not infer availability from a provider name alone.

## Capability truth model

Use these terms consistently:

- **Enabled**: intentionally active for the current environment and backed by its required adapter/configuration.
- **Configured**: all required values are present, but runtime availability still needs verification.
- **Available**: an enabled/configured capability passed its focused runtime check.
- **Disabled**: deliberately inactive and not part of the core runtime.
- **Unknown**: the manifest, environment, dependency, or runtime result cannot establish state.
- **Incompatible**: the installed/versioned implementation fails its declared compatibility check.

Unknown and incompatible are never aliases for disabled or available.

## Current manifest boundary

The manifest currently declares these core selections:

- Bun for repository scripts, pnpm for package/workspace ownership, and Cloudflare Workers for production runtime.
- Vite/vinext on Cloudflare Workers for the web runtime.
- PostgreSQL through Drizzle, with PlanetScale named as the selected portable provider.
- Contract-first oRPC and generated OpenAPI.
- Better Auth.
- Tailwind and shadcn composition.
- evlog and OpenTelemetry, with product analytics behind a PostHog adapter.
- Graphify for developer context.
- portless and PM2 for local HTTPS.
- XState for explicit workflows and Zustand for ephemeral client-local state.

Configuration-sensitive adapters include Groq, Resend, PostHog, and remote OpenTelemetry export. Email preview is the safe local transport; a missing optional provider configuration must disable that provider or select the explicit local adapter, never create a fake production fallback.

The manifest explicitly disables:

- Mintlify documentation and public docs.
- Celery jobs and Flower.
- Uptime Kuma.
- GlitchTip error tracking.
- R2 storage.
- PostgreSQL-backed Memori context graphs.
- pgvector, PostGIS, TimescaleDB, pg_trgm, and pg_cron.

Disabled capabilities must remain removable and must not leave provider dependencies, schema objects, background services, credentials, or user-facing claims in the core. Memori in particular remains a disabled PostgreSQL-backed capability with no core memory tables or authority over application truth.

Run the manifest and prerequisite inspection with:

```bash
varlock run -- bun run doctor
```

The doctor reports required, development-scoped optional, and disabled classifications. Provider groups are reported as optional until their complete environment group exists.

## Enabling a capability

A capability change is a complete vertical change, not a manifest toggle. Before enabling one:

1. Define its user outcome, owner, data authority, provenance, retention, and failure behavior.
2. Prefer a PostgreSQL core feature, then a proven PostgreSQL extension/pattern, before introducing an external system.
3. Define a small provider-neutral port and typed errors at the real external boundary.
4. Add the adapter and only the dependencies required by the enabled capability.
5. Add server-only environment schema/example entries and an explicit client allowlist decision.
6. Add installation, migration, removal, rollback, and secret-rotation instructions.
7. Add deterministic contract/integration tests and an unavailable/misconfigured test.
8. Update `capabilities.yaml`, Graphify, relevant architecture/docs, and generated artifacts together.
9. Run the focused gate and full affected lifecycle; record evidence rather than declaring availability from configuration.

If safe removal would require rewriting the domain, the boundary is wrong or the feature is Core rather than a Capability.

## Hosted security capabilities

GitHub-hosted security capabilities are separate from application capabilities in `capabilities.yaml` and provider environment variables. The canonical read-only preflight runs locally against the actual push destination and as a scoped step within existing hosted analyzer jobs. It verifies repository visibility and positively probes each requested GitHub feature; configuration alone is not proof of availability. See [security-preflight.txt](security-preflight.txt) for entry points, outputs, and bounded API behavior.

Public active CodeQL, Dependency Review, code-scanning ingestion, and free Scorecard analysis cannot opt out. For private repositories, use independent repository Actions variables:

| Variable | Exact lowercase `true` requests |
| --- | --- |
| `DF_CODEQL_ENABLED` | Licensed CodeQL analysis, subject to a positive code-scanning feature probe. |
| `DF_DEPENDENCY_REVIEW_ENABLED` | Dependency Review, subject to a positive dependency feature probe. |
| `DF_CODE_SCANNING_UPLOAD_ENABLED` | SARIF ingestion, independently of analysis and subject to a positive code-scanning feature probe. |

False, missing, or empty private selections mean **NOT CONFIGURED / NOT RUN**, not successful scans. Other spellings, including uppercase, fail the relevant check. Requested capabilities that are unavailable, unauthorized, unreachable, or unknown block; a failed API read is not evidence of an unconfigured feature. Public false/unset selections do not disable active checks. Use the helper's explicit authorized outputs for operation-level conditions, not job-level variable guards or Actions' case-insensitive comparison of raw variables.

Free Scorecard analysis always runs, including on private repositories and after a capability-step failure; keep that failure blocking. Only positively verified public visibility authorizes Scorecard public publication. Private and unknown repositories never public-publish, regardless of upload authorization. Code-scanning ingestion is a separate operation: CodeQL analyzes with `upload: never`, then an authorized upload step ingests SARIF. A disabled upload does not authorize private CodeQL analysis. Artifacts alone are not ingestion.

### Administrator bootstrap and rollout transaction

1. Identify the exact repository, verified visibility, actual default branch, and explicit push destination; never infer the target from a checkout directory or `origin`. Confirm private CodeQL licensing and permitted use separately from technical availability.
2. Inventory effective branch protections, repository/organization rulesets, required check names/app IDs, merge queues, deployment event dependencies, and fork approval policy. Unknown or incompatible event obligations stop adoption. Preserve all five `Verification (core/coverage/integration/graph/browser)` contexts and protected CodeQL Actions/JavaScript and Dependency Review checks; do not remove checks or synthesize scan success.
3. Establish the trusted helper before activating workflows that consume it. If the PR base lacks the canonical helper and its generated Node artifact, first merge a helper-only bootstrap PR under unchanged baseline workflows and protections. Then base the successor-adoption PR on that merged commit. Hosted PR preflight executes the generated Node helper from the exact trusted PR base SHA, never PR-controlled helper code. A missing base helper is a hard failure, not a reason to fall back to the PR copy, weaken checks, or use an administrative bypass.
4. Record independent capability selections, licensing/configuration evidence, owner, and date. With administrator authorization, configure intended private repository variables and read them back on the exact target. Unconfigured private licensed capabilities may remain explicitly **NOT CONFIGURED / NOT RUN**; they must not be relabeled authorized, unsupported, or passed. No subscription purchase, trial activation, settings mutation, or privilege escalation is part of preflight.
5. Run destination-scoped local preflight and retain each capability's actual result. Enabled capabilities require successful bounded read-only probes; authentication, permission, 404, network, malformed-response, and unknown-metadata failures block. Do not turn discovery failures into optional skips. Hosted jobs repeat only their relevant scoped probes using the workflow token and explicit variable environment.
6. Adopt successor workflows only after the bootstrap merge, without changing the five-lane CI event/protection contract. Record exact run URL, SHA, attempt, analysis conclusions, ingestion outcome, and any not-run coverage gaps. An unexercised licensed private path remains unverified, not passed.

Pre-push binds Git's actual destination and every non-deletion pushed ref to the current HEAD and checks that source is clean before validation. Destination-scoped security preflight must pass before immutable `verify:core`, `verify:coverage`, `verify:integration`, `verify:graph`, and `verify:browser` run sequentially. The first failed preflight or lane blocks publication without running the remaining lanes. Success requires all five lanes to pass and a final check that HEAD is unchanged and source is still clean. Missing prerequisites, stale evidence, or detected source mutation blocks publication. Hosted CI still repeats all five lanes in clean runners.

Preserve analyzer matrices/categories, high-severity Dependency Review, timeouts, least privilege, and compatible immutable action pins. Retain generated CodeQL and Scorecard SARIF artifacts for exactly seven days; artifact upload failures block. Every authorized ingestion must succeed; no `continue-on-error`, unconditional success wrappers, or suppressed upload failures.

Reassess visibility/default-branch, licensing, feature configuration, permissions, ruleset, action-version, and variable changes. Rollback must preserve the trusted-helper dependency and required checks, never bypass protections. Local evidence cannot guarantee future hosted service availability or upload permissions. See [Security](security.md) for coverage limits and complementary controls.

## Web deployment

The authored web application has one deployer: official `@vinext/cloudflare`.

```bash
bun run dev:stop
bun run dev:bindings
bun run build
corepack pnpm exec portless darkfactory corepack pnpm --filter @darkfactory/web run start
bun run deploy:web:check
bun run deploy:web:staging:check
bun run deploy:web:staging
bun run deploy:web:preview
bun run deploy:web
```

`bun run build` performs local compilation through the measured Node-backed Vinext compatibility path. The package `start` command serves that output through Vite's Cloudflare Worker preview and inherits Portless's validated `HOST` and `PORT`; it is not deployment evidence. Filesystem email previews are disabled in a production bundle, so a real production configuration must select Resend. `bun run deploy:web:check` validates the top-level Worker configuration without deployment; `bun run deploy:web:staging:check` validates the explicit isolated `staging` environment, and `bun run deploy:web:staging` is its credentialed deploy command. The remote preview and production deploy commands remain separate explicit Cloudflare operations. Run a deploy only with an authorized account, reviewed target, protected environment, correct secrets, a green required CI run for the same SHA, and a rollback owner.

The repository's current GitHub Actions workflow verifies code and uploads Playwright failure artifacts; it does not contain an automatic deployment job. Therefore this repository does not claim that preview or production deployment has occurred. Deployment evidence remains pending until an operator records the target, SHA, command/run URL, output, runtime probe, and rollback result in [the evidence map](evidence-map.md).

Untrusted pull requests must never receive deployment credentials. A future deployment workflow must use least-privilege permissions, an environment approval boundary, exact SHA promotion, and a dependency on the successful verification workflow.

## Alchemy ancillary-resource decision

DarkFactory does not currently enable an ancillary Cloudflare resource. Consequently:

- There is intentionally no `alchemy.run.ts`.
- No Alchemy package or command participates in the current build/deploy path.
- Alchemy 0.93.12 is a source-reviewed compatibility baseline only, not an installed capability or deployment claim.
- The vinext web application is deployed exclusively by `@vinext/cloudflare`.

This absence is a safety property. In Alchemy 0.93.12, `finalize()` reconciles persisted resource IDs and destroys previously persisted resources that are absent from the current program. An otherwise empty program can therefore delete resources from a reused stage; it is not a harmless preview. The 0.93.12 CLI exposes no general `plan`, `preview`, or `--dry-run` operation that would make an empty program safe.

When a real supported ancillary resource is approved, create an Alchemy program only as part of that capability's complete change. Pin and re-review the then-current release, use an isolated stage/state store, declare only the enabled ancillary resources, and keep the vinext web deployment outside the Alchemy program. Deployment and destruction must use the exact same reviewed stage; never test reconciliation against an existing shared stage.

The full source record and consequences are in [ADR 0001](adr/0001-vinext-alchemy-boundary.md).

## Deployment evidence checklist

Do not mark a deployment complete until all applicable fields are observed:

- Exact source SHA and clean generated-artifact checks.
- Terminal CI run URL for that SHA.
- Authorized operator and approved Cloudflare account/environment.
- Deployer and exact version.
- Redacted command/run record and target identifier.
- Build/deployment output artifact.
- Runtime HTTPS probe and representative authenticated/unauthenticated flow.
- Database migration state and rollback compatibility.
- Secret names and rotation owner without secret values.
- Structured event/trace correlation with sensitive data redacted.
- Rollback command/owner and observed result or explicitly unexercised status.

A preview URL is not production evidence. A successful build is not deployment evidence. A deployment command exit code is not a runtime-health or rollback proof.

## Related documents

- [ADR 0001: vinext and Alchemy deployment boundary](adr/0001-vinext-alchemy-boundary.md)
- [Local development](local-development.md)
- [Testing and evidence](testing-and-evidence.md)
- [Security](security.md)
